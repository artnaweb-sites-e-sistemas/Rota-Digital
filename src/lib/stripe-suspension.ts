import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";

const USER_SETTINGS = "userSettings";

export type AutoSuspendReason =
  | "subscription_unpaid"
  | "subscription_canceled"
  | "subscription_incomplete_expired";

type Context = { db: Firestore };

function getContext(): Context | null {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return { db: getFirestore(app) };
}

/**
 * Campos do plano que queremos “guardar” ao rebaixar a conta para Starter,
 * para conseguir restaurar exactamente o mesmo plano quando o pagamento voltar.
 */
const SNAPSHOT_FIELDS = [
  "plan",
  "subscriptionPlan",
  "planPriceCents",
  "subscriptionPriceCents",
  "leadCaptureMonthlyLimit",
  "stripeSubscriptionPlanKey",
  "stripeBillingCycle",
  "subscriptionCycleAnchorAt",
  "subscriptionCycleAnchorAtMs",
  "planMasterUnlimited",
] as const;

/** Valores aplicados quando a conta é rebaixada automaticamente para Starter. */
const STARTER_DOWNGRADE: Record<string, unknown> = {
  plan: "Starter",
  subscriptionPlan: "Starter",
  planPriceCents: 0,
  subscriptionPriceCents: 0,
  leadCaptureMonthlyLimit: 30,
  planMasterUnlimited: false,
};

function pickSnapshot(prev: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SNAPSHOT_FIELDS) {
    if (prev[k] !== undefined) out[k] = prev[k];
  }
  return out;
}

/**
 * Rebaixa automaticamente a conta para **Starter** (sem mensalidade) quando a Stripe
 * indica estado final de falha na assinatura (`unpaid` / `canceled` / `incomplete_expired`).
 *
 * - NÃO bloqueia login: o utilizador continua a poder entrar no plano Starter.
 * - Guarda um snapshot do plano anterior em `autoSuspendedPlanSnapshot` para restaurar mais tarde.
 * - `autoSuspended = true` + motivo + timestamp ficam gravados para auditoria / UI.
 *
 * Idempotente: se já está `autoSuspended === true`, não volta a gravar snapshot nem recalcula
 * (o snapshot que já lá está é o do verdadeiro plano anterior).
 */
export async function applyAutoSuspend(
  uid: string,
  reason: AutoSuspendReason,
): Promise<{ applied: boolean; reason?: string }> {
  if (!uid.trim()) return { applied: false, reason: "invalid-uid" };
  const ctx = getContext();
  if (!ctx) return { applied: false, reason: "firebase-admin-unavailable" };
  const userRef = ctx.db.collection(USER_SETTINGS).doc(uid.trim());

  let applied = false;

  await ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const prev = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const alreadyAutoSuspended = prev.autoSuspended === true;
    const sameReason = prev.autoSuspendedReason === reason;

    /** Master nunca é rebaixado por falha de pagamento (é interno). */
    if (prev.planMasterUnlimited === true) {
      tx.set(
        userRef,
        {
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
      return;
    }

    const subscriptionStatusValue =
      reason === "subscription_canceled"
        ? "canceled"
        : reason === "subscription_incomplete_expired"
          ? "incomplete_expired"
          : "unpaid";

    if (alreadyAutoSuspended && sameReason) {
      /** Actualiza apenas o status (por mudanças sucessivas de estado na Stripe). */
      tx.set(
        userRef,
        {
          subscriptionStatus: subscriptionStatusValue,
          subscriptionStatusUpdatedAtMs: Date.now(),
        },
        { merge: true },
      );
      return;
    }

    /** Só guarda snapshot na primeira vez que suspendemos — depois preserva-se. */
    const snapshot = alreadyAutoSuspended
      ? (prev.autoSuspendedPlanSnapshot as Record<string, unknown> | undefined) ?? pickSnapshot(prev)
      : pickSnapshot(prev);

    tx.set(
      userRef,
      {
        ...STARTER_DOWNGRADE,
        autoSuspended: true,
        autoSuspendedReason: reason,
        autoSuspendedAtMs: Date.now(),
        autoSuspendedPlanSnapshot: snapshot,
        subscriptionStatus: subscriptionStatusValue,
        subscriptionStatusUpdatedAtMs: Date.now(),
      },
      { merge: true },
    );
    applied = true;
  });

  return { applied };
}

/**
 * Restaura o plano anterior a partir do snapshot quando a assinatura volta a `active` / `trialing`.
 *
 * - Só actua se `autoSuspended === true` (para não interferir em acções manuais do admin).
 * - Aplica campos do snapshot por cima do documento e remove as flags de suspensão automática.
 *
 * Se não houver snapshot (por exemplo em dados antigos), apenas limpa as flags.
 *
 * Idempotente.
 */
export async function applyAutoReactivation(uid: string): Promise<{ reactivated: boolean }> {
  if (!uid.trim()) return { reactivated: false };
  const ctx = getContext();
  if (!ctx) return { reactivated: false };
  const userRef = ctx.db.collection(USER_SETTINGS).doc(uid.trim());

  let reactivated = false;

  await ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return;
    const prev = snap.data() as Record<string, unknown>;
    if (prev.autoSuspended !== true) return;

    const snapshot =
      (prev.autoSuspendedPlanSnapshot as Record<string, unknown> | undefined) ?? {};
    const restore: Record<string, unknown> = {};
    for (const k of SNAPSHOT_FIELDS) {
      if (snapshot[k] !== undefined) restore[k] = snapshot[k];
    }

    tx.set(
      userRef,
      {
        ...restore,
        autoSuspended: false,
        autoSuspendedReason: FieldValue.delete(),
        autoSuspendedAtMs: FieldValue.delete(),
        autoSuspendedPlanSnapshot: FieldValue.delete(),
      },
      { merge: true },
    );
    reactivated = true;
  });

  return { reactivated };
}
