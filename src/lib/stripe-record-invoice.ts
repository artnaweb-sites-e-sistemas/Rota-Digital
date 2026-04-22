import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { getStripe } from "@/lib/stripe-server";
import type { StoredStripeInvoice, StoredStripeInvoiceLine, StoredStripeInvoiceLineKind } from "@/types/stripe-invoice";

const USER_SETTINGS = "userSettings";
const INVOICES = "stripeInvoices";

/** Stripe pode devolver `id` como string ou objeto expandido no webhook. */
function stripeResourceId(resource: string | { id: string } | null | undefined): string | null {
  if (resource == null) return null;
  if (typeof resource === "string") return resource.trim() || null;
  if (typeof resource === "object" && typeof resource.id === "string") return resource.id.trim() || null;
  return null;
}

function secondsToMs(s: number | null | undefined): number | null {
  if (typeof s !== "number" || !Number.isFinite(s)) return null;
  return Math.round(s * 1000);
}

function monthKeyUtcFromMs(ms: number | null | undefined): string {
  const t = typeof ms === "number" && Number.isFinite(ms) ? ms : Date.now();
  return new Date(t).toISOString().slice(0, 7);
}

/**
 * Resolve o `uid` do utilizador a partir da fatura:
 * 1) `invoice.parent.subscription_details.metadata.uid` (API ≥ 2025)
 * 2) `invoice.subscription_details.metadata.uid` (API ≤ 2024)
 * 3) `invoice.metadata.uid`
 * 4) Lookup em `userSettings` via `stripeCustomerId`.
 */
async function resolveUidForInvoice(
  db: Firestore,
  invoice: Stripe.Invoice,
): Promise<string | null> {
  const asUnknown = invoice as unknown as {
    parent?: {
      subscription_details?: { metadata?: Record<string, string> | null } | null;
    } | null;
    subscription_details?: { metadata?: Record<string, string> | null } | null;
  };
  const metaUid =
    asUnknown.parent?.subscription_details?.metadata?.uid ??
    asUnknown.subscription_details?.metadata?.uid ??
    invoice.metadata?.uid ??
    null;
  if (typeof metaUid === "string" && metaUid.trim()) return metaUid.trim();

  const customerId = stripeResourceId(invoice.customer);
  if (!customerId) return null;
  const snap = await db
    .collection(USER_SETTINGS)
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0]!.id;
}

/**
 * Extrai o `subscriptionId` da fatura, cobrindo ambas as formas da API:
 *  - API ≥ 2025: `invoice.parent.subscription_details.subscription`
 *  - API ≤ 2024: `invoice.subscription`
 */
function extractSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const asUnknown = invoice as unknown as {
    parent?: {
      subscription_details?: { subscription?: string | { id: string } | null } | null;
    } | null;
    subscription?: string | { id: string } | null;
  };
  return (
    stripeResourceId(asUnknown.parent?.subscription_details?.subscription ?? null) ??
    stripeResourceId(asUnknown.subscription ?? null)
  );
}

/**
 * Versões diferentes da API Stripe expõem a categoria das linhas em sítios diferentes.
 * Tentamos, por ordem:
 *  1. `line.parent.type === "subscription_item_details"` (API 2025+)
 *  2. `line.type === "subscription"` (API ≤ 2024)
 *  3. `line.subscription` / `line.subscription_item` presentes
 *  4. `line.pricing.price_details.price` recorrente OR `line.price.type === "recurring"`
 *  5. Fallback para `invoice.billing_reason` (sub → subscription, manual/invoice → add_on)
 */
