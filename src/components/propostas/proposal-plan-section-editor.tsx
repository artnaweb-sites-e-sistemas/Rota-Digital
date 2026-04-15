"use client";

import type { LucideIcon } from "lucide-react";
import { Plus, Trash2 } from "lucide-react";

import { PlanPaymentMethodsPicker, normalizePlanPaymentMethods, sortPaymentMethods } from "@/components/propostas/plan-payment-methods";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrencyInput } from "@/lib/currency-brl-input";
import { PROPOSAL_PLAN_MAX_INSTALLMENTS, normalizeInstallmentCount } from "@/lib/proposal-plan-installments";
import type { ProposalPaymentMethodId, ProposalPlan } from "@/types/proposal";

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
}) {
  return (
    <Card className="overflow-hidden border-border bg-card shadow-xl dark:border-white/5 dark:bg-white/[0.02]">
      <CardHeader className="border-b border-border pb-5 dark:border-white/5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-md bg-brand/10 ring-1 ring-brand/20">
              <Icon className="size-4 text-brand" aria-hidden />
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
        {plans.map((plan, index) => (
          <div
            key={plan.id}
            className="space-y-4 rounded-2xl border border-border bg-background/70 p-5 dark:border-white/10 dark:bg-white/[0.03]"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Plano {index + 1}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Defina escopo, valor e forma de pagamento.</p>
              </div>
              {plans.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="gap-2 text-red-600 hover:text-red-700 dark:text-red-300"
                  onClick={() => onRemove(plan.id)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Remover
                </Button>
              ) : null}
            </div>

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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(7.25rem,8.5rem)] md:col-span-2">
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
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${plan.id}-deliverables`}>Entregáveis</Label>
              <Textarea
                id={`${plan.id}-deliverables`}
                value={plan.deliverables}
                onChange={(e) => onChange(plan.id, "deliverables", e.target.value)}
                className="min-h-28"
                placeholder="Liste os entregáveis deste plano. Pode usar linhas separadas."
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
        ))}
      </CardContent>
    </Card>
  );
}
