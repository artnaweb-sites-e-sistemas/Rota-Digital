import { parseCurrencyInputToCents } from "@/lib/currency-brl-input";
import type { ProposalPlan } from "@/types/proposal";

/** Promoção aplicável: preço promocional válido e inferior ao listado. */
export function planHasValidPromotionalOffer(plan: ProposalPlan): boolean {
  const listTrim = plan.price.trim();
  const promoTrim = plan.promotionalPrice?.trim() ?? "";
  const listCents = listTrim ? parseCurrencyInputToCents(listTrim) : null;
  const promoCents = promoTrim ? parseCurrencyInputToCents(promoTrim) : null;
  return (
    promoCents !== null &&
    promoCents > 0 &&
    (listCents === null || listCents <= 0 || promoCents < listCents)
  );
}

/**
 * Valor em centavos a cobrar (promocional, se válido, senão valor base).
 * Usar para Stripe e painel de links.
 */
export function getEffectiveProposalPlanAmountCents(plan: ProposalPlan): number | null {
  const listTrim = plan.price.trim();
  const promoTrim = plan.promotionalPrice?.trim() ?? "";
  const listCents = listTrim ? parseCurrencyInputToCents(listTrim) : null;
  const promoCents = promoTrim ? parseCurrencyInputToCents(promoTrim) : null;

  if (planHasValidPromotionalOffer(plan) && promoCents !== null && promoCents > 0) {
    return promoCents;
  }
  if (listCents !== null && listCents > 0) return listCents;
  return null;
}

/** Preço mostrado no herói e, se aplicável, valor de lista riscado (promo). */
export function resolvePlanDisplayPrices(plan: ProposalPlan): {
  displayPriceText: string;
  struckOriginalText?: string;
} {
  const listTrim = plan.price.trim();
  const promoTrim = plan.promotionalPrice?.trim() ?? "";
  const listCents = listTrim ? parseCurrencyInputToCents(listTrim) : null;

  if (planHasValidPromotionalOffer(plan)) {
    return {
      displayPriceText: promoTrim,
      ...(listTrim && listCents !== null && listCents > 0 ? { struckOriginalText: listTrim } : {}),
    };
  }
  return { displayPriceText: listTrim };
}
