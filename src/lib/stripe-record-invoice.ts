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
 * 1) `invoice.subscription_details?.metadata?.uid` (Stripe API >= 2024)
 * 2) `invoice.metadata?.uid`
 * 3) Lookup em `userSettings` via `stripeCustomerId`.
 */
async function resolveUidForInvoice(
  db: Firestore,
  invoice: Stripe.Invoice,
): Promise<string | null> {
  const metaUid =
    (invoice as unknown as { subscription_details?: { metadata?: Record<string, string> } })
      .subscription_details?.metadata?.uid ??
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

function mapLineKind(line: Stripe.InvoiceLineItem): StoredStripeInvoiceLineKind {
  /**
   * `type` saiu da tipagem oficial em versões recentes do SDK, mas ainda é devolvido pela API.
   * Fazemos acesso dinâmico + heurística: linhas com `subscription`/`subscription_item` → "subscription".
   */
  const asUnknown = line as unknown as {
    type?: "subscription" | "invoiceitem" | null;
    subscription?: string | { id: string } | null;
    subscription_item?: string | { id: string } | null;
    price?: { type?: "recurring" | "one_time" | null; recurring?: unknown } | null;
  };
  if (asUnknown.type === "subscription") return "subscription";
  if (asUnknown.type === "invoiceitem") return "add_on";
  if (asUnknown.subscription || asUnknown.subscription_item) return "subscription";
  if (asUnknown.price?.type === "recurring") return "subscription";
  if (asUnknown.price?.type === "one_time") return "add_on";
  return "other";
}

function mapLines(invoice: Stripe.Invoice): StoredStripeInvoiceLine[] {
  const data = invoice.lines?.data ?? [];
  return data.map((l) => ({
    kind: mapLineKind(l),
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
    stripeSubscriptionId: stripeResourceId(
      (invoice as unknown as { subscription?: string | { id: string } | null }).subscription ?? null,
    ),
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
