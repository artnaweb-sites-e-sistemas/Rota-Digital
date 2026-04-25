"use client";

import { useMemo } from "react";
import { Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseCurrencyInputToCents } from "@/lib/currency-brl-input";

function calcStripeFee(amountCents: number, installments: number) {
  const rate = 0.034 + 0.005 * Math.max(0, installments - 1);
  const fixedFee = 40;
  const fee = Math.round(amountCents * rate) + fixedFee;
  return { rate, fee, net: amountCents - fee };
}

function formatBrl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatPercent(rate: number): string {
  return `~${(rate * 100).toFixed(1)}%`;
}

export function PlanStripeFeeSimulator({
  priceText,
  installments,
  discountPriceText,
  className,
}: {
  priceText: string;
  installments: number;
  discountPriceText?: string;
  className?: string;
}) {
  const result = useMemo(() => {
    const priceCents = parseCurrencyInputToCents(priceText);
    if (!priceCents || priceCents <= 0) return null;

    const n = Math.max(1, installments);
    const main = calcStripeFee(priceCents, n);

    let discount: ReturnType<typeof calcStripeFee> | null = null;
    const discountCents = discountPriceText ? parseCurrencyInputToCents(discountPriceText) : null;
    if (discountCents && discountCents > 0 && discountCents < priceCents) {
      discount = calcStripeFee(discountCents, 1);
    }

    return { priceCents, n, main, discount, discountCents };
  }, [priceText, installments, discountPriceText]);

  if (!result) return null;

  const { priceCents, n, main, discount, discountCents } = result;

  return (
    <div
      className={cn(
        "rounded-lg border border-border/40 bg-muted/20 px-4 py-3 dark:border-white/8 dark:bg-white/[0.02]",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <Calculator className="size-3.5 text-muted-foreground/70" aria-hidden />
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
          Estimativa de recebimento
        </p>
      </div>

      <div className="space-y-1 text-[13px] text-muted-foreground">
        <div className="flex justify-between">
          <span>Valor do serviço:</span>
          <span className="font-medium text-foreground/80">{formatBrl(priceCents)}</span>
        </div>
        <div className="flex justify-between">
          <span>Condição:</span>
          <span>{n === 1 ? "À vista" : `${n}x sem juros`}</span>
        </div>
        <div className="flex justify-between">
          <span>Taxa Stripe estimada:</span>
          <span>
            {formatPercent(main.rate)} = {formatBrl(main.fee)}
          </span>
        </div>
        <div className="flex justify-between border-t border-border/30 pt-1 dark:border-white/6">
          <span className="font-medium">Você vai receber:</span>
          <span className="font-semibold text-foreground/90">≈ {formatBrl(main.net)}</span>
        </div>
      </div>

      {discount && discountCents ? (
        <div className="mt-3 space-y-1 border-t border-border/30 pt-2 text-[13px] text-muted-foreground dark:border-white/6">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            À vista com desconto
          </p>
          <div className="flex justify-between">
            <span>Valor:</span>
            <span className="font-medium text-foreground/80">{formatBrl(discountCents)}</span>
          </div>
          <div className="flex justify-between">
            <span>Taxa estimada:</span>
            <span>
              {formatPercent(discount.rate)} = {formatBrl(discount.fee)}
            </span>
          </div>
          <div className="flex justify-between border-t border-border/30 pt-1 dark:border-white/6">
            <span className="font-medium">Você vai receber:</span>
            <span className="font-semibold text-foreground/90">≈ {formatBrl(discount.net)}</span>
          </div>
        </div>
      ) : null}

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/60">
        Estimativa baseada nas taxas padrão do Stripe. Valores reais podem variar.
      </p>
    </div>
  );
}
