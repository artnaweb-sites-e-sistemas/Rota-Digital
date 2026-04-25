import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { resolvePublicAppBaseUrl } from "@/lib/request-origin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const adminApp = getFirebaseAdminApp();
  if (!adminApp) {
    return NextResponse.redirect(new URL("/dashboard/settings/pagamentos?mp_error=server", req.url));
  }

  const baseUrl = resolvePublicAppBaseUrl(req);
  const appId = process.env.MP_APP_ID?.trim();
  const clientSecret = process.env.MP_CLIENT_SECRET?.trim();

  if (!appId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/dashboard/settings/pagamentos?mp_error=config", baseUrl || req.url),
    );
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard/settings/pagamentos?mp_error=missing_params", baseUrl || req.url),
    );
  }

  let uid: string;
  const db = getFirestore(adminApp);
  const stateRef = db.doc(`oauthStates/${state}`);
  const stateSnap = await stateRef.get();
  const stateData = stateSnap.data() as Record<string, unknown> | undefined;
  if (
    !stateSnap.exists ||
    stateData?.provider !== "mercadopago" ||
    typeof stateData?.uid !== "string" ||
    typeof stateData?.expiresAt !== "number" ||
    Date.now() > stateData.expiresAt
  ) {
    return NextResponse.redirect(
      new URL("/dashboard/settings/pagamentos?mp_error=auth", baseUrl || req.url),
    );
  }
  uid = stateData.uid;
  // Estado OAuth de uso único
  await stateRef.delete().catch(() => null);

  const redirectUri = `${baseUrl}/api/mercadopago/connect/callback`;

  try {
    const tokenRes = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: appId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      console.error("[mp-connect-callback] Token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(
        new URL("/dashboard/settings/pagamentos?mp_error=token", baseUrl || req.url),
      );
    }

    const data = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      user_id?: number;
      expires_in?: number;
      public_key?: string;
      live_mode?: boolean;
    };

    if (!data.access_token || !data.user_id) {
      return NextResponse.redirect(
        new URL("/dashboard/settings/pagamentos?mp_error=no_account", baseUrl || req.url),
      );
    }

    await db.doc(`userSettings/${uid}`).set(
      {
        mpAccessToken: data.access_token,
        mpRefreshToken: data.refresh_token ?? "",
        mpUserId: data.user_id,
        mpPublicKey: data.public_key ?? "",
        mpTokenExpiresAt: Date.now() + (data.expires_in ?? 15552000) * 1000,
        mpLiveMode: data.live_mode ?? false,
        mpConnectedAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true },
    );

    return NextResponse.redirect(
      new URL("/dashboard/settings/pagamentos?mp_connected=true", baseUrl || req.url),
    );
  } catch (e) {
    console.error("[mp-connect-callback] Error:", e);
    return NextResponse.redirect(
      new URL("/dashboard/settings/pagamentos?mp_error=unknown", baseUrl || req.url),
    );
  }
}