function mapLineKind(
  line: Stripe.InvoiceLineItem,
  invoiceBillingReason: string | null | undefined,
): StoredStripeInvoiceLineKind {
  const asUnknown = line as unknown as {
    type?: "subscription" | "invoiceitem" | null;
    subscription?: string | { id: string } | null;
    subscription_item?: string | { id: string } | null;
    parent?: {
      type?: "subscription_item_details" | "invoice_item_details" | string | null;
      subscription_item_details?: {
        subscription?: string | null;
        subscription_item?: string | null;
      } | null;
    } | null;
    price?: { type?: "recurring" | "one_time" | null; recurring?: unknown } | null;
    pricing?: {
      type?: "one_time" | "recurring" | null;
      price_details?: { price?: string | null } | null;
    } | null;
  };

  if (asUnknown.parent?.type === "subscription_item_details") return "subscription";
  if (asUnknown.parent?.type === "invoice_item_details") return "add_on";
  if (asUnknown.parent?.subscription_item_details?.subscription) return "subscription";
  if (asUnknown.type === "subscription") return "subscription";
  if (asUnknown.type === "invoiceitem") return "add_on";
  if (asUnknown.subscription || asUnknown.subscription_item) return "subscription";
  if (asUnknown.pricing?.type === "recurring") return "subscription";
  if (asUnknown.pricing?.type === "one_time") return "add_on";
  if (asUnknown.price?.type === "recurring") return "subscription";
  if (asUnknown.price?.type === "one_time") return "add_on";

  /** Último recurso: usa o motivo da fatura. */
  if (invoiceBillingReason) {
    const r = invoiceBillingReason.toLowerCase();
    if (
      r === "subscription" ||
      r === "subscription_create" ||
      r === "subscription_cycle" ||
      r === "subscription_update" ||
      r === "subscription_threshold" ||
      r === "upcoming"
    ) {
      return "subscription";
    }
    if (r === "manual" || r === "invoiceitem" || r === "invoice_item") {
      return "add_on";
    }
  }
  return "other";
}

function mapLines(invoice: Stripe.Invoice): StoredStripeInvoiceLine[] {
  const data = invoice.lines?.data ?? [];
  const billingReason = invoice.billing_reason ?? null;
  return data.map((l) => ({
    kind: mapLineKind(l, billingReason),
    description: l.description ?? null,
    amountCents: typeof l.amount === "number" ? l.amount : 0,
    currency: l.currency ?? invoice.currency ?? "brl",
    periodStartMs: secondsToMs(l.period?.start ?? null),
    periodEndMs: secondsToMs(l.period?.end ?? null),
  }));
}

/**
 * Extrai `chargeId` + `paymentIntentId` de uma fatura Stripe, cobrindo várias versões da API.
 * - `invoice.charge` (API ≤ 2024)
 * - `invoice.payment_intent` expandido (via `latest_charge`)
 * - `invoice.payments.data[].payment.payment_intent` expandido (API 2025+)
 */
function extractPaymentIds(
  invoice: Stripe.Invoice,
): { chargeId: string | null; paymentIntentId: string | null } {
  const asUnknown = invoice as unknown as {
    charge?: string | { id?: string } | null;
    payment_intent?:
      | string
      | {
          id?: string;
          latest_charge?: string | { id?: string } | null;
        }
      | null;
    payments?: {
      data?: Array<{
        payment?:
          | {
              payment_intent?:
                | string
                | {
                    id?: string;
                    latest_charge?: string | { id?: string } | null;
                  }
                | null;
              charge?: string | { id?: string } | null;
            }
          | null;
      }>;
    } | null;
  };

  let chargeId: string | null = null;
  let paymentIntentId: string | null = null;

  if (typeof asUnknown.charge === "string") chargeId = asUnknown.charge;
  else if (asUnknown.charge && typeof asUnknown.charge === "object" && asUnknown.charge.id)
    chargeId = asUnknown.charge.id;

  const pi = asUnknown.payment_intent;
  if (typeof pi === "string") paymentIntentId = pi;
  else if (pi && typeof pi === "object") {
    if (typeof pi.id === "string") paymentIntentId = pi.id;
    if (!chargeId) {
      const lc = pi.latest_charge;
      if (typeof lc === "string") chargeId = lc;
      else if (lc && typeof lc === "object" && typeof lc.id === "string") chargeId = lc.id;
    }
  }

  const paymentsData = asUnknown.payments?.data ?? [];
  for (const entry of paymentsData) {
    const payment = entry?.payment;
    if (!payment) continue;
    if (!chargeId) {
      if (typeof payment.charge === "string") chargeId = payment.charge;
      else if (payment.charge && typeof payment.charge === "object" && typeof payment.charge.id === "string")
        chargeId = payment.charge.id;
    }
    const pp = payment.payment_intent;
    if (!paymentIntentId) {
      if (typeof pp === "string") paymentIntentId = pp;
      else if (pp && typeof pp === "object" && typeof pp.id === "string") paymentIntentId = pp.id;
    }
    if (!chargeId && pp && typeof pp === "object") {
      const lc = pp.latest_charge;
      if (typeof lc === "string") chargeId = lc;
      else if (lc && typeof lc === "object" && typeof lc.id === "string") chargeId = lc.id;
    }
    if (chargeId && paymentIntentId) break;
  }

  return { chargeId: chargeId?.trim() || null, paymentIntentId: paymentIntentId?.trim() || null };
}

