import type { ProposalPaymentMethodId, ProposalPlan } from "@/types/proposal";
import { PROPOSAL_PAYMENT_METHOD_IDS } from "@/types/proposal";
import { normalizeInstallmentCount } from "@/lib/proposal-plan-installments";

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
  const cashPrice = typeof o.cashPrice === "string" ? o.cashPrice : "";

  let installmentCount: number | undefined;
  if (typeof o.installmentCount === "number" && Number.isFinite(o.installmentCount)) {
    installmentCount = normalizeInstallmentCount(o.installmentCount);
  } else {
    installmentCount = 1;
  }

  let paymentMethods: ProposalPaymentMethodId[] | undefined;
  if (Array.isArray(o.paymentMethods)) {
    paymentMethods = o.paymentMethods.filter(
      (x): x is ProposalPaymentMethodId => typeof x === "string" && isPaymentMethodId(x),
    );
  }

  return {
    id,
    title,
    deliverables,
    price,
    promotionalPrice,
    installmentCount,
    ...(cashPrice.trim() ? { cashPrice } : {}),
    paymentTerms,
    paymentMethods,
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
    installmentCount: 1,
    cashPrice: "",
  };
}

export function normalizeRecurringPlansForSave(plans: ProposalPlan[]): ProposalPlan[] {
  return plans.map(normalizeRecurringPlanForSave);
}

/** Objeto seguro para gravar no Firestore (sem `undefined`). */
export function proposalPlanToFirestoreValue(plan: ProposalPlan): Record<string, unknown> {
  return {
    id: plan.id,
    title: plan.title,
    deliverables: plan.deliverables,
    price: plan.price,
    promotionalPrice: plan.promotionalPrice ?? "",
    installmentCount: normalizeInstallmentCount(plan.installmentCount),
    cashPrice: plan.cashPrice?.trim() ?? "",
    paymentTerms: plan.paymentTerms,
    paymentMethods: plan.paymentMethods ?? [],
  };
}
