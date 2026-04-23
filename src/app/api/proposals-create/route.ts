import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { incrementCycleUsageAdmin, readCycleUsage } from "@/lib/cycle-usage";
import {
  PROPOSALS_ADD_ON_PACKS,
  resolveCycleStartMs,
  resolveQuotaLimit,
} from "@/lib/plan-quotas";
import { countProposalsSinceAdmin, createProposalAdmin } from "@/lib/proposals-admin";
import type { Proposal } from "@/types/proposal";

export const runtime = "nodejs";

type CreateProposalBody = {
  proposal?: Omit<Proposal, "id">;
};

export async function POST(req: NextRequest) {
  try {
    const adminApp = getFirebaseAdminApp();
    if (!adminApp) {
      return NextResponse.json(
        { error: "Servidor sem Firebase Admin (`FIREBASE_SERVICE_ACCOUNT_JSON`)." },
        { status: 503 },
      );
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Token ausente. Faça login novamente." }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await getAuth(adminApp).verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as CreateProposalBody;
    const proposal = body?.proposal;

    if (!proposal || typeof proposal !== "object") {
      return NextResponse.json({ error: "Payload da proposta inválido." }, { status: 400 });
    }

    const db = getFirestore(adminApp);
    const userSettingsSnap = await db.collection("userSettings").doc(uid).get();
    const userSettings = userSettingsSnap.exists
      ? (userSettingsSnap.data() as Record<string, unknown>)
      : {};
    const quota = resolveQuotaLimit(userSettings, "propostas");
    const periodStartMs = resolveCycleStartMs(userSettings, Date.now());
    if (!quota.isUnlimited) {
      const [docsUsed, counterUsed] = await Promise.all([
        countProposalsSinceAdmin(uid, periodStartMs),
        Promise.resolve(readCycleUsage(userSettings, periodStartMs, "propostas")),
      ]);
      const usedThisCycle = Math.max(docsUsed, counterUsed);
      if (usedThisCycle >= quota.limit) {
        return NextResponse.json(
          {
            error:
              "Você atingiu o limite de propostas do seu ciclo atual. Amplie a cota para criar novas propostas.",
            code: "PROPOSALS_LIMIT_REACHED",
            plan: quota.plan,
            monthlyLimit: quota.limit,
            usedThisMonth: usedThisCycle,
            addOnPacks: PROPOSALS_ADD_ON_PACKS,
          },
          { status: 429 },
        );
      }
    }

    const proposalId = await createProposalAdmin(proposal, uid, { advanceLeadStatusTo: "Proposta" });

    if (!quota.isUnlimited) {
      try {
        const docsUsed = await countProposalsSinceAdmin(uid, periodStartMs);
        await incrementCycleUsageAdmin({
          uid,
          resource: "propostas",
          cycleStartMs: periodStartMs,
          by: 1,
          /** Seed com a contagem já existente (inclui a recém-criada) menos 1 para
           *  preservar o valor incrementado. Evita que o contador regrida em quem
           *  já tinha propostas criadas antes deste recurso. */
          seed: Math.max(0, docsUsed),
        });
      } catch (counterErr) {
        console.error("[proposals-create] falha ao incrementar cycleUsage", counterErr);
      }
    }

    return NextResponse.json({ ok: true, proposalId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar proposta.";
    console.error("[proposals-create]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
