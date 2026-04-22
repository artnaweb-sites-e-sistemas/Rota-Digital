import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { authRecordToAdminListedUserBase, enrichAdminUsersWithMetrics } from "@/lib/admin-users-metrics";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { isGeneralAdminEmail } from "@/lib/general-admin";
import type { AdminUsersListResponse } from "@/types/admin-user-list";

export const runtime = "nodejs";

const PAGE_SIZE = 100;

type AdminApp = NonNullable<ReturnType<typeof getFirebaseAdminApp>>;

async function authorizeGeneralAdminRequest(
  req: NextRequest,
): Promise<{ adminApp: AdminApp } | { error: NextResponse }> {
  const adminApp = getFirebaseAdminApp();
  if (!adminApp) {
    return {
      error: NextResponse.json(
        { error: "Servidor sem Firebase Admin (`FIREBASE_SERVICE_ACCOUNT_JSON`)." },
        { status: 503 },
      ),
    };
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return { error: NextResponse.json({ error: "Token ausente. Faça login novamente." }, { status: 401 }) };
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
    return { error: NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 }) };
  }

  if (!isGeneralAdminEmail(callerEmail)) {
    return { error: NextResponse.json({ error: "Sem permissão para esta operação." }, { status: 403 }) };
  }

  return { adminApp };
}

export async function GET(req: NextRequest) {
  try {
    const authz = await authorizeGeneralAdminRequest(req);
    if ("error" in authz) return authz.error;
    const { adminApp } = authz;

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
    console.error("[admin-users GET]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authz = await authorizeGeneralAdminRequest(req);
    if ("error" in authz) return authz.error;
    const { adminApp } = authz;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Corpo JSON inválido." }, { status: 400 });
    }

    const raw = body as Record<string, unknown>;
    const email = typeof raw.email === "string" ? raw.email.trim() : "";
    const password = typeof raw.password === "string" ? raw.password : "";
    const displayNameRaw = typeof raw.displayName === "string" ? raw.displayName.trim() : "";

    if (!email) {
      return NextResponse.json({ error: "Indique o e-mail." }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "A palavra-passe deve ter pelo menos 6 caracteres." },
        { status: 400 },
      );
    }

    const auth = getAuth(adminApp);
    const db = getFirestore(adminApp);
    try {
      const record = await auth.createUser({
        email,
        password,
        displayName: displayNameRaw || undefined,
        emailVerified: false,
      });
      try {
        await db.collection("userSettings").doc(record.uid).set(
          {
            plan: "Starter",
            subscriptionPlan: "Starter",
            planPriceCents: 0,
            subscriptionPriceCents: 0,
            leadCaptureMonthlyLimit: 30,
            planMasterUnlimited: false,
            subscriptionCycleAnchorAt: Date.now(),
          },
          { merge: true },
        );
      } catch (settingsErr) {
        try {
          await auth.deleteUser(record.uid);
        } catch (rollbackErr) {
          console.error("[admin-users POST] rollback deleteUser after userSettings failure", rollbackErr);
        }
        const msg = settingsErr instanceof Error ? settingsErr.message : "Erro ao guardar definições iniciais.";
        console.error("[admin-users POST] userSettings for new user", settingsErr);
        return NextResponse.json({ error: msg }, { status: 500 });
      }
      return NextResponse.json({ uid: record.uid, email: record.email ?? email });
    } catch (e: unknown) {
      const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: string }).code) : "";
      if (code === "auth/email-already-exists") {
        return NextResponse.json({ error: "Este e-mail já está registado." }, { status: 409 });
      }
      if (code === "auth/invalid-email") {
        return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
      }
      if (code === "auth/weak-password") {
        return NextResponse.json({ error: "Palavra-passe demasiado fraca." }, { status: 400 });
      }
      const msg = e instanceof Error ? e.message : "Erro ao criar utilizador.";
      console.error("[admin-users POST]", e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar utilizador.";
    console.error("[admin-users POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
