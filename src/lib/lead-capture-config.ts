/** Limites e pacotes — fonte única para `/api/leads-capture` e UI da página de leads. */

export const LEAD_CAPTURE_MAX_PER_RUN = 50;
export const LEAD_CAPTURE_MIN_PER_RUN = 1;
/** Valor legado quando o plano ainda não foi carregado (UI substitui pelo limite real). */
export const LEAD_CAPTURE_FALLBACK_DEFAULT = 25;

export const LEAD_CAPTURE_MONTHLY_LIMIT_BY_PLAN = {
  starter: 30,
  pro: 50,
  agency: 100,
  master: 999_999_999,
} as const;

export type LeadCapturePlanKey = keyof typeof LEAD_CAPTURE_MONTHLY_LIMIT_BY_PLAN;

export const LEAD_CAPTURE_ADD_ON_PACKS = [
  { id: "basic", label: "Básico", leads: 50, price: 37 },
  { id: "pro", label: "Pro", leads: 100, price: 67 },
  { id: "max", label: "Max", leads: 200, price: 127 },
] as const;

export type LeadCaptureAddOnPack = (typeof LEAD_CAPTURE_ADD_ON_PACKS)[number];

export function monthStartUtcMs(nowMs: number): number {
  const now = new Date(nowMs);
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0);
}

export function normalizedSubscriptionPlanKey(raw: unknown): LeadCapturePlanKey {
  const text = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!text) return "starter";
  if (text.includes("master")) return "master";
  if (text.includes("agency") || text.includes("enterprise")) return "agency";
  if (text.includes("starter") || text.includes("free") || text.includes("trial")) return "starter";
  if (text.includes("pro")) return "pro";
  return "starter";
}

/** Limite mensal de leads de captação (Google Places), respeitando override no Firestore e Master. */
export function resolveMonthlyLeadLimit(userSettings: Record<string, unknown>): number {
  const key = normalizedSubscriptionPlanKey(userSettings.subscriptionPlan ?? userSettings.plan);
  const isMaster = key === "master" || userSettings.planMasterUnlimited === true;
  if (isMaster) return LEAD_CAPTURE_MONTHLY_LIMIT_BY_PLAN.master;
  const stored = userSettings.leadCaptureMonthlyLimit;
  if (typeof stored === "number" && Number.isFinite(stored) && stored > 0) {
    return Math.floor(stored);
  }
  return LEAD_CAPTURE_MONTHLY_LIMIT_BY_PLAN[key];
}

/** Máximo de leads que o utilizador pode pedir numa captura (por run e pela cota restante do mês). */
export function allowedMaxResultsPerCapture(args: {
  isMasterPlan: boolean;
  remainingThisMonth: number;
}): number {
  if (args.isMasterPlan) return LEAD_CAPTURE_MAX_PER_RUN;
  return Math.min(LEAD_CAPTURE_MAX_PER_RUN, Math.max(0, args.remainingThisMonth));
}
