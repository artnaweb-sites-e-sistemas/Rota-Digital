"use client";

import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";

import { DeliverablesFormatHint } from "@/components/propostas/deliverables-format-hint";
import { PlanPaymentMethodsPicker, normalizePlanPaymentMethods, sortPaymentMethods } from "@/components/propostas/plan-payment-methods";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatCurrencyInput } from "@/lib/currency-brl-input";
import { PROPOSAL_PLAN_MAX_INSTALLMENTS, normalizeInstallmentCount } from "@/lib/proposal-plan-installments";
import type { ProposalPaymentMethodId, ProposalPlan } from "@/types/proposal";

/** Pontual = ouro da marca; recorrente = verde (como na vista da proposta). */
export type ProposalPlanSectionAccent = "spot" | "emerald";

export function ProposalPlanSectionEditor({
  title,
  description,
  icon: Icon,
  plans,
  onChange,
  onInstallmentCountChange,
  onPaymentMethodsChange,
  onAdd,
  onRemove,
  hideInstallments = false,
  accent,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  plans: ProposalPlan[];
  onChange: (planId: string, field: keyof ProposalPlan, value: string) => void;
  onInstallmentCountChange: (planId: string, count: number) => void;
  onPaymentMethodsChange: (planId: string, methods: ProposalPaymentMethodId[]) => void;
  onAdd: () => void;
  onRemove: (planId: string) => void;
  /** Planos recorrentes: sem parcelas / à vista (valor mensal). */
  hideInstallments?: boolean;
  accent?: ProposalPlanSectionAccent;
}) {
  const [collapsedByPlanId, setCollapsedByPlanId] = useState<Record<string, boolean>>({});

  const setPlanCollapsed = useCallback((planId: string, collapsed: boolean) => {
    setCollapsedByPlanId((prev) => ({ ...prev, [planId]: collapsed }));
  }, []);

  useEffect(() => {
    const ids = new Set(plans.map((p) => p.id));
    setCollapsedByPlanId((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next)) {
        if (!ids.has(key)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [plans]);

  const accentCard =
    accent === "spot"
      ? "border-l-[3px] border-l-brand/70 bg-gradient-to-b from-brand/[0.09] via-transparent to-transparent dark:border-l-brand/55 dark:from-brand/[0.12]"
      : accent === "emerald"
        ? "border-l-[3px] border-l-emerald-700/45 bg-gradient-to-b from-emerald-600/[0.04] via-transparent to-transparent dark:border-l-emerald-500/35 dark:from-emerald-500/[0.06]"
        : "";

  const accentHeaderBorder =
    accent === "spot"
      ? "border-brand/20 dark:border-brand/25"
      : accent === "emerald"
        ? "border-emerald-800/12 dark:border-emerald-500/12"
        : "border-border dark:border-white/5";

  const accentIconWrap =
    accent === "spot"
      ? "bg-brand/12 ring-brand/30 dark:bg-brand/15 dark:ring-brand/35"
      : accent === "emerald"
        ? "bg-emerald-600/[0.07] ring-emerald-700/18 dark:bg-emerald-500/[0.08] dark:ring-emerald-400/15"
        : "bg-brand/10 ring-brand/20";

  const accentIconClass =
    accent === "spot"
      ? "text-brand dark:text-brand"
      : accent === "emerald"
        ? "text-emerald-800 dark:text-emerald-600/90"
        : "text-brand";

  const accentPlanShell =
    accent === "spot"
      ? "border-brand/25 bg-brand/[0.04] dark:border-brand/30 dark:bg-brand/[0.07]"
      : accent === "emerald"
        ? "border-emerald-800/14 bg-emerald-700/[0.025] dark:border-emerald-500/15 dark:bg-emerald-500/[0.04]"
        : "border-border bg-background/70 dark:border-white/10 dark:bg-white/[0.03]";

  const accentPlanLabel =
    accent === "spot"
      ? "text-brand/90 dark:text-brand/80"
      : accent === "emerald"
        ? "text-emerald-900/80 dark:text-zinc-400"
        : "text-muted-foreground";

  const accentFocusRing =
    accent === "emerald"
      ? "focus-visible:ring-emerald-700/30 dark:focus-visible:ring-emerald-500/28"
      : "focus-visible:ring-brand/45";

  return (
    <Card
      className={cn(
        "overflow-hidden border-border bg-card shadow-xl dark:border-white/5 dark:bg-white/[0.02]",
        accentCard,
      )}
    >
      <CardHeader className={cn("border-b pb-5", accentHeaderBorder)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "mt-1 flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-md ring-1",
                accentIconWrap,
              )}
            >
              <Icon className={cn("size-4", accentIconClass)} aria-hidden />
            </div>
            <div>
              <CardTitle className="text-xl font-bold leading-tight text-foreground">{title}</CardTitle>
              <CardDescription className="mt-1 text-sm leading-snug text-muted-foreground">
                {description}
              </CardDescription>
            </div>
          </div>
          <Button type="button" variant="outline" className="gap-2" onClick={onAdd}>
            <Plus className="size-4" aria-hidden />
            Adicionar plano
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-6">
        {plans.map((plan, index) => {
          /** Por omissão colapsado (entrada ausente); só expande com `false` explícito. */
          const isCollapsed = collapsedByPlanId[plan.id] !== false;
          const summaryTitle = plan.title.trim() || "Sem título";

          return (
          <div key={plan.id} className={cn("rounded-md border p-5", accentPlanShell)}>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPlanCollapsed(plan.id, !isCollapsed)}
                aria-expanded={!isCollapsed}
                className={cn(
                  "min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  accentFocusRing,
                )}
              >
                <p className={cn("text-xs font-semibold uppercase tracking-[0.2em]", accentPlanLabel)}>
                  Plano {index + 1}
                </p>
                {isCollapsed ? (
                  <p className="mt-1 truncate text-sm font-medium text-foreground">{summaryTitle}</p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Defina escopo, valor e forma de pagamento.
                  </p>
                )}
              </button>
              <div className="flex shrink-0 items-center gap-2">
                {plans.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="gap-2 font-medium text-red-700 hover:bg-red-500/12 hover:text-red-900 dark:text-red-400 dark:hover:bg-red-500/18 dark:hover:text-red-200"
                    onClick={() => onRemove(plan.id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Remover
                  </Button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setPlanCollapsed(plan.id, !isCollapsed)}
                  aria-expanded={!isCollapsed}
                  aria-label={isCollapsed ? "Expandir plano" : "Recolher plano"}
                  className={cn(
                    "inline-flex size-9 shrink-0 items-center justify-center rounded-lg",
                    "border border-border/70 bg-muted/45 text-muted-foreground",
                    "transition-transform duration-200",
                    "hover:bg-muted/65 dark:border-white/12 dark:bg-white/[0.07] dark:hover:bg-white/[0.11]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    accentFocusRing,
                  )}
                >
                  <ChevronDown
                    className={cn("size-5 transition-transform duration-200", isCollapsed && "-rotate-90")}
                    aria-hidden
                  />
                </button>
              </div>
            </div>

            <div
              className={cn(
                "mt-4 space-y-4 border-t border-border/60 pt-4 dark:border-white/10",
                isCollapsed && "hidden",
              )}
            >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`${plan.id}-title`}>Título do plano</Label>
                <Input
                  id={`${plan.id}-title`}
                  value={plan.title}
                  onChange={(e) => onChange(plan.id, "title", e.target.value)}
                  placeholder="Ex.: Website institucional estratégico"
                  className="h-10"
                />
              </div>
              <div
                className={cn(
                  "grid grid-cols-1 gap-4 sm:grid-cols-2 md:col-span-2",
                  !hideInstallments && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(7.25rem,8.5rem)]",
                )}
              >
                <div className="space-y-2">
                  <Label htmlFor={`${plan.id}-price`}>Valor</Label>
                  <Input
                    id={`${plan.id}-price`}
                    value={plan.price}
                    inputMode="numeric"
                    onChange={(e) => onChange(plan.id, "price", formatCurrencyInput(e.target.value))}
                    placeholder="Ex.: R$ 2.500,00"
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${plan.id}-promo`}>
                    Promocional <span className="font-normal text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id={`${plan.id}-promo`}
                    value={plan.promotionalPrice ?? ""}
                    inputMode="numeric"
                    onChange={(e) => onChange(plan.id, "promotionalPrice", formatCurrencyInput(e.target.value))}
                    placeholder="Ex.: R$ 1.990,00"
                    className="h-10"
                  />
                </div>
                {!hideInstallments ? (
                  <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                    <Label htmlFor={`${plan.id}-installments`}>Parcelas</Label>
                    <Select
                      value={String(normalizeInstallmentCount(plan.installmentCount))}
                      onValueChange={(v) => onInstallmentCountChange(plan.id, Number(v))}
                    >
                      <SelectTrigger id={`${plan.id}-installments`} className="h-10 w-full">
                        <SelectValue placeholder="Parcelas" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: PROPOSAL_PLAN_MAX_INSTALLMENTS }, (_, i) => i + 1).map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n === 1 ? "À vista" : `${n}×`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
              {!hideInstallments && normalizeInstallmentCount(plan.installmentCount) > 1 ? (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`${plan.id}-cash`}>
                    À vista <span className="font-normal text-muted-foreground">(opcional)</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Valor se pagar em uma só vez, quando for diferente do total parcelado (ex.: sem juros do cartão).
                  </p>
                  <Input
                    id={`${plan.id}-cash`}
                    value={plan.cashPrice ?? ""}
                    inputMode="numeric"
                    onChange={(e) => onChange(plan.id, "cashPrice", formatCurrencyInput(e.target.value))}
                    placeholder="Ex.: R$ 1.200,00"
                    className="h-10 max-w-md"
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor={`${plan.id}-deliverables`}>Entregáveis</Label>
                <DeliverablesFormatHint />
              </div>
              <Textarea
                id={`${plan.id}-deliverables`}
                value={plan.deliverables}
                onChange={(e) => onChange(plan.id, "deliverables", e.target.value)}
                className="min-h-28"
                placeholder="Liste os entregáveis incluídos neste plano."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${plan.id}-payment`}>Condição e forma de pagamento</Label>
              <Textarea
                id={`${plan.id}-payment`}
                value={plan.paymentTerms}
                onChange={(e) => onChange(plan.id, "paymentTerms", e.target.value)}
                className="min-h-24"
                placeholder="Ex.: 50% no aceite e 50% na entrega."
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Formas de pagamento</p>
              <PlanPaymentMethodsPicker
                value={sortPaymentMethods(normalizePlanPaymentMethods(plan.paymentMethods))}
                onChange={(next) => onPaymentMethodsChange(plan.id, next)}
              />
            </div>
            </div>
          </div>
        );
        })}
      </CardContent>
    </Card>
  );
}
