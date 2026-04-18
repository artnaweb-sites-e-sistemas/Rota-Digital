"use client";

import type { LucideIcon } from "lucide-react";
import { Compass, FileText, Users } from "lucide-react";

import { PlatformStatAreaChart } from "@/components/admin/platform-stat-area-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  PLATFORM_CHART_COLOR_LEADS,
  PLATFORM_CHART_COLOR_PROPOSALS,
  PLATFORM_CHART_COLOR_REPORTS,
} from "@/lib/platform-chart-colors";
import type { PlatformSeriesGranularity, PlatformSeriesResponse } from "@/types/platform-series";
import type { PlatformStats } from "@/types/platform-stats";

function formatInt(n: number) {
  return n.toLocaleString("pt-BR");
}

function monthLabelPt(year: number, month: number): string {
  try {
    return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  } catch {
    return `${month}/${year}`;
  }
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function seriesPeriodLabel(s: PlatformSeriesResponse): string {
  switch (s.granularity) {
    case "day":
      return monthLabelPt(s.year, s.month);
    case "month_in_year":
      return String(s.year);
    case "year_total":
      return "Todos os anos (totais anuais)";
    case "fixed_month_by_year":
      try {
        const m = new Date(2000, s.month - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
        const cap = m ? m.charAt(0).toUpperCase() + m.slice(1) : "";
        return `${cap} · todos os anos`;
      } catch {
        return "Mês · todos os anos";
      }
    default:
      return monthLabelPt(s.year, s.month);
  }
}

/** Linha curta sob o título do cartão: só período (mês/ano ou equivalente). */
function cardPeriodSubtitle(s: PlatformSeriesResponse): string {
  switch (s.granularity) {
    case "day":
      return capitalizeFirst(monthLabelPt(s.year, s.month));
    case "month_in_year":
      return `Meses de ${s.year}`;
    case "year_total":
      return "Todos os anos";
    case "fixed_month_by_year":
      try {
        const m = new Date(2000, s.month - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
        return m ? `${m.charAt(0).toUpperCase() + m.slice(1)} · todos os anos` : "";
      } catch {
        return "";
      }
    default:
      return capitalizeFirst(monthLabelPt(s.year, s.month));
  }
}

function totalCaptionForSeries(s: PlatformSeriesResponse | null): string {
  if (!s) return "Total no período";
  return s.granularity === "day" ? "Total no mês" : "Total no período";
}

function chartGrainHint(g: PlatformSeriesGranularity): string {
  switch (g) {
    case "day":
      return "Gráfico por dia.";
    case "month_in_year":
      return "Gráfico por mês.";
    case "year_total":
      return "Gráfico por ano.";
    case "fixed_month_by_year":
      return "Gráfico por ano (mês fixo).";
    default:
      return "Gráfico.";
  }
}

/** Máximo do eixo Y só com os valores deste indicador (cada gráfico escala à parte). */
function yMaxForMetric(series: PlatformSeriesResponse | null, metric: SeriesMetric): number {
  if (!series?.days?.length) return 1;
  let m = 0;
  for (const d of series.days) {
    m = Math.max(m, d[metric]);
  }
  if (m === 0) return 1;
  return Math.ceil(m * 1.08) || 1;
}

type SeriesMetric = "leads" | "reports" | "proposals";

function tooltipDayLabel(year: number, month: number, day: number): string {
  try {
    return new Date(year, month - 1, day).toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  }
}

function pointTooltipLabel(series: PlatformSeriesResponse, d: { day: number; label: string }): string {
  switch (series.granularity) {
    case "day":
      return tooltipDayLabel(series.year, series.month, d.day);
    case "month_in_year":
      try {
        return new Date(series.year, d.day - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      } catch {
        return d.label;
      }
    case "year_total":
      return `Ano ${d.label}`;
    case "fixed_month_by_year":
      try {
        return new Date(d.day, series.month - 1, 1).toLocaleDateString("pt-BR", {
          month: "long",
          year: "numeric",
        });
      } catch {
        return d.label;
      }
    default:
      return tooltipDayLabel(series.year, series.month, d.day);
  }
}

function rowsForMetric(series: PlatformSeriesResponse, metric: SeriesMetric) {
  return series.days.map((d) => ({
    day: d.label,
    value: d[metric],
    dateLabel: pointTooltipLabel(series, d),
  }));
}

type StatChartCardProps = {
  title: string;
  icon: LucideIcon;
  total: number;
  totalCaption: string;
  series: PlatformSeriesResponse | null;
  metric: SeriesMetric;
  areaColor: string;
  yMax: number;
  grainHint: string;
  className?: string;
};

function StatChartCard({
  title,
  icon: Icon,
  total,
  totalCaption,
  series,
  metric,
  areaColor,
  yMax,
  grainHint,
  className,
}: StatChartCardProps) {
  const period = series != null ? ` — ${seriesPeriodLabel(series)}` : "";
  const ariaLabel = `${title}: ${totalCaption} ${formatInt(total)}${period}. ${grainHint}`;

  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-t-2xl rounded-b-none border-sidebar-border/80 bg-card/80 shadow-sm ring-1 ring-foreground/[0.06] backdrop-blur-sm dark:border-white/10 dark:bg-zinc-950/45 dark:ring-white/[0.06]",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-sidebar-primary/35 before:to-transparent dark:before:via-white/15",
        className,
      )}
    >
      <CardHeader className="relative z-[1] flex flex-row items-start gap-3 space-y-0 rounded-t-none border-b border-border/60 pb-3 dark:border-white/[0.07]">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/15 text-sidebar-primary dark:bg-white/10 dark:text-zinc-200">
          <Icon className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle className="font-heading text-base font-semibold leading-snug tracking-tight text-foreground dark:text-zinc-50">
            {title}
          </CardTitle>
          {series ? (
            <CardDescription className="text-xs leading-relaxed text-muted-foreground dark:text-zinc-500">
              {cardPeriodSubtitle(series)}
            </CardDescription>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
          <span
            className="font-heading text-3xl font-bold tabular-nums tracking-tight sm:text-4xl"
            style={{ color: areaColor }}
          >
            {formatInt(total)}
          </span>
          <span className="text-[11px] font-medium uppercase leading-tight tracking-wider text-muted-foreground dark:text-zinc-500">
            {totalCaption}
          </span>
        </div>
      </CardHeader>
      <CardContent className="relative z-[1] space-y-4 pt-3">
        <div className="rounded-t-xl rounded-b-none border border-border/50 bg-muted/30 px-1 pt-2 pb-0 dark:border-white/[0.06] dark:bg-zinc-900/40">
          {series?.days?.length ? (
            <PlatformStatAreaChart
              data={rowsForMetric(series, metric)}
              color={areaColor}
              yMax={yMax}
              ariaLabel={ariaLabel}
            />
          ) : (
            <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
              Sem dados do período.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export type PlatformVolumeChartsProps = {
  stats: PlatformStats | null;
  series: PlatformSeriesResponse | null;
  loading: boolean;
  error: string | null;
  /** Quando só a série está a atualizar e já existe uma série anterior. */
  refreshing?: boolean;
  /**
   * `period` — número grande = soma da série no período selecionado (painel global).
   * `allTime` — número grande = contagens totais em `stats` (ex.: detalhe por utilizador).
   */
  chartTotalsMode?: "period" | "allTime";
};

/** Total no mês da série (soma dos dias). */
function monthSum(series: PlatformSeriesResponse | null, metric: SeriesMetric): number {
  if (!series?.days?.length) return 0;
  return series.days.reduce((acc, d) => acc + d[metric], 0);
}

export function PlatformVolumeCharts({
  stats,
  series,
  loading,
  error,
  refreshing,
  chartTotalsMode = "period",
}: PlatformVolumeChartsProps) {
  if (error) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (loading && (!stats || !series)) {
    return (
      <div className="grid gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex min-h-[320px] flex-col gap-4 rounded-t-2xl rounded-b-none border border-border/60 bg-muted/20 p-6 dark:border-white/10 dark:bg-zinc-900/30"
          >
            <div className="h-12 w-2/3 animate-pulse rounded-lg bg-muted dark:bg-zinc-800" />
            <div className="h-10 w-1/2 animate-pulse rounded-md bg-muted dark:bg-zinc-800" />
            <div className="mt-auto h-[220px] flex-1 animate-pulse rounded-xl bg-muted/80 dark:bg-zinc-800/80" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const sumLeads = monthSum(series, "leads");
  const sumReports = monthSum(series, "reports");
  const sumProposals = monthSum(series, "proposals");
  const totalLeads = chartTotalsMode === "allTime" ? stats.leadsCount : sumLeads;
  const totalReports = chartTotalsMode === "allTime" ? stats.reportsCount : sumReports;
  const totalProposals = chartTotalsMode === "allTime" ? stats.proposalsCount : sumProposals;
  const g: PlatformSeriesGranularity = series?.granularity ?? "day";
  const cap =
    chartTotalsMode === "allTime" ? "Todos os períodos" : totalCaptionForSeries(series);
  const grainHint = chartGrainHint(g);

  return (
    <div
      className={cn(
        "grid gap-6 md:grid-cols-3",
        refreshing && "opacity-[0.92] transition-opacity duration-200",
      )}
    >
      <StatChartCard
        title="Leads gerados"
        icon={Users}
        total={totalLeads}
        totalCaption={cap}
        series={series}
        metric="leads"
        areaColor={PLATFORM_CHART_COLOR_LEADS}
        yMax={yMaxForMetric(series, "leads")}
        grainHint={grainHint}
      />
      <StatChartCard
        title="Rotas digitais geradas"
        icon={Compass}
        total={totalReports}
        totalCaption={cap}
        series={series}
        metric="reports"
        areaColor={PLATFORM_CHART_COLOR_REPORTS}
        yMax={yMaxForMetric(series, "reports")}
        grainHint={grainHint}
      />
      <StatChartCard
        title="Propostas geradas"
        icon={FileText}
        total={totalProposals}
        totalCaption={cap}
        series={series}
        metric="proposals"
        areaColor={PLATFORM_CHART_COLOR_PROPOSALS}
        yMax={yMaxForMetric(series, "proposals")}
        grainHint={grainHint}
      />
    </div>
  );
}
