import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import type Stripe from "stripe";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { LEAD_CAPTURE_ADD_ON_PACKS, resolveMonthlyLeadLimit } from "@/lib/lead-capture-config";
import { PROPOSALS_ADD_ON_PACKS, ROTAS_ADD_ON_PACKS } from "@/lib/plan-quotas";
import type { StripeAddOnKind } from "@/lib/stripe-add-on-checkout";
import { getStripe } from "@/lib/stripe-server";
import type { StoredStripeInvoice, StoredStripeInvoiceLine } from "@/types/stripe-invoice";

const USER_SETTINGS = "userSettings";
const PROCESSED = "stripeCheckoutSessions";
const INVOICES = "stripeInvoices";

function monthKeyUtc(): string {
  return new Date().toISOString().slice(0, 7);
}

function expectedAmountCentsForPack(kind: StripeAddOnKind, packId: string): number | null {
  if (kind === "lead_capture") {
    const pack = LEAD_CAPTURE_ADD_ON_PACKS.find((p) => p.id === packId);
    return pack ? Math.round(pack.price * 100) : null;
  }
  if (kind === "rotas") {
    const pack = ROTAS_ADD_ON_PACKS.find((p) => p.id === packId);
    return pack ? Math.round(pack.price * 100) : null;
  }
  const pack = PROPOSALS_ADD_ON_PACKS.find((p) => p.id === packId);
  return pack ? Math.round(pack.price * 100) : null;
}

function packUnitsForKind(kind: StripeAddOnKind, packId: string): number {
  if (kind === "lead_capture") {
    const pack = LEAD_CAPTURE_ADD_ON_PACKS.find((p) => p.id === packId);
    return pack ? pack.leads : 0;
  }
  if (kind === "rotas") {
    const pack = ROTAS_ADD_ON_PACKS.find((p) => p.id === packId);
    return pack ? pack.rotas : 0;
  }
  const pack = PROPOSALS_ADD_ON_PACKS.find((p) => p.id === packId);
  return pack ? pack.proposals : 0;
}

function packDescription(kind: StripeAddOnKind, packId: string): string {
  if (kind === "lead_capture") {
    const pack = LEAD_CAPTURE_ADD_ON_PACKS.find((p) => p.id === packId);
    return pack ? `Leads — ${pack.label} (+${pack.leads})` : "Pacote de leads";
  }
  if (kind === "rotas") {
    const pack = ROTAS_ADD_ON_PACKS.find((p) => p.id === packId);
    return pack ? `Rotas — ${pack.label} (+${pack.rotas})` : "Pacote de rotas";
  }
  const pack = PROPOSALS_ADD_ON_PACKS.find((p) => p.id === packId);
  return pack ? `Propostas — ${pack.label} (+${pack.proposals})` : "Pacote de propostas";
}

function stripeResourceIdOf(v: string | { id: string } | null | undefined): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object" && typeof v.id === "string") return v.id.trim() || null;
  return null;
}

/**
 * Resolve `paymentIntentId` + `chargeId` a partir de uma Checkout Session.
 * Preferência: expandir o PI se necessário para obter `latest_charge`.
 */
async function resolvePaymentIds(
  session: Stripe.Checkout.Session,
): Promise<{ paymentIntentId: string | null; chargeId: string | null }> {
  const piId = stripeResourceIdOf(session.payment_intent);
  if (!piId) return { paymentIntentId: null, chargeId: null };

  /** `payment_intent` pode já vir expandido consoante o tipo de evento. */
  const pi = session.payment_intent;
  if (pi && typeof pi === "object") {
    const lc = (pi as Stripe.PaymentIntent).latest_charge;
    const chargeId = stripeResourceIdOf(lc as string | { id: string } | null | undefined);
    if (chargeId) return { paymentIntentId: piId, chargeId };
  }

  /** Senão, vamos buscar o PI à Stripe para obter `latest_charge`. */
  const stripe = getStripe();
  if (!stripe) return { paymentIntentId: piId, chargeId: null };

  try {
    const fresh = await stripe.paymentIntents.retrieve(piId);
    const lc = fresh.latest_charge;
    const chargeId = stripeResourceIdOf(lc as string | { id: string } | null | undefined);
    return { paymentIntentId: piId, chargeId };
  } catch (e) {
    console.warn("[stripe fulfill add-on] falha a resolver PaymentIntent", piId, e);
    return { paymentIntentId: piId, chargeId: null };
  }
}

/**
 * Aplica créditos de add-on após pagamento confirmado (webhook).
 * Idempotente por `session.id`.
 *
 * Também grava um documento sintético em `stripeInvoices/{session.id}` com `lines.kind = "add_on"`,
 * para que a compra apareça na tabela de faturas e no dashboard de receita paga — checkout sessions
 * em `mode=payment` não criam `Invoice` automaticamente na Stripe.
 */