/**
 * Escolhe o melhor `[periodStart, periodEnd]` para exibição:
 * 1. Quando `invoice.period_start === invoice.period_end` (fatura de criação de assinatura),
 *    a API cola ambos no momento do pagamento. Nesse caso preferimos a linha de subscrição
 *    com o intervalo mais longo — tipicamente "hoje → próxima renovação".
 * 2. Caso contrário, usa `invoice.period_start` / `invoice.period_end`.
 */
function bestInvoicePeriodMs(
  invoice: Stripe.Invoice,
  lines: StoredStripeInvoiceLine[],
): { periodStartMs: number | null; periodEndMs: number | null } {
  const invStart = secondsToMs(invoice.period_start);
  const invEnd = secondsToMs(invoice.period_end);
  const degenerate = invStart != null && invEnd != null && invEnd - invStart < 24 * 60 * 60 * 1000;

  if (!degenerate) {
    return { periodStartMs: invStart, periodEndMs: invEnd };
  }

  let best: { startMs: number; endMs: number } | null = null;
  for (const l of lines) {
    if (l.kind !== "subscription") continue;
    if (l.periodStartMs == null || l.periodEndMs == null) continue;
    const span = l.periodEndMs - l.periodStartMs;
    if (span <= 0) continue;
    if (!best || span > best.endMs - best.startMs) {
      best = { startMs: l.periodStartMs, endMs: l.periodEndMs };
    }
  }
  if (best) return { periodStartMs: best.startMs, periodEndMs: best.endMs };
  return { periodStartMs: invStart, periodEndMs: invEnd };
}

/** Normaliza `Stripe.Invoice` → documento Firestore. */
function buildStoredInvoice(
  invoice: Stripe.Invoice,
  uid: string | null,
  rawEventId: string | null,
  failureMessage: string | null,
): Omit<StoredStripeInvoice, "webhookReceivedAt"> {
  const lines = mapLines(invoice);
  const { periodStartMs, periodEndMs } = bestInvoicePeriodMs(invoice, lines);
  const { chargeId, paymentIntentId } = extractPaymentIds(invoice);
  return {
    uid,
    stripeInvoiceId: invoice.id ?? "",
    stripeCustomerId: stripeResourceId(invoice.customer),
    stripeSubscriptionId: extractSubscriptionIdFromInvoice(invoice),
    status: invoice.status ?? "",
    amountPaidCents: typeof invoice.amount_paid === "number" ? invoice.amount_paid : 0,
    amountDueCents: typeof invoice.amount_due === "number" ? invoice.amount_due : 0,
    amountRemainingCents:
      typeof invoice.amount_remaining === "number" ? invoice.amount_remaining : 0,
    currency: invoice.currency ?? "brl",
    billingReason: invoice.billing_reason ?? null,
    number: invoice.number ?? null,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdf: invoice.invoice_pdf ?? null,
    periodStartMs,
    periodEndMs,
    paidAtMs:
      invoice.status === "paid"
        ? secondsToMs(
            (invoice as unknown as { status_transitions?: { paid_at?: number | null } })
              .status_transitions?.paid_at ?? null,
          ) ?? secondsToMs(invoice.created)
        : null,
    createdAtMs: secondsToMs(invoice.created) ?? Date.now(),
    failureMessage,
    lines,
    rawEventId,
    stripeChargeId: chargeId,
    stripePaymentIntentId: paymentIntentId,
  };
}

type RecordInvoiceResult = {
  stored: boolean;
  alreadyProcessed: boolean;
  uid: string | null;
};

/**
 * Grava `invoice.paid` idempotente e incrementa agregados de receita real do utilizador.
 * - `subscriptionPaidByMonthCents.{YYYY-MM}` (renovações de plano, separado dos add-ons)
 * - `lifetimePaidCents` (histórico total pago via Stripe)
 * - `subscriptionStatus = "active"` e limpa estado de falha recente.
 */
