import { NextRequest, NextResponse } from "next/server";

import { canonicalPlanLabelFromKey, fetchAdminUserDetail, normalizedPlanKey } from "@/lib/admin-users-metrics";
import { isGeneralAdminEmail } from "@/lib/general-admin";
import { requireGeneralAdminApi } from "@/lib/require-general-admin-api";

export const runtime = "nodejs";
const PLAN_MONTHLY_PRICE_CENTS = {
  starter: 0,
  pro: 12_700,
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
