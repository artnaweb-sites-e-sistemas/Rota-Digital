import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type Stripe from "stripe";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { LEAD_CAPTURE_ADD_ON_PACKS, resolveMonthlyLeadLimit } from "@/lib/lead-capture-config";
import { PROPOSALS_ADD_ON_PACKS, ROTAS_ADD_ON_PACKS } from "@/lib/plan-quotas";
import type { StripeAddOnKind } from "@/lib/stripe-add-on-checkout";

const USER_SETTINGS = "userSettings";
const PROCESSED = "stripeCheckoutSessions";

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

/**
 * Aplica créditos de add-on após pagamento confirmado (webhook).
 * Idempotente por `session.id`.
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

    tx.set(sessionRef, {
      uid: uid.trim(),
      kind,
      packId,
      paidCents,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}
