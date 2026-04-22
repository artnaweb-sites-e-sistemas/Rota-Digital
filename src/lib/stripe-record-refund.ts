import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import type {
  StoredStripeInvoice,
  StoredStripeInvoiceRefund,
  StoredStripeInvoiceRefundStatus,
} from "@/types/stripe-invoice";

const INVOICES = "stripeInvoices";
const USER_SETTINGS = "userSettings";

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

/** Distribuição proporcional do `deltaCents` entre assinatura / add-on, com base nas linhas da fatura. */
function splitDeltaByKind(
  deltaCents: number,
  stored: StoredStripeInvoice,
): { subscriptionCents: number; addOnCents: number } {
  const lines = stored.lines ?? [];
  let subLines = 0;
  let addOnLines = 0;
  for (const l of lines) {
    const a = typeof l.amountCents === "number" && Number.isFinite(l.amountCents) ? l.amountCents : 0;
    if (l.kind === "subscription") subLines += a;
    else addOnLines += a;
  }
  const total = subLines + addOnLines;
  if (total <= 0) {
    /** Sem breakdown — assume tudo subscrição se houver `stripeSubscriptionId`, senão add-on. */
    return stored.stripeSubscriptionId
      ? { subscriptionCents: deltaCents, addOnCents: 0 }
      : { subscriptionCents: 0, addOnCents: deltaCents };
  }
  const subShare = Math.round((subLines / total) * deltaCents);
  return {
    subscriptionCents: subShare,
    addOnCents: Math.max(0, deltaCents - subShare),
  };
}

type RecordRefundResult = {
  processed: boolean;
  alreadyProcessed: boolean;
  uid: string | null;
  deltaCents: number;
  invoiceId: string | null;
};

/**
 * Aplica um reembolso (`Stripe.Charge.refunded` ou manual) sobre a fatura correspondente:
 *
 * - Grava idempotentemente os refund IDs que ainda não existam em `stripeInvoices/{id}.refunds`.
 * - Atualiza `refundedCents`, `refundedAtMs`, `refundStatus` da fatura.
 * - Decrementa `lifetimePaidCents` do utilizador pelo `deltaCents`.
 * - Decrementa `subscriptionPaidByMonthCents.{YYYY-MM}` (mês original da fatura) pela porção atribuída
 *   a linhas de subscrição, proporcionalmente.
 *
 * Tem de ser chamado com um `charge` que tenha `invoice` (string ou expandido) e `refunds` expandidos
 * (o que o webhook `charge.refunded` já entrega).
 */
function invoiceIdFromCharge(charge: Stripe.Charge): string | null {
  /** API Stripe ainda retorna `invoice` em muitos Charges; a tipagem do SDK às vezes omite. */
  const asUnknown = charge as unknown as { invoice?: string | { id: string } | null };
  return stripeResourceId(asUnknown.invoice);
}

/**
 * Encontra o documento `stripeInvoices` correspondente a um charge:
 * 1. Primeiro tenta via `charge.invoice` (cobranças de `Invoice` reais).
 * 2. Senão, pesquisa por `stripeChargeId == charge.id` (add-ons sintéticos).
 */
async function resolveInvoiceDocId(
  db: Firestore,
  charge: Stripe.Charge,
): Promise<string | null> {
  const direct = invoiceIdFromCharge(charge);
  if (direct) return direct;
  const chargeId = typeof charge.id === "string" ? charge.id.trim() : "";
  if (!chargeId) return null;
  try {
    const snap = await db
      .collection(INVOICES)
      .where("stripeChargeId", "==", chargeId)
      .limit(1)
      .get();
    if (snap.empty) return null;
    return snap.docs[0]!.id;
  } catch (e) {
    console.warn("[stripe record refund] lookup por stripeChargeId falhou", chargeId, e);
    return null;
  }
}

