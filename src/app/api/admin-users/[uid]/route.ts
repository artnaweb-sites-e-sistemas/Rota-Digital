import { NextRequest, NextResponse } from "next/server";
import type { Firestore, Query } from "firebase-admin/firestore";

import { canonicalPlanLabelFromKey, fetchAdminUserDetail, normalizedPlanKey } from "@/lib/admin-users-metrics";
import { isGeneralAdminEmail } from "@/lib/general-admin";
import { requireGeneralAdminApi } from "@/lib/require-general-admin-api";
import { proPlanReferenceMonthlyCentsForUi } from "@/lib/stripe-subscription-prices";

export const runtime = "nodejs";
const PLAN_MONTHLY_PRICE_CENTS = {
  starter: 0,
  get pro() {
    return proPlanReferenceMonthlyCentsForUi();
  },
  agency: 34_700,
  master: 0,
} as const;

/** Valor alto para compatibilidade; o limite real de leads é ignorado quando o plano é Master. */
const PLAN_LEADS_MONTHLY_LIMIT = {
  starter: 30,
  pro: 50,
  agency: 100,
  master: 999_999_999,
} as const;

type RouteContext = { params: Promise<{ uid: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const gate = await requireGeneralAdminApi(request);
  if (!gate.ok) return gate.response;

  const { uid } = await context.params;
  if (!uid?.trim()) {
    return NextResponse.json({ error: "UID inválido." }, { status: 400 });
  }

  const detail = await fetchAdminUserDetail(gate.ctx.db, gate.ctx.auth, uid.trim());
  if (!detail) {
    return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });
  }
  return NextResponse.json(detail);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const gate = await requireGeneralAdminApi(request);
  if (!gate.ok) return gate.response;

  const { uid } = await context.params;
  if (!uid?.trim()) {
    return NextResponse.json({ error: "UID inválido." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const payload = body as { disabled?: unknown; plan?: unknown };
  const hasDisabled = "disabled" in payload;
  const hasPlan = "plan" in payload;
  if (!hasDisabled && !hasPlan) {
    return NextResponse.json({ error: "Envie `disabled` e/ou `plan`." }, { status: 400 });
  }

  if (hasDisabled) {
    const disabled = payload.disabled;
    if (typeof disabled !== "boolean") {
      return NextResponse.json({ error: "`disabled` deve ser boolean." }, { status: 400 });
    }
    try {
      await gate.ctx.auth.updateUser(uid.trim(), { disabled });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao atualizar conta.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    /**
     * Uma ação manual do admin sobrepõe qualquer suspensão automática:
     * assim o webhook não vai "reativar" a conta numa próxima sincronização caso o admin a tenha desativado de propósito.
     * Idem ao contrário: se admin reativa, desligamos a flag de suspensão automática.
     */
    try {
      await gate.ctx.db
        .collection("userSettings")
        .doc(uid.trim())
        .set(
          {
            autoSuspended: false,
            autoSuspendedReason: null,
            autoSuspendedAtMs: null,
            autoSuspendedPlanSnapshot: null,
            adminDisabledAtMs: disabled ? Date.now() : null,
          },
          { merge: true },
        );
    } catch (e) {
      console.error("[admin-users PATCH] clear autoSuspended", e);
    }
  }

  if (hasPlan) {
    const rawPlan = typeof payload.plan === "string" ? payload.plan.trim() : "";
    if (!rawPlan) {
      return NextResponse.json({ error: "`plan` deve ser string não vazia." }, { status: 400 });
    }
    const planKey = normalizedPlanKey(rawPlan);
    if (planKey === "master") {
      let targetEmail: string | null = null;
      try {
        const rec = await gate.ctx.auth.getUser(uid.trim());
        targetEmail = rec.email ?? null;
      } catch {
        return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });
      }
      if (!isGeneralAdminEmail(targetEmail)) {
        return NextResponse.json(
          { error: "O Plano Master só pode ser atribuído à conta do administrador geral do sistema." },
          { status: 403 },
        );
      }
    }
    const canonical = canonicalPlanLabelFromKey(planKey);
    await gate.ctx.db
      .collection("userSettings")
      .doc(uid.trim())
      .set(
        {
          plan: canonical,
          subscriptionPlan: canonical,
          planPriceCents: PLAN_MONTHLY_PRICE_CENTS[planKey],
          subscriptionPriceCents: PLAN_MONTHLY_PRICE_CENTS[planKey],
          leadCaptureMonthlyLimit: PLAN_LEADS_MONTHLY_LIMIT[planKey],
          planMasterUnlimited: planKey === "master" ? true : false,
          subscriptionCycleAnchorAt: Date.now(),
          autoSuspended: false,
          autoSuspendedReason: null,
          autoSuspendedAtMs: null,
          autoSuspendedPlanSnapshot: null,
        },
        { merge: true },
      );
  }

  const detail = await fetchAdminUserDetail(gate.ctx.db, gate.ctx.auth, uid.trim());
  if (!detail) {
    return NextResponse.json({ error: "Utilizador não encontrado após atualização." }, { status: 404 });
  }
  return NextResponse.json(detail);
}

const DELETE_BATCH_SIZE = 400;
const DELETE_MAX_BATCHES = 50;

/**
 * Apaga em lotes todos os documentos que correspondem a uma query, até esgotar ou atingir um tecto.
 * Devolve o número de documentos removidos.
 */
async function deleteQueryInBatches(db: Firestore, query: Query): Promise<number> {
  let totalDeleted = 0;
  for (let i = 0; i < DELETE_MAX_BATCHES; i++) {
    const snap = await query.limit(DELETE_BATCH_SIZE).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    totalDeleted += snap.size;
    if (snap.size < DELETE_BATCH_SIZE) break;
  }
  return totalDeleted;
}

/**
 * Apaga permanentemente o utilizador:
 * - Firestore: userSettings, reports, proposals, leads, stripeInvoices, stripeCheckoutSessions.
 * - Firebase Auth: o próprio user record.
 *
 * Só pode ser chamado quando a conta está desativada (proteção contra cliques acidentais).
 * O email do utilizador fica livre para voltar a registar-se do zero.
 *
 * Atenção: operação irreversível. As faturas Stripe persistem na Stripe para auditoria —
 * o que apagamos aqui é apenas a cópia interna usada pelo painel admin.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const gate = await requireGeneralAdminApi(request);
  if (!gate.ok) return gate.response;

  const { uid } = await context.params;
  const trimmed = uid?.trim() ?? "";
  if (!trimmed) {
    return NextResponse.json({ error: "UID inválido." }, { status: 400 });
  }

  /** Bloqueia auto-exclusão e exclusão do admin geral. */
  let targetEmail: string | null = null;
  try {
    const rec = await gate.ctx.auth.getUser(trimmed);
    targetEmail = rec.email ?? null;
    if (!rec.disabled) {
      return NextResponse.json(
        {
          error:
            "A conta precisa de estar desativada antes de ser excluída. Clica primeiro em 'Desativar conta'.",
        },
        { status: 409 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });
  }

  if (isGeneralAdminEmail(targetEmail)) {
    return NextResponse.json(
      { error: "Não é permitido excluir a conta do administrador geral." },
      { status: 403 },
    );
  }

  const db = gate.ctx.db;
  const removed = {
    reports: 0,
    proposals: 0,
    leads: 0,
    stripeInvoices: 0,
    stripeCheckoutSessions: 0,
  };

  try {
    removed.reports = await deleteQueryInBatches(
      db,
      db.collection("reports").where("userId", "==", trimmed),
    );
    removed.proposals = await deleteQueryInBatches(
      db,
      db.collection("proposals").where("userId", "==", trimmed),
    );
    removed.leads = await deleteQueryInBatches(
      db,
      db.collection("leads").where("userId", "==", trimmed),
    );
    removed.stripeInvoices = await deleteQueryInBatches(
      db,
      db.collection("stripeInvoices").where("uid", "==", trimmed),
    );
    removed.stripeCheckoutSessions = await deleteQueryInBatches(
      db,
      db.collection("stripeCheckoutSessions").where("uid", "==", trimmed),
    );
    await db.collection("userSettings").doc(trimmed).delete();
  } catch (e) {
    console.error("[admin-users DELETE] firestore", e);
    const msg = e instanceof Error ? e.message : "Falha ao apagar dados no Firestore.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  try {
    await gate.ctx.auth.deleteUser(trimmed);
  } catch (e) {
    console.error("[admin-users DELETE] auth", e);
    const msg = e instanceof Error ? e.message : "Falha ao apagar o utilizador no Firebase Auth.";
    return NextResponse.json(
      {
        error: `Dados apagados no Firestore, mas falhou remover do Firebase Auth: ${msg}`,
        firestoreRemoved: removed,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, uid: trimmed, firestoreRemoved: removed });
}