export async function recordStripeInvoicePaid(
  invoice: Stripe.Invoice,
  rawEventId: string | null,
): Promise<RecordInvoiceResult> {
  if (!invoice.id) return { stored: false, alreadyProcessed: false, uid: null };
  const app = getFirebaseAdminApp();
  if (!app) {
    console.error("[stripe record invoice] Firebase Admin indisponível");
    return { stored: false, alreadyProcessed: false, uid: null };
  }

  const db = getFirestore(app);

  /**
   * Stripe envia a maior parte das relações como `id` (não expandidas) no payload do webhook.
   * Se faltarem `chargeId`/`paymentIntentId`, refetch com expansões para que o refund admin
   * possa localizar o pagamento sem depender de `stripe.invoices.retrieve` mais tarde.
   */
  let hydrated = invoice;
  const probe = extractPaymentIds(invoice);
  if (!probe.chargeId && invoice.id) {
    const stripe = getStripe();
    if (stripe) {
      try {
        hydrated = await stripe.invoices.retrieve(invoice.id, {
          expand: ["payment_intent", "payments.data.payment.payment_intent", "charge"],
        });
      } catch (e) {
        console.warn("[stripe record invoice] expand falhou", invoice.id, e);
      }
    }
  }

  const uid = await resolveUidForInvoice(db, hydrated);
  const invRef = db.collection(INVOICES).doc(invoice.id);
  const stored = buildStoredInvoice(hydrated, uid, rawEventId, null);
  const amountPaid = stored.amountPaidCents;
  const monthKey = monthKeyUtcFromMs(stored.paidAtMs ?? stored.createdAtMs);
  const hasSubscription = Boolean(stored.stripeSubscriptionId);

  let alreadyProcessed = false;

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(invRef);
    if (existing.exists) {
      const prev = existing.data() as StoredStripeInvoice | undefined;
      if (prev?.status === "paid" && (prev.amountPaidCents ?? 0) >= amountPaid) {
        alreadyProcessed = true;
        return;
      }
    }

    tx.set(
      invRef,
      {
        ...stored,
        webhookReceivedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (uid && amountPaid > 0) {
      const userRef = db.collection(USER_SETTINGS).doc(uid);
      const userUpdate: Record<string, unknown> = {
        lifetimePaidCents: FieldValue.increment(amountPaid),
        lastPaymentFailureAtMs: FieldValue.delete(),
        lastPaymentFailureMessage: FieldValue.delete(),
      };
      if (hasSubscription) {
        userUpdate[`subscriptionPaidByMonthCents.${monthKey}`] = FieldValue.increment(amountPaid);
      }
      tx.set(userRef, userUpdate, { merge: true });
    }
  });

  return { stored: !alreadyProcessed, alreadyProcessed, uid };
}

/**
 * Grava `invoice.payment_failed` idempotente (por invoice+attempt).
 * - Marca `subscriptionStatus = "past_due"` e `lastPaymentFailureAtMs`.
 * - **Não** suspende o utilizador aqui — a suspensão fica para `customer.subscription.updated`
 *   quando a Stripe desistir (estado `unpaid`/`canceled`).
 */
export async function recordStripeInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  rawEventId: string | null,
): Promise<RecordInvoiceResult> {
  if (!invoice.id) return { stored: false, alreadyProcessed: false, uid: null };
  const app = getFirebaseAdminApp();
  if (!app) {
    console.error("[stripe record invoice] Firebase Admin indisponível");
    return { stored: false, alreadyProcessed: false, uid: null };
  }

  const db = getFirestore(app);
  const uid = await resolveUidForInvoice(db, invoice);
  const invRef = db.collection(INVOICES).doc(invoice.id);

  const failureMessage =
    (invoice as unknown as { last_finalization_error?: { message?: string | null } | null })
      .last_finalization_error?.message ??
    (invoice as unknown as { charge?: { failure_message?: string | null } | null }).charge
      ?.failure_message ??
    null;

  const stored = buildStoredInvoice(invoice, uid, rawEventId, failureMessage ?? null);

  await db.runTransaction(async (tx) => {
    tx.set(
      invRef,
      {
        ...stored,
        webhookReceivedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (uid) {
      const userRef = db.collection(USER_SETTINGS).doc(uid);
      tx.set(
        userRef,
        {
          subscriptionStatus: "past_due",
          subscriptionStatusUpdatedAtMs: Date.now(),
          lastPaymentFailureAtMs: Date.now(),
          lastPaymentFailureMessage: failureMessage ?? null,
        },
        { merge: true },
      );
    }
  });

  return { stored: true, alreadyProcessed: false, uid };
}
