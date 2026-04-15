"use client";

import type { LucideIcon } from "lucide-react";
import { Barcode, CreditCard, QrCode } from "lucide-react";

import type { ProposalPaymentMethodId } from "@/types/proposal";
import { PROPOSAL_PAYMENT_METHOD_IDS } from "@/types/proposal";
import { cn } from "@/lib/utils";

const ALLOWED = new Set<string>(PROPOSAL_PAYMENT_METHOD_IDS);

export function normalizePlanPaymentMethods(raw: unknown): ProposalPaymentMethodId[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is ProposalPaymentMethodId => typeof m === "string" && ALLOWED.has(m));
}

const METHOD_ORDER: Record<ProposalPaymentMethodId, number> = {
  pix: 0,
  card: 1,
  boleto: 2,
};

export function sortPaymentMethods(methods: ProposalPaymentMethodId[]): ProposalPaymentMethodId[] {
  return [...new Set(methods)].sort((a, b) => METHOD_ORDER[a] - METHOD_ORDER[b]);
}

const META: Record<ProposalPaymentMethodId, { label: string; Icon: LucideIcon }> = {
  pix: { label: "PIX", Icon: QrCode },
  card: { label: "Cartão", Icon: CreditCard },
  boleto: { label: "Boleto", Icon: Barcode },
};

type PickerProps = {
  value: ProposalPaymentMethodId[];
  onChange: (next: ProposalPaymentMethodId[]) => void;
  disabled?: boolean;
  className?: string;
};

export function PlanPaymentMethodsPicker({ value, onChange, disabled, className }: PickerProps) {
  const toggle = (id: ProposalPaymentMethodId) => {
    if (disabled) return;
    const has = value.includes(id);
    onChange(has ? value.filter((x) => x !== id) : sortPaymentMethods([...value, id]));
  };

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} role="group" aria-label="Formas de pagamento">
      {PROPOSAL_PAYMENT_METHOD_IDS.map((id) => {
        const { label, Icon } = META[id];
        const selected = value.includes(id);
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => toggle(id)}
            className={cn(
              "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-[background-color,color,box-shadow]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "bg-brand/12 text-foreground ring-1 ring-brand/25 dark:bg-brand/[0.14] dark:ring-brand/30"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground dark:hover:bg-white/[0.06]",
              disabled && "pointer-events-none opacity-50",
            )}
          >
            <Icon
              className={cn("size-3.5 shrink-0", selected ? "text-brand" : "opacity-70")}
              aria-hidden
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}

type ChipsProps = {
  methods: ProposalPaymentMethodId[];
  accent: "brand" | "emerald";
  className?: string;
};

export function PlanPaymentMethodsChips({ methods, accent, className }: ChipsProps) {
  const sorted = sortPaymentMethods(methods);
  if (!sorted.length) return null;

  const chipAccent =
    accent === "brand"
      ? "border-brand/25 bg-brand/[0.08] text-foreground dark:border-brand/30 dark:bg-brand/10"
      : "border-emerald-500/25 bg-emerald-500/[0.08] text-foreground dark:border-emerald-400/25 dark:bg-emerald-500/10";

  const iconClass = accent === "brand" ? "text-brand" : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {sorted.map((id) => {
        const { label, Icon } = META[id];
        return (
          <span
            key={id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-tight",
              chipAccent,
            )}
          >
            <Icon className={cn("size-3.5 shrink-0", iconClass)} aria-hidden />
            {label}
          </span>
        );
      })}
    </div>
  );
}
