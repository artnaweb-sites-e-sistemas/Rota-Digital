import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { getPlatformSeriesForAdminQuery } from "@/lib/admin-platform-series";
import { parseAdminPlatformSeriesQuery } from "@/lib/admin-platform-series-query";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { isGeneralAdminEmail } from "@/lib/general-admin";

export const runtime = "nodejs";

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

    const q = parseAdminPlatformSeriesQuery(request.nextUrl.searchParams);
    const userId = request.nextUrl.searchParams.get("userId")?.trim() || undefined;
    const db = getFirestore(adminApp);
    const body = await getPlatformSeriesForAdminQuery(db, q, userId);
    return NextResponse.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao obter série temporal.";
    console.error("[admin-platform-series]", e);
    const userId = request.nextUrl.searchParams.get("userId")?.trim();
    const needsUserIndexes =
      Boolean(userId) && /FAILED_PRECONDITION|requires an index/i.test(msg);
    const hint = needsUserIndexes
      ? " São necessários índices compostos (âmbito Coleção) em reports, proposals e leads: userId (Asc) + createdAt (Asc). Na consola Firestore > Índices, crie os que faltam ou use o link do erro; no projeto há firestore.indexes.json — firebase deploy --only firestore:indexes."
      : "";
    return NextResponse.json({ error: `${msg}${hint}` }, { status: 500 });
  }
}
