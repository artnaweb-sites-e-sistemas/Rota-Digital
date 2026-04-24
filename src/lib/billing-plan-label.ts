import { normalizedSubscriptionPlanKey, type PlanKey } from "@/lib/plan-quotas";

/** Plano comercial / Master — usado no painel (sidebar, admin). */
export type SidebarBillingPlan = "Starter" | "Pro" | "Agency" | "Master";

const PLAN_KEY_TO_SIDEBAR: Record<PlanKey, SidebarBillingPlan> = {
  starter: "Starter",
  pro: "Pro",
  agency: "Agency",
  master: "Master",
};

/**
 * Plano a partir de um único campo (ex.: célula na tabela admin).
 * Alinhado a `normalizedSubscriptionPlanKey`: vazio / desconhecido → **Starter** (não Pro).
 */
export function billingPlanFromUserSettingsRaw(raw: unknown): SidebarBillingPlan {
  return PLAN_KEY_TO_SIDEBAR[normalizedSubscriptionPlanKey(raw)];
}

/**
 * Plano a partir do documento `userSettings` completo (sidebar em tempo real).
 * Respeita `planMasterUnlimited` (Master) como o resto da aplicação.
 */
export function billingPlanFromUserSettingsDoc(
  raw: Record<string, unknown> | null | undefined,
): SidebarBillingPlan {
  if (!raw) return "Starter";
  if (raw.planMasterUnlimited === true) return "Master";
  return billingPlanFromUserSettingsRaw(raw.subscriptionPlan ?? raw.plan);
}

/** Texto curto para o chip do sidebar (ex.: "Plano Pro"). */
export function sidebarPlanBadgeLabel(plan: SidebarBillingPlan): string {
  const labels: Record<SidebarBillingPlan, string> = {
    Starter: "Plano Starter",
    Pro: "Plano Pro",
    Agency: "Plano Agency",
    Master: "Plano Master",
  };
  return labels[plan];
}

/** Borda/fundo/texto do chip de plano (sidebar, admin) — Starter neutro, Pro amarelo, Agency violeta, Master âmbar. */
export function planBadgeVisualClasses(plan: SidebarBillingPlan): string {
  switch (plan) {
    case "Master":
      return "border-amber-400/40 bg-gradient-to-br from-amber-500/15 to-amber-600/10 text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.12)] dark:border-amber-400/45 dark:from-amber-500/20 dark:to-amber-700/10 dark:text-amber-100";
    case "Starter":
      return "border-border/50 bg-muted/60 text-muted-foreground dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-400";
    case "Pro":
      return "border-brand/30 bg-brand/[0.1] text-brand dark:border-brand/40 dark:bg-brand/15 dark:text-brand";
    case "Agency":
      return "border-violet-500/35 bg-violet-500/10 text-violet-800 dark:border-violet-400/30 dark:bg-violet-500/15 dark:text-violet-200";
  }
}
