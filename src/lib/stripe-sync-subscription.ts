import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import {
  applyAutoReactivation,
  applyAutoSuspend,
  type AutoSuspendReason,
} from "@/lib/stripe-suspension";

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

async function resolveUidForSubscription(
  db: Firestore,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const metaUid =
    typeof subscription.metadata?.uid === "string" ? subscription.metadata.uid.trim() : "";
  if (metaUid) return metaUid;

  const customerId = stripeResourceId(subscription.customer);
  if (!customerId) return null;
  const snap = await db
    .collection(USER_SETTINGS)
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0]!.id;
}

function mapReasonFromStatus(status: Stripe.Subscription.Status): AutoSuspendReason | null {
  if (status === "unpaid") return "subscription_unpaid";
  if (status === "canceled") return "subscription_canceled";
  if (status === "incomplete_expired") return "subscription_incomplete_expired";
  return null;
}

/**
 * Sincroniza estado de subscrição Stripe → `userSettings`:
 * - `subscriptionStatus`, `subscriptionCurrentPeriodEndMs`, `subscriptionCurrentPeriodStartMs`.
 * - Dispara suspensão automática em `unpaid | canceled | incomplete_expired`.
 * - Dispara reativação em `active | trialing` se `autoSuspended === true`.
 */
export async function syncStripeSubscriptionState(
  subscription: Stripe.Subscription,
): Promise<void> {
  const app = getFirebaseAdminApp();
  if (!app) {
    console.error("[stripe sync sub] Firebase Admin indisponível");
    return;
  }
  const db = getFirestore(app);
  const uid = await resolveUidForSubscription(db, subscription);
  if (!uid) {
    console.warn("[stripe sync sub] uid não resolvido", subscription.id);
    return;
  }

  const status = subscription.status;
  const subId = subscription.id;
  const customerId = stripeResourceId(subscription.customer);
  /**
   * `current_period_*` não está na tipagem da Stripe SDK (campo da API); usamos acesso dinâmico seguro.
   * https://stripe.com/docs/api/subscriptions/object
   */
  const periodStartMs = secondsToMs(
    (subscription as unknown as { current_period_start?: number | null }).current_period_start ??
      null,
  );
  const periodEndMs = secondsToMs(
    (subscription as unknown as { current_period_end?: number | null }).current_period_end ?? null,
  );

  const userRef = db.collection(USER_SETTINGS).doc(uid);
  const updateFields: Record<string, unknown> = {
    subscriptionStatus: status,
    subscriptionStatusUpdatedAtMs: Date.now(),
  };
  if (periodStartMs != null) updateFields.subscriptionCurrentPeriodStartMs = periodStartMs;
  if (periodEndMs != null) updateFields.subscriptionCurrentPeriodEndMs = periodEndMs;
  if (customerId) updateFields.stripeCustomerId = customerId;
  if (subId) updateFields.stripeSubscriptionId = subId;

  await userRef.set(updateFields, { merge: true });

  const suspendReason = mapReasonFromStatus(status);
  if (suspendReason) {
    await applyAutoSuspend(uid, suspendReason);
    return;
  }

  if (status === "active" || status === "trialing") {
    await applyAutoReactivation(uid);
  }
}
