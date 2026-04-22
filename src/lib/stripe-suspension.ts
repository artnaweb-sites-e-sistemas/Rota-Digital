import type { Auth } from "firebase-admin/auth";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";

const USER_SETTINGS = "userSettings";

export type AutoSuspendReason =
  | "subscription_unpaid"
  | "subscription_canceled"
  | "subscription_incomplete_expired";

type Context = {
  db: Firestore;
  auth: Auth;
};

function getContext(): Context | null {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return { db: getFirestore(app), auth: getAuth(app) };
}

/**
 * Aplica suspensão automática de conta (pagamento em falta):
 * - `auth.disabled = true` (bloqueia login).
 * - `autoSuspended = true`, `autoSuspendedReason`, `autoSuspendedAtMs`.
 * - Não toca nos campos de plano / Stripe IDs: preservamos para reativar quando o pagamento voltar.
 *
 * Idempotente: se já está `autoSuspended` com o mesmo motivo, não duplica.
 */
export async function applyAutoSuspend(
  uid: string,
  reason: AutoSuspendReason,
): Promise<{ applied: boolean; reason?: string }> {
  if (!uid.trim()) return { applied: false, reason: "invalid-uid" };
  const ctx = getContext();
  if (!ctx) return { applied: false, reason: "firebase-admin-unavailable" };
  const userRef = ctx.db.collection(USER_SETTINGS).doc(uid.trim());

  let shouldDisableAuth = true;

  await ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const prev = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const alreadyAutoSuspended = prev.autoSuspended === true;
    const sameReason = prev.autoSuspendedReason === reason;
    if (alreadyAutoSuspended && sameReason) {
      shouldDisableAuth = false;
      return;
    }

    tx.set(
      userRef,
      {
        autoSuspended: true,
        autoSuspendedReason: reason,
        autoSuspendedAtMs: Date.now(),
        subscriptionStatus:
          reason === "subscription_canceled"
            ? "canceled"
            : reason === "subscription_incomplete_expired"
              ? "incomplete_expired"
              : "unpaid",
        subscriptionStatusUpdatedAtMs: Date.now(),
      },
      { merge: true },
    );
  });

  if (shouldDisableAuth) {
    try {
      await ctx.auth.updateUser(uid.trim(), { disabled: true });
    } catch (e) {
      console.error("[stripe suspension] updateUser(disabled=true)", uid, e);
    }
  }

  return { applied: shouldDisableAuth };
}

/**
 * Reativa conta previamente auto-suspensa.
 * - Só atua se `autoSuspended === true` (para não interferir em desativações manuais do admin).
 * - `auth.disabled = false`, `autoSuspended = false`, `subscriptionStatus = "active"`.
 *
 * Idempotente.
 */
export async function applyAutoReactivation(uid: string): Promise<{ reactivated: boolean }> {
  if (!uid.trim()) return { reactivated: false };
  const ctx = getContext();
  if (!ctx) return { reactivated: false };
  const userRef = ctx.db.collection(USER_SETTINGS).doc(uid.trim());

  let shouldEnableAuth = false;

  await ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return;
    const prev = snap.data() as Record<string, unknown>;
    if (prev.autoSuspended !== true) return;

    shouldEnableAuth = true;
    tx.set(
      userRef,
      {
        autoSuspended: false,
        autoSuspendedReason: FieldValue.delete(),
        autoSuspendedAtMs: FieldValue.delete(),
      },
      { merge: true },
    );
  });

  if (shouldEnableAuth) {
    try {
      await ctx.auth.updateUser(uid.trim(), { disabled: false });
    } catch (e) {
      console.error("[stripe suspension] updateUser(disabled=false)", uid, e);
    }
  }

  return { reactivated: shouldEnableAuth };
}
