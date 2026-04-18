import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { isGeneralAdminEmail } from "@/lib/general-admin";

export const runtime = "nodejs";

const REPORTS_COLLECTION = "reports";
const PROPOSALS_COLLECTION = "proposals";
const LEADS_COLLECTION = "leads";

async function countCollection(db: Firestore, name: string): Promise<number> {
  const snap = await db.collection(name).count().get();
  return snap.data().count;
}

export async function GET(request: NextRequest) {
  try {
    const adminApp = getFirebaseAdminApp();
    if (!adminApp) {
      return NextResponse.json(
        { error: "Servidor sem Firebase Admin (`FIREBASE_SERVICE_ACCOUNT_JSON`)." },
        { status: 503 },
      );
    }

    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Token ausente. Faça login novamente." }, { status: 401 });
    }

    let callerEmail: string | null = null;
    try {
      const decoded = await getAuth(adminApp).verifyIdToken(token);
      callerEmail = decoded.email ?? null;
      if (!callerEmail?.trim()) {
        const rec = await getAuth(adminApp).getUser(decoded.uid);
        callerEmail = rec.email ?? null;
      }
    } catch {
      return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    if (!isGeneralAdminEmail(callerEmail)) {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }

    const db = getFirestore(adminApp);
    const [reportsCount, proposalsCount, leadsCount] = await Promise.all([
      countCollection(db, REPORTS_COLLECTION),
      countCollection(db, PROPOSALS_COLLECTION),
      countCollection(db, LEADS_COLLECTION),
    ]);

    return NextResponse.json({
      reportsCount,
      proposalsCount,
      leadsCount,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao obter estatísticas.";
    console.error("[admin-platform-stats]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
