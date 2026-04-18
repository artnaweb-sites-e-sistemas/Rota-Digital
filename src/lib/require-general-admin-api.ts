import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { isGeneralAdminEmail } from "@/lib/general-admin";
import type { App } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

export type GeneralAdminContext = {
  adminApp: App;
  auth: Auth;
  db: Firestore;
  callerEmail: string;
};

export async function requireGeneralAdminApi(request: NextRequest): Promise<
  | { ok: true; ctx: GeneralAdminContext }
  | { ok: false; response: NextResponse }
> {
  const adminApp = getFirebaseAdminApp();
  if (!adminApp) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Servidor sem Firebase Admin (`FIREBASE_SERVICE_ACCOUNT_JSON`)." },
        { status: 503 },
      ),
    };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Token ausente. Faça login novamente." }, { status: 401 }) };
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
    return { ok: false, response: NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 }) };
  }

  if (!isGeneralAdminEmail(callerEmail)) {
    return { ok: false, response: NextResponse.json({ error: "Sem permissão." }, { status: 403 }) };
  }

  return {
    ok: true,
    ctx: {
      adminApp,
      auth: getAuth(adminApp),
      db: getFirestore(adminApp),
      callerEmail: callerEmail!,
    },
  };
}
