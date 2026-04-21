import { normalizedSubscriptionPlanKey, type PlanKey } from "@/lib/plan-quotas";

/** Plano comercial pago (não Starter/Master). */
export type StripeSubscriptionPlanKey = "pro" | "agency";

export type StripeSubscriptionBillingCycle = "monthly" | "yearly";

/** Valores alinhados à landing e ao modal de limites (BRL → centavos). */
export function subscriptionLineAmountCents(
  plan: StripeSubscriptionPlanKey,
  cycle: StripeSubscriptionBillingCycle,
): { unitAmount: number; interval: "month" | "year"; label: string } {
  if (cycle === "monthly") {
    if (plan === "pro") {
      return { unitAmount: 1 * 100, interval: "month", label: "Plano Pro (mensal)" };
    }
    return { unitAmount: 347 * 100, interval: "month", label: "Plano Agency (mensal)" };
  }
  if (plan === "pro") {
    return {
      unitAmount: 1 * 100,
      interval: "year",
      label: "Plano Pro (anual)",
    };
  }
  return {
    unitAmount: 267 * 12 * 100,
    interval: "year",
    label: "Plano Agency (anual)",
  };
}

/** Preço mensal equivalente em centavos (para `planPriceCents` / faturação). */
export function subscriptionMonthlyEquivalentCents(
  plan: StripeSubscriptionPlanKey,
  cycle: StripeSubscriptionBillingCycle,
): number {
  if (cycle === "monthly") {
    return plan === "pro" ? 100 : 34_700;
  }
  return plan === "pro" ? 100 : 26_700;
}

/** Limite mensal de leads conforme plano (igual ao admin PATCH). */
export function subscriptionLeadLimitForPlan(plan: StripeSubscriptionPlanKey): number {
  return plan === "pro" ? 50 : 100;
}

export function planKeyToFirestoreLabel(plan: StripeSubscriptionPlanKey): "Pro" | "Agency" {
  return plan === "pro" ? "Pro" : "Agency";
}

export function parseSubscriptionPlanKey(raw: unknown): StripeSubscriptionPlanKey | null {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (t === "pro" || t === "agency") return t;
  return null;
}

export function parseBillingCycle(raw: unknown): StripeSubscriptionBillingCycle | null {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (t === "monthly" || t === "yearly" || t === "annual") return t === "annual" ? "yearly" : t;
  return null;
}

/**
 * Plano efectivo para decisão de checkout (sem assumir "Pro" quando os campos estão vazios).
 * `null` = ainda não há plano pago definido (ou Starter) → deve poder abrir checkout.
 */
export function currentSubscriptionPlanFromSettings(
  userSettings: Record<string, unknown>,
): PlanKey | null {
  if (userSettings.planMasterUnlimited === true) {
    return "master";
  }
  const raw = userSettings.subscriptionPlan ?? userSettings.plan;
  const text = String(raw ?? "").trim();
  if (!text) {
    if (typeof userSettings.stripeSubscriptionId === "string" && userSettings.stripeSubscriptionId.trim()) {
      return "pro";
    }
    return null;
  }
  return normalizedSubscriptionPlanKey(raw);
}

/**
 * Já tem plano comercial pago ativo (Pro/Agency/Master) e não precisa de novo checkout
 * para o mesmo upgrade, ou já está no topo (Agency).
 * Pro → Agency continua a precisar de checkout.
 */
export function shouldSkipStripeSubscriptionCheckout(
  currentPlan: PlanKey | null,
  targetPlan: StripeSubscriptionPlanKey,
): boolean {
  if (currentPlan == null) return false;
  if (currentPlan === "starter") return false;
  if (currentPlan === "master") return true;
  if (currentPlan === "agency") return true;
  if (currentPlan === "pro" && targetPlan === "pro") return true;
  return false;
}
