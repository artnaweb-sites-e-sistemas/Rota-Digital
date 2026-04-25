import type { ProposalPlan } from "@/types/proposal";

import { PROPOSAL_PLAN_MAX_INSTALLMENTS } from "@/lib/proposal-plan-installments";

export function createEmptyProposalPlan(): ProposalPlan {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "",
    deliverables: "",
    price: "",
    promotionalPrice: "",
    maxCardInstallments: PROPOSAL_PLAN_MAX_INSTALLMENTS,
    paymentTerms: "",
    paymentMethods: [],
  };
}

export function planLooksEmpty(plan: ProposalPlan, kind: "spot" | "recurring" = "spot"): boolean {
  void kind;
  return !(
    plan.title.trim() ||
    plan.deliverables.trim() ||
    plan.price.trim() ||
    plan.promotionalPrice?.trim() ||
    plan.paymentTerms.trim() ||
    (plan.paymentMethods?.length ?? 0) > 0
  );
}
