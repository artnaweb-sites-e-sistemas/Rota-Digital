import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { getAppOriginFromRequest } from "@/lib/request-origin";
import { createAddOnCheckoutSession, type StripeAddOnKind } from "@/lib/stripe-add-on-checkout";
import { getStripe } from "@/lib/stripe-server";

export async function runStripeAddOnCheckout(
  req: NextRequest,
  kind: StripeAddOnKind,
  packId: string,
): Promise<NextResponse> {
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
  let email: string | null;
  try {
    const decoded = await getAuth(adminApp).verifyIdToken(token);
    uid = decoded.uid;
    email = typeof decoded.email === "string" ? decoded.email : null;
  } catch {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      {
        ok: false,
        setupRequired: true,
        packId,
        message:
          "Configure STRIPE_SECRET_KEY no ambiente do servidor para ativar o checkout Stripe.",
      },
      { status: 503 },
    );
  }

  const origin = getAppOriginFromRequest(req);
  const result = await createAddOnCheckoutSession({
    stripe,
    origin,
    uid,
    email,
    kind,
    packId,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ url: result.url });
}
