import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const adminApp = getFirebaseAdminApp();
  if (!adminApp) {
    return NextResponse.json({ error: "Servidor sem Firebase Admin." }, { status: 503 });
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

  await db.doc(`userSettings/${uid}`).update({
    mpAccessToken: FieldValue.delete(),
    mpRefreshToken: FieldValue.delete(),
    mpUserId: FieldValue.delete(),
    mpPublicKey: FieldValue.delete(),
    mpTokenExpiresAt: FieldValue.delete(),
    mpLiveMode: FieldValue.delete(),
    mpConnectedAt: FieldValue.delete(),
    updatedAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}
