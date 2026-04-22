import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
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

/** Normaliza `Stripe.Invoice` → documento Firestore. */
function buildStoredInvoice(
  invoice: Stripe.Invoice,
  uid: string | null,
  rawEventId: string | null,
  failureMessage: string | null,
): Omit<StoredStripeInvoice, "webhookReceivedAt"> {
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
    periodStartMs: secondsToMs(invoice.period_start),
    periodEndMs: secondsToMs(invoice.period_end),
    paidAtMs:
      invoice.status === "paid"
        ? secondsToMs(
            (invoice as unknown as { status_transitions?: { paid_at?: number | null } })
              .status_transitions?.paid_at ?? null,
          ) ?? secondsToMs(invoice.created)
        : null,
    createdAtMs: secondsToMs(invoice.created) ?? Date.now(),
    failureMessage,
    lines: mapLines(invoice),
    rawEventId,
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
  const uid = await resolveUidForInvoice(db, invoice);
  const invRef = db.collection(INVOICES).doc(invoice.id);
  const stored = buildStoredInvoice(invoice, uid, rawEventId, null);
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
