import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const adminApp = getFirebaseAdminApp();
  if (!adminApp) {
    return NextResponse.redirect(new URL("/dashboard/settings/pagamentos?error=server", req.url));
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim() ?? "";
  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeSecret) {
    return NextResponse.redirect(new URL("/dashboard/settings/pagamentos?error=config", baseUrl || req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard/settings/pagamentos?error=missing_params", baseUrl || req.url),
    );
  }

  let uid: string;
  try {
    const decoded = await getAuth(adminApp).verifyIdToken(state);
    uid = decoded.uid;
  } catch {
    return NextResponse.redirect(
      new URL("/dashboard/settings/pagamentos?error=auth", baseUrl || req.url),
    );
  }

  try {
    const tokenRes = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_secret: stripeSecret,
      }),
    });

    if (!tokenRes.ok) {
      console.error("[stripe-connect-callback] Token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(
        new URL("/dashboard/settings/pagamentos?error=stripe", baseUrl || req.url),
      );
    }

    const tokenData = (await tokenRes.json()) as { stripe_user_id?: string };
    const stripeUserId = tokenData.stripe_user_id;

    if (!stripeUserId) {
      return NextResponse.redirect(
        new URL("/dashboard/settings/pagamentos?error=no_account", baseUrl || req.url),
      );
    }

    const db = getFirestore(adminApp);
    await db.doc(`userSettings/${uid}`).set(
      { stripeConnectAccountId: stripeUserId, updatedAt: new Date() },
      { merge: true },
    );

    return NextResponse.redirect(
      new URL("/dashboard/settings/pagamentos?connected=true", baseUrl || req.url),
    );
  } catch (e) {
    console.error("[stripe-connect-callback] Error:", e);
    return NextResponse.redirect(
      new URL("/dashboard/settings/pagamentos?error=unknown", baseUrl || req.url),
    );
  }
}
