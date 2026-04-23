"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  FileWarning,
  Lightbulb,
  Loader2,
  OctagonAlert,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react";

import type { AdminPlanUsageMetricsRow, AdminUsageMetricsResponse } from "@/types/admin-usage-metrics";
import {
  billingPlanFromUserSettingsRaw,
  planBadgeVisualClasses,
  type SidebarBillingPlan,
} from "@/lib/billing-plan-label";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { User } from "firebase/auth";

function formatCount(n: number) {
  return n.toLocaleString("pt-BR");
}

function planRowLabel(plan: string): SidebarBillingPlan {
  return billingPlanFromUserSettingsRaw(plan);
}

function formatPeriodCaption(body: AdminUsageMetricsResponse): string {
  try {
    const start = new Date(body.periodStartUtcIso);
    const endExcl = new Date(body.periodEndExclusiveUtcIso);
    const last = new Date(endExcl.getTime() - 1);
    const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" };
    return `${start.toLocaleDateString("pt-BR", opts)} — ${last.toLocaleDateString("pt-BR", opts)} (UTC)`;
  } catch {
    return `Mês ${body.month}/${body.year} (UTC)`;
  }
}

function formatInsightMonthLabel(body: AdminUsageMetricsResponse): string {
  try {
    const raw = new Date(Date.UTC(body.year, body.month - 1, 1)).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  } catch {
    return `${body.month}/${body.year}`;
  }
}

type PlanInsight = {
  Icon: LucideIcon;
  iconClassName: string;
  paragraphs: string[];
};

/**
 * Taxas em % e mensagem pela primeira condição verdadeira, na ordem pedida.
 */
function computePlanInsight(row: AdminPlanUsageMetricsRow): PlanInsight {
  const totalUsuarios = row.totalUsers;
  if (totalUsuarios === 0) {
    return {
      Icon: UserRoundPlus,
      iconClassName: "text-muted-foreground",
      paragraphs: [
        "Nenhum utilizador neste plano ainda.",
        "O foco agora deve ser aquisição — marketing, indicações e conversão de trials.",
      ],
    };
  }

  const taxaAtivacaoRelatorio = (row.usersWithAtLeastOneReport / totalUsuarios) * 100;
  const taxaLimiteRelatorio = (row.usersAtReportLimit / totalUsuarios) * 100;
  const taxaAtivacaoProposta = (row.usersWithAtLeastOneProposal / totalUsuarios) * 100;

  if (taxaAtivacaoRelatorio === 0) {
    return {
      Icon: AlertTriangle,
      iconClassName: "text-amber-600 dark:text-amber-400",
      paragraphs: [
        "Nenhum utilizador deste plano gerou um relatório este mês. O problema não é o limite — é engajamento.",
        "Recomendação: crie um e-mail de onboarding mostrando passo a passo como gerar a primeira Rota Digital.",
        "Utilizadores que não ativam nos primeiros 7 dias raramente ficam.",
      ],
    };
  }

  if (taxaAtivacaoRelatorio > 0 && taxaAtivacaoRelatorio < 50 && taxaLimiteRelatorio === 0) {
    return {
      Icon: BarChart3,
      iconClassName: "text-blue-600 dark:text-blue-400",
      paragraphs: [
        "Menos da metade dos utilizadores estão a usar relatórios. O produto está a ser descoberto, mas ainda não virou hábito.",
        "Recomendação: sequência de e-mails educativos com casos de uso reais — por exemplo, «como usar a Rota Digital para fechar um cliente».",
      ],
    };
  }

  if (taxaAtivacaoRelatorio >= 50 && taxaLimiteRelatorio < 30) {
    return {
      Icon: CheckCircle2,
      iconClassName: "text-emerald-600 dark:text-emerald-400",
      paragraphs: [
        "Boa taxa de ativação: a maioria está usando o produto e ainda tem margem de cota.",
        "Continue monitorando. Se esse padrão se mantiver por 2 meses, o plano está bem calibrado.",
      ],
    };
  }

  if (taxaLimiteRelatorio >= 30 && taxaLimiteRelatorio < 60) {
    return {
      Icon: Bell,
      iconClassName: "text-amber-600 dark:text-amber-400",
      paragraphs: [
        "Uma parcela relevante dos utilizadores está a atingir o limite de relatórios. Isto é um sinal positivo de valor percebido.",
        "Recomendação: prepare uma comunicação de upsell proativa — por exemplo, envie um e-mail quando o utilizador usar o penúltimo relatório do mês, oferecendo upgrade para o plano superior.",
      ],
    };
  }

  if (taxaLimiteRelatorio >= 60) {
    return {
      Icon: OctagonAlert,
      iconClassName: "text-red-600 dark:text-red-400",
      paragraphs: [
        "Mais da metade dos utilizadores atingiram o limite. O plano está subdimensionado para a procura real.",
        "Recomendação: aumente o limite deste plano ou intensifique o upsell de imediato.",
        "Utilizadores bloqueados no limite tendem a cancelar se não tiverem uma saída clara.",
      ],
    };
  }

  if (taxaAtivacaoRelatorio >= 50 && taxaAtivacaoProposta === 0) {
    return {
      Icon: FileWarning,
      iconClassName: "text-amber-600 dark:text-amber-400",
      paragraphs: [
        "Os utilizadores estão a gerar relatórios, mas não estão a criar propostas. O fluxo está a falhar entre diagnóstico e fechamento.",
        "Recomendação: adicione um CTA mais visível no relatório — por exemplo, o botão «Criar proposta agora» logo após a Rota Digital ser gerada.",
      ],
    };
  }

  return {
    Icon: Lightbulb,
    iconClassName: "text-muted-foreground",
    paragraphs: [
      "Continue a acompanhar este plano no painel — o cenário atual não encaixa nos padrões de insight automáticos.",
    ],
  };
}

