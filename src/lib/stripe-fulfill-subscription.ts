import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type Stripe from "stripe";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { getStripe } from "@/lib/stripe-server";
import {
  parseBillingCycle,
  parseSubscriptionPlanKey,
  planKeyToFirestoreLabel,
  subscriptionLeadLimitForPlan,
  subscriptionMonthlyEquivalentCents,
  type StripeSubscriptionBillingCycle,
} from "@/lib/stripe-subscription-prices";

const USER_SETTINGS = "userSettings";
const PROCESSED = "stripeCheckoutSessions";

/**
 * Atualiza plano e IDs Stripe após checkout de assinatura pago.
 */
export async function fulfillStripeSubscriptionIfPaid(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode !== "subscription") return;
  if (session.metadata?.checkoutKind !== "subscription") return;
  if (session.payment_status !== "paid") return;

  const uid = session.metadata?.uid ?? session.client_reference_id ?? "";
  const plan = parseSubscriptionPlanKey(session.metadata?.subscriptionPlan);
  const cycle = parseBillingCycle(session.metadata?.billingCycle);
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
  const customerId = typeof session.customer === "string" ? session.customer : null;

  if (!uid.trim() || !plan || !cycle || !subscriptionId || !customerId) {
    console.warn("[stripe fulfill sub] metadata incompleta", session.id);
    return;
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    console.error("[stripe fulfill sub] Firebase Admin indisponível");
    return;
  }

  const db = getFirestore(app);
  const sessionRef = db.collection(PROCESSED).doc(session.id);

  let previousSubId: string | null = null;

  await db.runTransaction(async (tx) => {
    const done = await tx.get(sessionRef);
    if (done.exists) return;

    const userRef = db.collection(USER_SETTINGS).doc(uid.trim());
    const userSnap = await tx.get(userRef);
    const prev = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
    const old = prev.stripeSubscriptionId;
    if (typeof old === "string" && old.trim() && old !== subscriptionId) {
      previousSubId = old.trim();
    }

    const label = planKeyToFirestoreLabel(plan);
    const monthlyCents = subscriptionMonthlyEquivalentCents(plan, cycle as StripeSubscriptionBillingCycle);
    const leads = subscriptionLeadLimitForPlan(plan);

    tx.set(
      userRef,
      {
        plan: label,
        subscriptionPlan: label,
        planPriceCents: monthlyCents,
        subscriptionPriceCents: monthlyCents,
        leadCaptureMonthlyLimit: leads,
        planMasterUnlimited: false,
        subscriptionCycleAnchorAt: Date.now(),
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripeSubscriptionPlanKey: plan,
        stripeBillingCycle: cycle,
      },
      { merge: true },
    );

    tx.set(sessionRef, {
      uid: uid.trim(),
      kind: "subscription",
      plan,
      billingCycle: cycle,
      subscriptionId,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  if (previousSubId) {
    const stripe = getStripe();
    if (stripe) {
      try {
        await stripe.subscriptions.cancel(previousSubId);
      } catch (e) {
        console.error("[stripe fulfill sub] cancelar assinatura anterior", e);
      }
    }
  }
}
