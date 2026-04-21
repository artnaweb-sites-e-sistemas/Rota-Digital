import type Stripe from "stripe";

import {
  planKeyToFirestoreLabel,
  subscriptionLineAmountCents,
  type StripeSubscriptionBillingCycle,
  type StripeSubscriptionPlanKey,
} from "@/lib/stripe-subscription-prices";

export async function createSubscriptionCheckoutSession(params: {
  stripe: Stripe;
  origin: string;
  uid: string;
  email: string | null;
  plan: StripeSubscriptionPlanKey;
  billingCycle: StripeSubscriptionBillingCycle;
}): Promise<{ url: string } | { error: string }> {
  const line = subscriptionLineAmountCents(params.plan, params.billingCycle);
  const base = params.origin.replace(/\/$/, "");
  const meta = {
    uid: params.uid,
    checkoutKind: "subscription",
    subscriptionPlan: params.plan,
    billingCycle: params.billingCycle,
  };

  try {
    const session = await params.stripe.checkout.sessions.create({
      mode: "subscription",
      /** Só BRL; sem conversão USD (Adaptive Pricing do Stripe). */
      adaptive_pricing: { enabled: false },
      client_reference_id: params.uid,
      customer_email: params.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: "brl",
            unit_amount: line.unitAmount,
            recurring: { interval: line.interval },
            product_data: {
              name: `Rota Digital — ${planKeyToFirestoreLabel(params.plan)}`,
              description: line.label,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${base}/dashboard?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/assinatura?plan=${params.plan}&cycle=${params.billingCycle}&cancelled=1`,
      metadata: meta,
      subscription_data: {
        metadata: meta,
      },
    });

    if (!session.url) {
      return { error: "Stripe não devolveu URL de checkout." };
    }
    return { url: session.url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar assinatura.";
    console.error("[stripe subscription checkout]", e);
    return { error: msg };
  }
}
