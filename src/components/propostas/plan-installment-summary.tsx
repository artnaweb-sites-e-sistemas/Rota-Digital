"use client";

import { formatCentsAsBrl, parseCurrencyInputToCents } from "@/lib/currency-brl-input";
import { normalizeMaxCardInstallments } from "@/lib/proposal-plan-installments";
import { cn } from "@/lib/utils";

type PlanPriceHeroProps = {
  priceText: string;
  /** Máximo de parcelas no cartão (texto comercial; 1 = só total). */
  maxCardInstallments?: number;
  accent: "brand" | "emerald";
  className?: string;
  /** Valor de lista / original (riscado) quando há preço promocional em `priceText`. */
  struckOriginalText?: string;
  /** Texto ao lado do valor principal (ex.: "/mensal" em planos recorrentes). */
  priceSuffix?: string;
};

const heroPriceClass =
  "font-heading text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-[1.65rem]";

export function PlanPriceHero({
  priceText,
  struckOriginalText,
  maxCardInstallments,
  accent,
  className,
  priceSuffix,
}: PlanPriceHeroProps) {
  const n = normalizeMaxCardInstallments(maxCardInstallments);
  const cents = parseCurrencyInputToCents(priceText);
  const multClass =
    accent === "brand" ? "text-brand" : "text-emerald-600 dark:text-emerald-400";

  const strikeRaw = struckOriginalText?.trim() ?? "";
  const strikeCents = strikeRaw ? parseCurrencyInputToCents(strikeRaw) : null;
  const showStrike = Boolean(strikeRaw && strikeCents !== null && strikeCents > 0);

  const strikeBlock = showStrike ? (
    <p className="text-[13px] font-medium tabular-nums text-muted-foreground line-through decoration-red-500 decoration-2 dark:decoration-red-400 sm:text-sm">
      {strikeRaw}
    </p>
  ) : null;

  if (!priceText.trim() || cents === null || cents <= 0 || n <= 1) {
    const showPrice = Boolean(priceText.trim() && cents !== null && cents > 0);
    const suffix = showPrice && priceSuffix?.trim() ? (
      <span className="text-[1.05rem] font-semibold tabular-nums tracking-tight text-muted-foreground sm:text-[1.2rem]">
        {priceSuffix.trim()}
      </span>
    ) : null;
    return (
      <div className={cn("min-w-0 space-y-1", className)}>
        {strikeBlock}
        <p className={cn(heroPriceClass, "flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5")}>
          <span>{showPrice ? priceText : "—"}</span>
          {suffix}
        </p>
      </div>
    );
  }

  const perInstallmentCents = Math.floor(cents / n);
  const installmentAmountLabel = formatCentsAsBrl(perInstallmentCents);

  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      {strikeBlock}
      <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span
          className={cn(
            "inline-flex items-baseline font-semibold tabular-nums text-base leading-none sm:text-lg",
            multClass,
          )}
        >
          {n}
          <span className="translate-y-px text-[0.82em] font-bold" aria-hidden>
            ×
          </span>
        </span>
        <span className={heroPriceClass}>{installmentAmountLabel}</span>
      </p>
      <p className="text-[11px] font-medium tabular-nums text-muted-foreground sm:text-xs">
        Total: <span className="text-foreground/90">{formatCentsAsBrl(cents)}</span>
      </p>
    </div>
  );
}
