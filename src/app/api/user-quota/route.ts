import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { readCycleUsage } from "@/lib/cycle-usage";
import { resolveCycleStartMs, resolveQuotaLimit, type PlanKey } from "@/lib/plan-quotas";
import { countProposalsSinceAdmin } from "@/lib/proposals-admin";
import { countReportsSinceAdmin } from "@/lib/reports-admin";

export const runtime = "nodejs";

export type UserQuotaPayload = {
  plan: PlanKey;
  rotas: { limit: number; used: number; isUnlimited: boolean; atLimit: boolean };
  propostas: { limit: number; used: number; isUnlimited: boolean; atLimit: boolean };
};

export async function GET(req: NextRequest) {
  try {
    const adminApp = getFirebaseAdminApp();
    if (!adminApp) {
      return NextResponse.json({ error: "Firebase Admin não configurado." }, { status: 503 });
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Token ausente." }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await getAuth(adminApp).verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    }

    const db = getFirestore(adminApp);
    const userSettingsSnap = await db.collection("userSettings").doc(uid).get();
    const userSettings = userSettingsSnap.exists
      ? (userSettingsSnap.data() as Record<string, unknown>)
      : {};

    const rotasQ = resolveQuotaLimit(userSettings, "rotas");
    const propostasQ = resolveQuotaLimit(userSettings, "propostas");
    const periodStartMs = resolveCycleStartMs(userSettings, Date.now());

    const [rotasDocs, propostasDocs] = await Promise.all([
      rotasQ.isUnlimited ? Promise.resolve(0) : countReportsSinceAdmin(uid, periodStartMs),
      propostasQ.isUnlimited ? Promise.resolve(0) : countProposalsSinceAdmin(uid, periodStartMs),
    ]);
    const rotasCounter = readCycleUsage(userSettings, periodStartMs, "rotas");
    const propostasCounter = readCycleUsage(userSettings, periodStartMs, "propostas");
    const rotasUsed = rotasQ.isUnlimited ? 0 : Math.max(rotasDocs, rotasCounter);
    const propostasUsed = propostasQ.isUnlimited ? 0 : Math.max(propostasDocs, propostasCounter);

    const plan = rotasQ.plan;
    const payload: UserQuotaPayload = {
      plan,
      rotas: {
        limit: rotasQ.limit,
        used: rotasUsed,
        isUnlimited: rotasQ.isUnlimited,
        atLimit: !rotasQ.isUnlimited && rotasUsed >= rotasQ.limit,
      },
      propostas: {
        limit: propostasQ.limit,
        used: propostasUsed,
        isUnlimited: propostasQ.isUnlimited,
        atLimit: !propostasQ.isUnlimited && propostasUsed >= propostasQ.limit,
      },
    };

    return NextResponse.json(payload);
  } catch (e) {
    console.error("[user-quota]", e);
    return NextResponse.json({ error: "Erro ao obter cotas." }, { status: 500 });
  }
}
