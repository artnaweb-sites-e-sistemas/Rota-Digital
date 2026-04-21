import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { fulfillStripeAddOnIfPaid } from "@/lib/stripe-fulfill-add-on";
import {
  fulfillStripeSubscriptionFromStripeSubscription,
  fulfillStripeSubscriptionIfPaid,
} from "@/lib/stripe-fulfill-subscription";
import { getStripe } from "@/lib/stripe-server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !whSecret) {
    console.error("[stripe webhook] STRIPE_SECRET_KEY ou STRIPE_WEBHOOK_SECRET ausente.");
    return NextResponse.json({ error: "Webhook Stripe não configurado." }, { status: 503 });
  }

  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Assinatura ausente." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, whSecret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Assinatura inválida.";
    console.error("[stripe webhook]", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await fulfillStripeAddOnIfPaid(session);
      await fulfillStripeSubscriptionIfPaid(session);
    } else if (event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      await fulfillStripeAddOnIfPaid(session);
      await fulfillStripeSubscriptionIfPaid(session);
    } else if (event.type === "customer.subscription.created") {
      const subscription = event.data.object as Stripe.Subscription;
      await fulfillStripeSubscriptionFromStripeSubscription(subscription);
    }
  } catch (e) {
    console.error("[stripe webhook] fulfill", e);
    return NextResponse.json({ error: "Falha ao aplicar pagamento." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
