import { normalizedSubscriptionPlanKey, type PlanKey } from "@/lib/plan-quotas";

/** Plano comercial pago (não Starter/Master). */
export type StripeSubscriptionPlanKey = "pro" | "agency";

export type StripeSubscriptionBillingCycle = "monthly" | "yearly";

const PRO_MONTHLY_DEFAULT_CENTS = 12_700;
const PRO_YEARLY_DEFAULT_CENTS = 9_700;

/**
 * Preço mínimo padrão Pro (BRL) — evita mágic numbers noutros ficheiros.
 * Override: `STRIPE_PRO_MONTHLY_UNIT_AMOUNT_CENTS` (e opcional `NEXT_PUBLIC_…` no cliente).
 */
export function proPlanReferenceMonthlyCentsForUi(): number {
  return readProMonthlyOverrideCents() ?? PRO_MONTHLY_DEFAULT_CENTS;
}

/**
 * Só no servidor: checkout, webhook, API admin. Defina p.ex. `10` = R$ 0,10.
 * **Nota:** em produção a Stripe costuma exigir mínimo maior em BRL (p. ex. R$ 0,50) — 10 cvs pode falhar.
 */
function readProMonthlyOverrideCentsForServer(): number | null {
  if (typeof process === "undefined") return null;
  const raw = process.env.STRIPE_PRO_MONTHLY_UNIT_AMOUNT_CENTS?.trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/**
 * Lê o mesmo que o servidor, mas no browser só existe `NEXT_PUBLIC_STRIPE_PRO_MONTHLY_UNIT_AMOUNT_CENTS`
 * (para alinhar textos/labels ao valor de teste).
 */
function readProMonthlyOverrideCents(): number | null {
  if (typeof process === "undefined") return null;
  const raw =
    process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_UNIT_AMOUNT_CENTS?.trim() ||
    process.env.STRIPE_PRO_MONTHLY_UNIT_AMOUNT_CENTS?.trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/**
 * Pro anual: override opcional (soma total cobrada no intervalo, em centavos BRL), para testar checkout anual.
 */
function readProYearlyOverrideCentsForServer(): number | null {
  if (typeof process === "undefined") return null;
  const raw = process.env.STRIPE_PRO_YEARLY_UNIT_AMOUNT_CENTS?.trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/** Valores alinhados à landing e ao modal de limites (BRL → centavos). */
export function subscriptionLineAmountCents(
  plan: StripeSubscriptionPlanKey,
  cycle: StripeSubscriptionBillingCycle,
): { unitAmount: number; interval: "month" | "year"; label: string } {
  if (cycle === "monthly") {
    if (plan === "pro") {
      const o = readProMonthlyOverrideCentsForServer();
      if (o != null) {
        return { unitAmount: o, interval: "month", label: "Plano Pro (mensal)" };
      }
      return { unitAmount: 127 * 100, interval: "month", label: "Plano Pro (mensal)" };
    }
    return { unitAmount: 347 * 100, interval: "month", label: "Plano Agency (mensal)" };
  }
  if (plan === "pro") {
    const o = readProYearlyOverrideCentsForServer();
    if (o != null) {
      return {
        unitAmount: o,
        interval: "year",
        label: "Plano Pro (anual)",
      };
    }
    return {
      unitAmount: 97 * 12 * 100,
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
  if (plan === "pro" && cycle === "monthly") {
    return readProMonthlyOverrideCentsForServer() ?? PRO_MONTHLY_DEFAULT_CENTS;
  }
  if (plan === "pro" && cycle === "yearly") {
    const y = readProYearlyOverrideCentsForServer();
    if (y != null) {
      return Math.max(1, Math.round(y / 12));
    }
    return PRO_YEARLY_DEFAULT_CENTS;
  }
  if (cycle === "monthly") {
    return 34_700;
  }
  return 26_700;
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