export async function fulfillStripeAddOnIfPaid(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode !== "payment") return;
  if (session.payment_status !== "paid") return;

  const uid = session.metadata?.uid ?? session.client_reference_id ?? "";
  const kind = session.metadata?.addOnKind as StripeAddOnKind | undefined;
  const packId = session.metadata?.packId ?? "";
  if (!uid.trim() || !kind || !packId) {
    console.warn("[stripe fulfill] metadata incompleta", session.id);
    return;
  }

  const expected = expectedAmountCentsForPack(kind, packId);
  const paid = session.amount_total ?? 0;
  if (expected == null || paid !== expected) {
    console.warn("[stripe fulfill] valor inesperado", { sessionId: session.id, expected, paid, kind, packId });
    return;
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    console.error("[stripe fulfill] Firebase Admin indisponível");
    return;
  }

  const db = getFirestore(app);
  const sessionRef = db.collection(PROCESSED).doc(session.id);

  const { paymentIntentId, chargeId } = await resolvePaymentIds(session);
  const customerId = stripeResourceIdOf(session.customer);
  const currency = (session.currency ?? "brl").toLowerCase();
  const description = packDescription(kind, packId);
  const paidAtMs = Date.now();

  await db.runTransaction(async (tx) => {
    const done = await tx.get(sessionRef);
    if (done.exists) return;

    const userRef = db.collection(USER_SETTINGS).doc(uid.trim());
    const userSnap = await tx.get(userRef);
    const data = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

    const monthKey = monthKeyUtc();
    const paidCents = paid;

    if (kind === "lead_capture") {
      const pack = LEAD_CAPTURE_ADD_ON_PACKS.find((p) => p.id === packId);
      if (!pack) throw new Error("pack leads inválido");
      const next = resolveMonthlyLeadLimit(data) + pack.leads;
      tx.set(
        userRef,
        {
          leadCaptureMonthlyLimit: next,
          lifetimePaidCents: FieldValue.increment(paidCents),
          [`addOnPaidByMonthCents.${monthKey}`]: FieldValue.increment(paidCents),
        },
        { merge: true },
      );
    } else if (kind === "rotas") {
      const pack = ROTAS_ADD_ON_PACKS.find((p) => p.id === packId);
      if (!pack) throw new Error("pack rotas inválido");
      tx.set(
        userRef,
        {
          rotasQuotaBonus: FieldValue.increment(pack.rotas),
          lifetimePaidCents: FieldValue.increment(paidCents),
          [`addOnPaidByMonthCents.${monthKey}`]: FieldValue.increment(paidCents),
        },
        { merge: true },
      );
    } else if (kind === "propostas") {
      const pack = PROPOSALS_ADD_ON_PACKS.find((p) => p.id === packId);
      if (!pack) throw new Error("pack propostas inválido");
      tx.set(
        userRef,
        {
          propostasQuotaBonus: FieldValue.increment(pack.proposals),
          lifetimePaidCents: FieldValue.increment(paidCents),
          [`addOnPaidByMonthCents.${monthKey}`]: FieldValue.increment(paidCents),
        },
        { merge: true },
      );
    }

    /**
     * Documento sintético em `stripeInvoices/{session.id}` — id prefixado por `cs_`,
     * para o agregador de receita (admin-revenue-series) e a tabela de faturas do admin
     * incluírem também compras avulsas de add-ons.
     */
    const invoiceRef = db.collection(INVOICES).doc(session.id);
    const lines: StoredStripeInvoiceLine[] = [
      {
        kind: "add_on",
        description,
        amountCents: paidCents,
        currency,
        periodStartMs: null,
        periodEndMs: null,
      },
    ];
    const invoiceDoc: StoredStripeInvoice = {
      uid: uid.trim(),
      stripeInvoiceId: session.id,
      stripeCustomerId: customerId,
      stripeSubscriptionId: null,
      status: "paid",
      amountPaidCents: paidCents,
      amountDueCents: paidCents,
      amountRemainingCents: 0,
      currency,
      billingReason: "add_on",
      number: null,
      hostedInvoiceUrl: null,
      invoicePdf: null,
      periodStartMs: null,
      periodEndMs: null,
      paidAtMs,
      createdAtMs: paidAtMs,
      failureMessage: null,
      lines,
      rawEventId: null,
      webhookReceivedAt: Timestamp.now(),
      stripeChargeId: chargeId,
      stripePaymentIntentId: paymentIntentId,
      stripeCheckoutSessionId: session.id,
      addOnMetadata: {
        kind,
        packId,
        units: packUnitsForKind(kind, packId),
      },
    };
    tx.set(invoiceRef, invoiceDoc, { merge: true });

    tx.set(sessionRef, {
      uid: uid.trim(),
      kind,
      packId,
      paidCents,
      stripeChargeId: chargeId,
      stripePaymentIntentId: paymentIntentId,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}
