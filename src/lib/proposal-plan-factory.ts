import type { ProposalPlan } from "@/types/proposal";

import { normalizeInstallmentCount } from "@/lib/proposal-plan-installments";

export function createEmptyProposalPlan(): ProposalPlan {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "",
    deliverables: "",
    price: "",
    promotionalPrice: "",
    installmentCount: 1,
    paymentTerms: "",
    paymentMethods: [],
  };
}

export function planLooksEmpty(plan: ProposalPlan): boolean {
  const installments = normalizeInstallmentCount(plan.installmentCount);
  return !(
    plan.title.trim() ||
    plan.deliverables.trim() ||
    plan.price.trim() ||
    plan.promotionalPrice?.trim() ||
    plan.paymentTerms.trim() ||
    (plan.paymentMethods?.length ?? 0) > 0 ||
    installments > 1
  );
}
