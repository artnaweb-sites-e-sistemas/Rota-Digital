"use client";

import { useMemo } from "react";
import { Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEffectiveProposalPlanAmountCents } from "@/lib/proposal-plan-pricing";
import { normalizeMaxCardInstallments } from "@/lib/proposal-plan-installments";
import type { ProposalPlan } from "@/types/proposal";

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
  plan,
  className,
}: {
  plan: ProposalPlan;
  className?: string;
}) {
  const result = useMemo(() => {
    const priceCents = getEffectiveProposalPlanAmountCents(plan);
    if (!priceCents || priceCents <= 0) return null;

    const n = Math.max(1, normalizeMaxCardInstallments(plan.maxCardInstallments));
    const main = calcStripeFee(priceCents, n);

    return { priceCents, n, main };
  }, [plan]);

  if (!result) return null;

  const { priceCents, n, main } = result;

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
          <span>Condição (estimativa):</span>
          <span>{n === 1 ? "À vista" : `Até ${n}x no cartão`}</span>
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

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/60">
        Estimativa baseada nas taxas padrão do Stripe. O cliente pode escolher outro número de parcelas no
        checkout; valores reais podem variar.
      </p>
    </div>
  );
}
