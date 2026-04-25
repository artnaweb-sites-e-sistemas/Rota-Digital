import type { ProposalPaymentMethodId, ProposalPlan } from "@/types/proposal";
import { PROPOSAL_PAYMENT_METHOD_IDS } from "@/types/proposal";
import { normalizeMaxCardInstallments } from "@/lib/proposal-plan-installments";

function newPlanId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isPaymentMethodId(v: string): v is ProposalPaymentMethodId {
  return (PROPOSAL_PAYMENT_METHOD_IDS as readonly string[]).includes(v);
}

/** Lê um plano a partir de dados persistidos (Firestore, etc.). */
export function coerceProposalPlan(raw: unknown): ProposalPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : newPlanId();

  const title = typeof o.title === "string" ? o.title : "";
  const deliverables = typeof o.deliverables === "string" ? o.deliverables : "";
  const price = typeof o.price === "string" ? o.price : "";
  const paymentTerms = typeof o.paymentTerms === "string" ? o.paymentTerms : "";

  const promotionalPrice = typeof o.promotionalPrice === "string" ? o.promotionalPrice : "";

  let maxCardInstallments: number;
  if (typeof o.maxCardInstallments === "number" && Number.isFinite(o.maxCardInstallments)) {
    maxCardInstallments = normalizeMaxCardInstallments(o.maxCardInstallments);
  } else if (typeof o.installmentCount === "number" && Number.isFinite(o.installmentCount)) {
    maxCardInstallments = normalizeMaxCardInstallments(o.installmentCount);
  } else {
    maxCardInstallments = 12;
  }

  let paymentMethods: ProposalPaymentMethodId[] | undefined;
  if (Array.isArray(o.paymentMethods)) {
    paymentMethods = o.paymentMethods.filter(
      (x): x is ProposalPaymentMethodId => typeof x === "string" && isPaymentMethodId(x),
    );
  }

  const paymentUrl = typeof o.paymentUrl === "string" && o.paymentUrl.trim() ? o.paymentUrl.trim() : undefined;

  return {
    id,
    title,
    deliverables,
    price,
    promotionalPrice,
    maxCardInstallments,
    paymentTerms,
    paymentMethods,
    ...(paymentUrl ? { paymentUrl } : {}),
  };
}

export function coerceProposalPlansArray(raw: unknown): ProposalPlan[] {
  if (!Array.isArray(raw)) return [];
  const out: ProposalPlan[] = [];
  for (const item of raw) {
    const p = coerceProposalPlan(item);
    if (p) out.push(p);
  }
  return out;
}

/** Cópia para uma proposta nova: novos `id` e arrays internos, sem partilhar referências. */
export function clonePlansForNewProposal(plans: ProposalPlan[]): ProposalPlan[] {
  return plans.map((p) => ({
    ...p,
    id: newPlanId(),
    paymentMethods: p.paymentMethods ? [...p.paymentMethods] : [],
  }));
}

/** Planos recorrentes: preço mensal — não persistir parcelas nem valor “à vista” parcelado. */
export function normalizeRecurringPlanForSave(plan: ProposalPlan): ProposalPlan {
  return {
    ...plan,
    maxCardInstallments: 1,
  };
}

export function normalizeRecurringPlansForSave(plans: ProposalPlan[]): ProposalPlan[] {
  return plans.map(normalizeRecurringPlanForSave);
}

/** Objeto seguro para gravar no Firestore (sem `undefined`). */
export function proposalPlanToFirestoreValue(plan: ProposalPlan): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: plan.id,
    title: plan.title,
    deliverables: plan.deliverables,
    price: plan.price,
    promotionalPrice: plan.promotionalPrice ?? "",
    maxCardInstallments: normalizeMaxCardInstallments(plan.maxCardInstallments),
    paymentTerms: plan.paymentTerms,
    paymentMethods: plan.paymentMethods ?? [],
  };
  if (plan.paymentUrl) base.paymentUrl = plan.paymentUrl;
  return base;
}
