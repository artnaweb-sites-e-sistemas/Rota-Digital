import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { authRecordToAdminListedUserBase, enrichAdminUsersWithMetrics } from "@/lib/admin-users-metrics";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { isGeneralAdminEmail } from "@/lib/general-admin";
import type { AdminUsersListResponse } from "@/types/admin-user-list";

export const runtime = "nodejs";

const PAGE_SIZE = 100;

export async function GET(req: NextRequest) {
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
      return NextResponse.json({ error: "Sem permissão para listar utilizadores." }, { status: 403 });
    }

    const pageToken = req.nextUrl.searchParams.get("pageToken")?.trim() || undefined;
    const listResult = await getAuth(adminApp).listUsers(PAGE_SIZE, pageToken);
    const baseUsers = listResult.users.map(authRecordToAdminListedUserBase);
    const db = getFirestore(adminApp);
    const users = await enrichAdminUsersWithMetrics(db, baseUsers);

    const body: AdminUsersListResponse = {
      users,
      nextPageToken: listResult.pageToken ?? null,
    };

    return NextResponse.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao listar utilizadores.";
    console.error("[admin-users]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
