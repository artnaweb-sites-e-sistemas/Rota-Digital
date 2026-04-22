import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { fulfillStripeAddOnIfPaid } from "@/lib/stripe-fulfill-add-on";
import {
  fulfillStripeSubscriptionFromStripeSubscription,
  fulfillStripeSubscriptionIfPaid,
} from "@/lib/stripe-fulfill-subscription";
import {
  recordStripeInvoicePaid,
  recordStripeInvoicePaymentFailed,
} from "@/lib/stripe-record-invoice";
import { recordStripeChargeRefunded } from "@/lib/stripe-record-refund";
import { getStripe } from "@/lib/stripe-server";
import { syncStripeSubscriptionState } from "@/lib/stripe-sync-subscription";

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
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        await fulfillStripeAddOnIfPaid(session);
        await fulfillStripeSubscriptionIfPaid(session);
        break;
      }
      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        await fulfillStripeSubscriptionFromStripeSubscription(subscription);
        /**
         * Também sincroniza status inicial — cobre cenários em que `created` já vem `active`
         * (sem `checkout.session.completed` a preceder em webhooks async).
         */
        await syncStripeSubscriptionState(subscription);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncStripeSubscriptionState(subscription);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await recordStripeInvoicePaid(invoice, event.id ?? null);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await recordStripeInvoicePaymentFailed(invoice, event.id ?? null);
        break;
      }
      case "charge.refunded":
      case "charge.refund.updated": {
        /**
         * `charge.refunded` dispara quando um refund é criado/aplicado sobre um Charge.
         * `charge.refund.updated` cobre transições (ex: pending → succeeded).
         * Em ambos re-obtemos o Charge com `refunds` expandidos para garantir o estado completo.
         */
        let chargeId: string | null = null;
        if (event.type === "charge.refunded") {
          const c = event.data.object as Stripe.Charge;
          chargeId = c.id ?? null;
        } else {
          const refund = event.data.object as Stripe.Refund;
          chargeId =
            typeof refund.charge === "string" ? refund.charge : refund.charge?.id ?? null;
        }
        if (chargeId) {
          try {
            const charge = await stripe.charges.retrieve(chargeId, { expand: ["refunds"] });
            await recordStripeChargeRefunded(charge, event.id ?? null);
          } catch (e) {
            console.error("[stripe webhook] charge refund retrieve", e);
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[stripe webhook] handler", event.type, e);
    return NextResponse.json({ error: "Falha ao processar evento Stripe." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
