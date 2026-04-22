/**
 * Fonte única de verdade para cotas por plano: limites (Rota Digital, leads, propostas),
 * pacotes adicionais e cálculo do início do ciclo de renovação.
 *
 * Usado pelos endpoints que enforçam cota e pela UI que mostra o modal de limite.
 */

import {
  LEAD_CAPTURE_ADD_ON_PACKS,
  LEAD_CAPTURE_MONTHLY_LIMIT_BY_PLAN,
  monthStartUtcMs,
  normalizedSubscriptionPlanKey,
  type LeadCapturePlanKey,
} from "@/lib/lead-capture-config";

export type PlanKey = LeadCapturePlanKey;

export const UNLIMITED_QUOTA = 999_999_999;

/** Limites por plano e por recurso. Reset acontece por ciclo de assinatura. */
export const PLAN_QUOTAS = {
  starter: { rotas: 2, leads: 30, propostas: 2 },
  pro: { rotas: 20, leads: 50, propostas: 30 },
  agency: { rotas: 50, leads: 100, propostas: UNLIMITED_QUOTA },
  master: { rotas: UNLIMITED_QUOTA, leads: UNLIMITED_QUOTA, propostas: UNLIMITED_QUOTA },
} as const satisfies Record<PlanKey, { rotas: number; leads: number; propostas: number }>;

export type QuotaResource = "rotas" | "leads" | "propostas";

/**
 * Pacotes adicionais, só oferecidos a planos pagos (Pro/Agency).
 * Preços ligeiramente mais altos para manter margem e incentivar upgrade.
 */
export const ROTAS_ADD_ON_PACKS = [
  /** Temporário: R$ 0,50 para teste em produção (repor price real depois). */
  { id: "basic", label: "Básico", rotas: 5, price: 0.5 },
  { id: "pro", label: "Pro", rotas: 15, price: 147 },
  { id: "max", label: "Max", rotas: 30, price: 247 },
] as const;

export const PROPOSALS_ADD_ON_PACKS = [
  /** Temporário: R$ 0,50 para teste em produção (repor price real depois). */
  { id: "basic", label: "Básico", proposals: 10, price: 0.5 },
  { id: "pro", label: "Pro", proposals: 25, price: 97 },
  { id: "max", label: "Max", proposals: 60, price: 177 },
] as const;

export const LEADS_ADD_ON_PACKS = LEAD_CAPTURE_ADD_ON_PACKS;

export type RotasAddOnPack = (typeof ROTAS_ADD_ON_PACKS)[number];
export type ProposalsAddOnPack = (typeof PROPOSALS_ADD_ON_PACKS)[number];
export type LeadsAddOnPack = (typeof LEADS_ADD_ON_PACKS)[number];

/** Diferença Pro (R$127) → Agency (R$347). Mostrado no upsell da Agency. */
export const PRO_TO_AGENCY_MONTHLY_DIFF_BRL = 220;

/** Plano mensal em BRL (fonte de verdade para comparações). */
export const PLAN_MONTHLY_PRICE_BRL = {
  starter: 0,
  pro: 127,
  agency: 347,
  master: 0,
} as const satisfies Record<PlanKey, number>;

/**
 * Início do ciclo de cota em ms UTC.
 *
 * - Se `userSettings.subscriptionCycleAnchorAt` existir (ms), usa janela de 30 dias a partir do marco.
 * - Caso contrário, cai no início do mês calendário UTC (mantém compatibilidade com leads legados).
 */
export function resolveCycleStartMs(
  userSettings: Record<string, unknown> | null | undefined,
  nowMs: number = Date.now(),
): number {
  const anchorRaw = userSettings?.subscriptionCycleAnchorAt;
  const anchorMs =
    typeof anchorRaw === "number" && Number.isFinite(anchorRaw) && anchorRaw > 0
      ? Math.floor(anchorRaw)
      : null;
  if (anchorMs == null || anchorMs > nowMs) {
    return monthStartUtcMs(nowMs);
  }
  const windowMs = 30 * 24 * 60 * 60 * 1000;
  const elapsed = nowMs - anchorMs;
  const completedWindows = Math.floor(elapsed / windowMs);
  return anchorMs + completedWindows * windowMs;
}

/** Limite do recurso para o plano, respeitando Master (ilimitado). */
export function resolveQuotaLimit(
  userSettings: Record<string, unknown> | null | undefined,
  resource: QuotaResource,
): { plan: PlanKey; limit: number; isUnlimited: boolean } {
  const plan = normalizedSubscriptionPlanKey(
    userSettings?.subscriptionPlan ?? userSettings?.plan,
  );
  const isMaster = plan === "master" || userSettings?.planMasterUnlimited === true;
  if (isMaster) {
    return { plan: "master", limit: UNLIMITED_QUOTA, isUnlimited: true };
  }
  const baseline = PLAN_QUOTAS[plan][resource];
  if (resource === "leads") {
    const storedRaw = userSettings?.leadCaptureMonthlyLimit;
    if (typeof storedRaw === "number" && Number.isFinite(storedRaw) && storedRaw > 0) {
      return { plan, limit: Math.floor(storedRaw), isUnlimited: false };
    }
  }
  if (resource === "rotas" && baseline < UNLIMITED_QUOTA) {
    const bonus = userSettings?.rotasQuotaBonus;
    if (typeof bonus === "number" && Number.isFinite(bonus) && bonus > 0) {
      return { plan, limit: Math.floor(baseline + bonus), isUnlimited: false };
    }
  }
  if (resource === "propostas" && baseline < UNLIMITED_QUOTA) {
    const bonus = userSettings?.propostasQuotaBonus;
    if (typeof bonus === "number" && Number.isFinite(bonus) && bonus > 0) {
      return { plan, limit: Math.floor(baseline + bonus), isUnlimited: false };
    }
  }
  return { plan, limit: baseline, isUnlimited: baseline >= UNLIMITED_QUOTA };
}

/** Verdadeiro se o plano está entre os que podem ter logo/capa próprios. */
export function planAllowsCustomLogo(
  userSettings: Record<string, unknown> | null | undefined,
): boolean {
  if (userSettings == null) return false;
  if (userSettings.planMasterUnlimited === true) return true;
  const fromSub = String(userSettings.subscriptionPlan ?? "").trim();
  const fromPlan = String(userSettings.plan ?? "").trim();
  const planText = fromSub || fromPlan;
  /** Sem plano explícito no documento não assumir Pro (evita Starter com campos vazios “virar” Pro). */
  if (!planText) return false;
  const plan = normalizedSubscriptionPlanKey(planText);
  if (plan === "master") return true;
  return plan === "pro" || plan === "agency";
}

export { normalizedSubscriptionPlanKey, LEAD_CAPTURE_MONTHLY_LIMIT_BY_PLAN };