export async function recordStripeChargeRefunded(
  charge: Stripe.Charge,
  rawEventId: string | null,
): Promise<RecordRefundResult> {
  const app = getFirebaseAdminApp();
  if (!app) {
    console.error("[stripe record refund] Firebase Admin indisponível");
    return { processed: false, alreadyProcessed: false, uid: null, deltaCents: 0, invoiceId: null };
  }
  const db: Firestore = getFirestore(app);

  const invoiceId = await resolveInvoiceDocId(db, charge);
  if (!invoiceId) {
    return { processed: false, alreadyProcessed: false, uid: null, deltaCents: 0, invoiceId: null };
  }
  const invRef = db.collection(INVOICES).doc(invoiceId);

  let uidResult: string | null = null;
  let deltaCents = 0;
  let alreadyProcessed = false;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(invRef);
    if (!snap.exists) {
      /** Sem documento de fatura ainda — provavelmente webhook fora de ordem. Ignoramos: a
       *  próxima recepção de `invoice.paid` irá gravá-la; o `charge.refunded` pode ser reprocessado
       *  em backfill se necessário. */
      console.warn("[stripe record refund] invoice não encontrada", invoiceId);
      return;
    }
    const stored = snap.data() as StoredStripeInvoice;
    uidResult = stored.uid ?? null;

    /** Idempotência: só processa refunds cujos IDs ainda não tínhamos guardado. */
    const prevRefunds: StoredStripeInvoiceRefund[] = Array.isArray(stored.refunds) ? stored.refunds : [];
    const seenIds = new Set(prevRefunds.map((r) => r.stripeRefundId));
    const chargeRefunds: Stripe.Refund[] = charge.refunds?.data ?? [];
    const newRefunds: StoredStripeInvoiceRefund[] = [];
    for (const r of chargeRefunds) {
      if (!r.id || seenIds.has(r.id)) continue;
      /** Só contamos refunds realmente concluídos. */
      if (r.status && r.status !== "succeeded") continue;
      const amount = typeof r.amount === "number" && Number.isFinite(r.amount) ? r.amount : 0;
      if (amount <= 0) continue;
      newRefunds.push({
        stripeRefundId: r.id,
        stripeChargeId: charge.id ?? null,
        amountCents: amount,
        reason: r.reason ?? null,
        createdAtMs: secondsToMs(r.created) ?? Date.now(),
      });
    }

    if (newRefunds.length === 0) {
      alreadyProcessed = true;
      return;
    }

    deltaCents = newRefunds.reduce((acc, r) => acc + r.amountCents, 0);
    const newTotalRefundedCents =
      (typeof stored.refundedCents === "number" ? stored.refundedCents : 0) + deltaCents;
    const amountPaid = typeof stored.amountPaidCents === "number" ? stored.amountPaidCents : 0;
    const refundStatus: StoredStripeInvoiceRefundStatus | null =
      amountPaid > 0 && newTotalRefundedCents >= amountPaid ? "refunded" : "partial";

    const invoicePatch: Record<string, unknown> = {
      refunds: [...prevRefunds, ...newRefunds],
      refundedCents: newTotalRefundedCents,
      refundedAtMs: Date.now(),
      refundStatus,
      lastRefundEventId: rawEventId,
    };
    tx.set(invRef, invoicePatch, { merge: true });

    if (uidResult && deltaCents > 0) {
      const userRef = db.collection(USER_SETTINGS).doc(uidResult);
      const { subscriptionCents, addOnCents } = splitDeltaByKind(deltaCents, stored);
      const monthKey = monthKeyUtcFromMs(stored.paidAtMs ?? stored.createdAtMs);
      const userPatch: Record<string, unknown> = {
        lifetimePaidCents: FieldValue.increment(-deltaCents),
      };
      if (subscriptionCents > 0) {
        userPatch[`subscriptionPaidByMonthCents.${monthKey}`] = FieldValue.increment(
          -subscriptionCents,
        );
      }
      if (addOnCents > 0) {
        userPatch[`addOnPaidByMonthCents.${monthKey}`] = FieldValue.increment(-addOnCents);
      }
      tx.set(userRef, userPatch, { merge: true });
    }
  });

  return {
    processed: deltaCents > 0,
    alreadyProcessed,
    uid: uidResult,
    deltaCents,
    invoiceId,
  };
}
