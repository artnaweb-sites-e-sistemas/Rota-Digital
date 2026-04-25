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

  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID?.trim();

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
  const settingsSnap = await db.doc(`userSettings/${uid}`).get();
  const accountId = (settingsSnap.data() as Record<string, unknown> | undefined)?.stripeConnectAccountId;

  if (!accountId || typeof accountId !== "string") {
    return NextResponse.json({ error: "Nenhuma conta Stripe conectada." }, { status: 400 });
  }

  if (stripeSecret && clientId) {
    try {
      await fetch("https://connect.stripe.com/oauth/deauthorize", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          stripe_user_id: accountId,
          client_secret: stripeSecret,
        }),
      });
    } catch (e) {
      console.error("[stripe-connect-disconnect] Deauthorize failed:", e);
    }
  }

  await db.doc(`userSettings/${uid}`).update({
    stripeConnectAccountId: FieldValue.delete(),
    updatedAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}
