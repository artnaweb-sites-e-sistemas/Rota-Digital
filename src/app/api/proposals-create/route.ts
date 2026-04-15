import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { createProposalAdmin } from "@/lib/proposals-admin";
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

    const proposalId = await createProposalAdmin(proposal, uid, { advanceLeadStatusTo: "Proposta" });
    return NextResponse.json({ ok: true, proposalId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar proposta.";
    console.error("[proposals-create]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
