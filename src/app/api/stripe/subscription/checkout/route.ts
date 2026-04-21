import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { getAppOriginFromRequest } from "@/lib/request-origin";
import { createSubscriptionCheckoutSession } from "@/lib/stripe-create-subscription-checkout";
import {
  currentSubscriptionPlanFromSettings,
  parseBillingCycle,
  parseSubscriptionPlanKey,
  shouldSkipStripeSubscriptionCheckout,
} from "@/lib/stripe-subscription-prices";
import { getStripe } from "@/lib/stripe-server";

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
  let email: string | null;
  try {
    const decoded = await getAuth(adminApp).verifyIdToken(token);
    uid = decoded.uid;
    email = typeof decoded.email === "string" ? decoded.email : null;
  } catch {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    plan?: unknown;
    billingCycle?: unknown;
  };
  const plan = parseSubscriptionPlanKey(body.plan);
  const billingCycle = parseBillingCycle(body.billingCycle);
  if (!plan || !billingCycle) {
    return NextResponse.json({ error: "Plano ou ciclo inválido." }, { status: 400 });
  }

  const db = getFirestore(adminApp);
  const settingsSnap = await db.collection("userSettings").doc(uid).get();
  const userSettings = settingsSnap.exists
    ? (settingsSnap.data() as Record<string, unknown>)
    : {};
  const currentPlan = currentSubscriptionPlanFromSettings(userSettings);
  if (shouldSkipStripeSubscriptionCheckout(currentPlan, plan)) {
    return NextResponse.json(
      { ok: true, skipCheckout: true, redirect: "/dashboard" },
      { status: 200 },
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      {
        ok: false,
        setupRequired: true,
        message: "Configure STRIPE_SECRET_KEY no servidor.",
      },
      { status: 503 },
    );
  }

  const origin = getAppOriginFromRequest(req);
  const result = await createSubscriptionCheckoutSession({
    stripe,
    origin,
    uid,
    email,
    plan,
    billingCycle,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ url: result.url });
}
