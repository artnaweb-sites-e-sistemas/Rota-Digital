import { normalizedSubscriptionPlanKey } from "@/lib/plan-quotas";

export type PlanId = "starter" | "pro" | "agency" | "master";

export interface PlanFeatures {
  gmbAnalysis: boolean;
  competitorAnalysis: boolean;
}

export const PLAN_FEATURES: Record<PlanId, PlanFeatures> = {
  starter: { gmbAnalysis: false, competitorAnalysis: false },
  pro: { gmbAnalysis: true, competitorAnalysis: true },
  agency: { gmbAnalysis: true, competitorAnalysis: true },
  master: { gmbAnalysis: true, competitorAnalysis: true },
};

/** Plano comercial a partir do documento `userSettings` (sem I/O). */
export function planIdFromUserSettings(userSettings: Record<string, unknown> | null | undefined): PlanId {
  if (!userSettings) return "starter";
  if (userSettings.planMasterUnlimited === true) return "master";
  return normalizedSubscriptionPlanKey(userSettings.subscriptionPlan ?? userSettings.plan) as PlanId;
}
