import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import {
  deleteLeadAdmin,
  getLeadByIdForUserAdmin,
  leadCaptureBlockEntriesFromLead,
  upsertLeadCaptureBlocksAdmin,
} from "@/lib/leads-admin";

export const runtime = "nodejs";

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

    const body = (await req.json().catch(() => ({}))) as { leadId?: unknown };
    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    if (!leadId) {
      return NextResponse.json({ error: "Lead inválido." }, { status: 400 });
    }

    const lead = await getLeadByIdForUserAdmin(uid, leadId);
    if (!lead) {
      return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
    }

    const blockEntries = leadCaptureBlockEntriesFromLead(lead);
    await upsertLeadCaptureBlocksAdmin(uid, blockEntries);
    await deleteLeadAdmin(lead.id);

    return NextResponse.json({
      ok: true,
      blockedKeys: blockEntries.length,
      deletedLeadId: lead.id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao excluir lead.";
    console.error("[leads-delete]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