type Props = {
  user: User | null;
  isGeneralAdmin: boolean;
  authLoading: boolean;
};

export function PlanUsageMetricsSection({ user, isGeneralAdmin, authLoading }: Props) {
  const [data, setData] = useState<AdminUsageMetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [insightRow, setInsightRow] = useState<AdminPlanUsageMetricsRow | null>(null);

  useEffect(() => {
    if (authLoading || !user || !isGeneralAdmin) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/admin/usage-metrics", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const body = (await res.json().catch(() => ({}))) as AdminUsageMetricsResponse & { error?: string };
        if (!res.ok) {
          if (!cancelled) {
            setData(null);
            setError(typeof body.error === "string" ? body.error : "Não foi possível carregar as métricas de uso.");
          }
          return;
        }
        if (!cancelled) setData(body);
      } catch {
        if (!cancelled) {
          setData(null);
          setError("Erro de rede ao carregar métricas de uso.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, isGeneralAdmin]);

  const planInsight = useMemo(() => (insightRow ? computePlanInsight(insightRow) : null), [insightRow]);
  const InsightModalIcon = planInsight?.Icon;

  const insightPlanTitle = insightRow ? planRowLabel(insightRow.plan) : "";
  const insightMonthLabel = data ? formatInsightMonthLabel(data) : "";

  if (!isGeneralAdmin) return null;

  return (
    <>
      <Card className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl dark:border-white/5 dark:bg-white/[0.02]">
        <div className="border-b border-border px-4 py-4 dark:border-white/5 sm:px-6">
          <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground dark:text-zinc-100">
            Métricas de uso por plano
          </h2>
          <p className="mt-1 text-sm text-muted-foreground dark:text-zinc-400">
            Acompanhe a taxa de ativação e pressão de limite por plano no mês atual. Use o botão de insight à
            esquerda de cada plano para orientar decisões de produto e onboarding.
          </p>
          {data ? (
            <p className="mt-2 text-xs text-muted-foreground/90 dark:text-zinc-500">
              Período: {formatPeriodCaption(data)}
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="border-b border-border px-4 py-3 text-sm text-destructive dark:border-white/5 sm:px-6">
            {error}
          </p>
        ) : null}

        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            <span>A carregar métricas…</span>
          </div>
        ) : data ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/40 hover:bg-transparent dark:border-white/5 dark:bg-white/[0.03]">
                  <TableHead className="whitespace-nowrap pl-6 text-[10px] font-bold uppercase tracking-widest text-foreground dark:text-zinc-100">
                    Plano
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-right text-[10px] font-bold uppercase tracking-widest text-foreground dark:text-zinc-100">
                    Total de Usuários
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-right text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
                    Ativaram Relatório
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-right text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
                    No Limite de Relatórios
                  </TableHead>
                  <TableHead className="min-w-[9rem] text-right text-[10px] font-bold uppercase tracking-widest text-foreground dark:text-zinc-100">
                    Uso Médio (Rel.)
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-right text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
                    Ativaram Proposta
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-right text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400">
                    No Limite de Propostas
                  </TableHead>
                  <TableHead className="min-w-[9rem] pr-6 text-right text-[10px] font-bold uppercase tracking-widest text-foreground dark:text-zinc-100">
                    Uso Médio (Prop.)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.plans.map((row) => {
                  const badgePlan = planRowLabel(row.plan);
                  const avgRep =
                    row.avgReportsUsed == null
                      ? "—"
                      : row.reportsQuotaUnlimited
                        ? `${formatCount(row.avgReportsUsed)} (ilimit.)`
                        : `média de ${formatCount(row.avgReportsUsed)} de ${formatCount(row.reportLimitBaseline)}`;
                  const avgProp =
                    row.avgProposalsUsed == null
                      ? "—"
                      : row.proposalsQuotaUnlimited
                        ? `${formatCount(row.avgProposalsUsed)} (ilimit.)`
                        : `média de ${formatCount(row.avgProposalsUsed)} de ${formatCount(row.proposalLimitBaseline)}`;
                  return (
                    <TableRow key={row.plan} className="border-border dark:border-white/5">
                      <TableCell className="pl-6 align-middle">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <button
                            type="button"
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-amber-600 transition-colors hover:bg-amber-500/15 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 dark:text-amber-400 dark:hover:text-amber-300"
                            aria-label={`Ver insight do plano ${badgePlan}`}
                            title="Ver insight"
                            onClick={() => setInsightRow(row)}
                          >
                            <Lightbulb className="size-4 shrink-0" aria-hidden />
                          </button>
                          <span
                            className={cn(
                              "inline-flex min-w-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                              planBadgeVisualClasses(badgePlan),
                            )}
                          >
                            {badgePlan}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-foreground dark:text-zinc-100">
                        {formatCount(row.totalUsers)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums text-sm",
                          row.usersWithAtLeastOneReport > 0
                            ? "font-medium text-blue-600 dark:text-blue-400"
                            : "text-foreground dark:text-zinc-200",
                        )}
                      >
                        {formatCount(row.usersWithAtLeastOneReport)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums text-sm",
                          row.usersAtReportLimit > 0
                            ? "font-medium text-amber-600 dark:text-amber-400"
                            : "text-foreground dark:text-zinc-200",
                        )}
                      >
                        {formatCount(row.usersAtReportLimit)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{avgRep}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums text-sm",
                          row.usersWithAtLeastOneProposal > 0
                            ? "font-medium text-blue-600 dark:text-blue-400"
                            : "text-foreground dark:text-zinc-200",
                        )}
                      >
                        {formatCount(row.usersWithAtLeastOneProposal)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums text-sm",
                          row.usersAtProposalLimit > 0
                            ? "font-medium text-red-600 dark:text-red-400"
                            : "text-foreground dark:text-zinc-200",
                        )}
                      >
                        {formatCount(row.usersAtProposalLimit)}
                      </TableCell>
                      <TableCell className="pr-6 text-right text-sm text-muted-foreground">{avgProp}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </Card>

      <Dialog open={insightRow != null} onOpenChange={(open) => !open && setInsightRow(null)}>
        <DialogContent
          className="max-w-lg sm:max-w-lg"
          showCloseButton={false}
          aria-describedby="admin-plan-insight-body"
        >
          <DialogHeader className="gap-3">
            <DialogTitle className="flex items-start gap-2.5 pr-8 text-left" id="admin-plan-insight-title">
              {InsightModalIcon && planInsight ? (
                <InsightModalIcon
                  className={cn("mt-0.5 size-5 shrink-0", planInsight.iconClassName)}
                  aria-hidden
                />
              ) : null}
              <span className="leading-snug">Insight — Plano {insightPlanTitle}</span>
            </DialogTitle>
            <div
              className="space-y-3 text-left text-base leading-relaxed text-foreground dark:text-zinc-200"
              id="admin-plan-insight-body"
            >
              {planInsight?.paragraphs.map((block, i) => (
                <p key={i} className="text-pretty">
                  {block}
                </p>
              ))}
            </div>
          </DialogHeader>
          <DialogFooter className="flex-col gap-3 sm:flex-col">
            <p className="w-full text-left text-xs text-muted-foreground">
              Período: {insightMonthLabel}
            </p>
            <Button type="button" variant="default" className="w-full sm:w-auto sm:self-end" onClick={() => setInsightRow(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
