"use client";

import { useEffect, useMemo, useState } from "react";
import { UserPlus, Wallet } from "lucide-react";

import { PlatformStatAreaChart } from "@/components/admin/platform-stat-area-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import type { AdminSignupSeriesResponse } from "@/types/admin-signup-series";
import type { PlatformSeriesGranularity } from "@/types/platform-series";

function formatInt(n: number) {
  return n.toLocaleString("pt-BR");
}

function formatBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Cor da área/linha alinhada ao texto (branco no escuro, escuro no claro). */
const GROWTH_CHART_SERIES_COLOR = "var(--foreground)";

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tooltipDayLabelUtc(year: number, month: number, day: number): string {
  try {
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  }
}

function monthLongPtUtc(year: number, month1To12: number): string {
  try {
    return capitalizeFirst(
      new Date(Date.UTC(year, month1To12 - 1, 1)).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    );
  } catch {
    return `${month1To12}/${year}`;
  }
}

function periodSubtitle(s: AdminSignupSeriesResponse): string {
  switch (s.granularity) {
    case "day":
      return monthLongPtUtc(s.year, s.month);
    case "month_in_year":
      return `Meses de ${s.year} (UTC)`;
    case "year_total":
      return "Todos os anos (UTC)";
    case "fixed_month_by_year": {
      try {
        const m = new Date(2000, s.month - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
        return m ? `${m.charAt(0).toUpperCase() + m.slice(1)} · todos os anos (UTC)` : "";
      } catch {
        return "";
      }
    }
    default:
      return "";
  }
}

function pointDateLabel(
  granularity: PlatformSeriesGranularity,
  year: number,
  month: number,
  point: { label: string },
  index: number,
): string {
  switch (granularity) {
    case "day":
      return tooltipDayLabelUtc(year, month, Number(point.label));
    case "month_in_year":
      return new Date(Date.UTC(year, index, 1)).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    case "year_total":
      return `Ano ${point.label}`;
    case "fixed_month_by_year": {
      const y = Number(point.label);
      return new Date(Date.UTC(y, month - 1, 1)).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    }
    default:
      return point.label;
  }
}

function yMaxSignups(points: AdminSignupSeriesResponse["points"]): number {
  let m = 0;
  for (const p of points) m = Math.max(m, p.signups);
  if (m === 0) return 1;
  return Math.ceil(m * 1.08) || 1;
}

function yMaxReais(points: AdminSignupSeriesResponse["points"]): number {
  let m = 0;
  for (const p of points) m = Math.max(m, p.revenueCents / 100);
  if (m === 0) return 1;
  return Math.ceil(m * 100 * 1.12) / 100;
}

type AdminGrowthChartsProps = {
  queryString: string;
  disabled?: boolean;
  className?: string;
};

export function AdminGrowthCharts({ queryString, disabled, className }: AdminGrowthChartsProps) {
  const { user } = useAuth();
  const [data, setData] = useState<AdminSignupSeriesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || disabled) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(`/api/admin-signup-revenue-series?${queryString}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const body = (await res.json().catch(() => ({}))) as AdminSignupSeriesResponse & { error?: string };
        if (!res.ok) {
          if (!cancelled) {
            setData(null);
            setError(typeof body.error === "string" ? body.error : "Não foi possível carregar inscrições.");
          }
          return;
        }
        if (!cancelled) {
          setError(null);
          setData({
            granularity: body.granularity,
            year: body.year,
            month: body.month,
            points: Array.isArray(body.points) ? body.points : [],
          });
        }
      } catch {
        if (!cancelled) {
          setData(null);
          setError("Erro de rede ao carregar inscrições.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, queryString, disabled]);

  const totals = useMemo(() => {
    if (!data?.points?.length) return { signups: 0, reais: 0 };
    let signups = 0;
    let cents = 0;
    for (const p of data.points) {
      signups += p.signups;
      cents += p.revenueCents;
    }
    return { signups, reais: cents / 100 };
  }, [data]);

  const signupsChartData = useMemo(() => {
    if (!data?.points) return [];
    return data.points.map((p, i) => ({
      day: p.label,
      value: p.signups,
      dateLabel: pointDateLabel(data.granularity, data.year, data.month, p, i),
    }));
  }, [data]);

  const revenueChartData = useMemo(() => {
    if (!data?.points) return [];
    return data.points.map((p, i) => ({
      day: p.label,
      value: p.revenueCents / 100,
      dateLabel: pointDateLabel(data.granularity, data.year, data.month, p, i),
    }));
  }, [data]);

  const ySignups = data ? yMaxSignups(data.points) : 1;
  const yReais = data ? yMaxReais(data.points) : 1;

  if (!user) return null;

  if (error) {
    return (
      <p className={cn("rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive", className)}>
        {error}
      </p>
    );
  }

  if (loading && !data) {
    return (
      <div className={cn("grid gap-6 md:grid-cols-2", className)}>
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex min-h-[280px] flex-col gap-4 rounded-t-2xl rounded-b-none border border-border/60 bg-muted/20 p-5 dark:border-white/10 dark:bg-zinc-900/30"
          >
            <div className="h-10 w-1/2 animate-pulse rounded-md bg-muted dark:bg-zinc-800" />
            <div className="h-8 w-1/3 animate-pulse rounded bg-muted dark:bg-zinc-800" />
            <div className="mt-auto h-[200px] flex-1 animate-pulse rounded-xl bg-muted/80 dark:bg-zinc-800/80" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const sub = periodSubtitle(data);
  const signupsAria = `Novos utilizadores: ${formatInt(totals.signups)} no período. ${sub}`;
  const revenueAria = `Receita de referência: ${formatBrl(totals.reais)} no período. ${sub}`;

  return (
    <div className={cn("grid gap-6 md:grid-cols-2", className)}>
      <Card
        className={cn(
          "relative overflow-hidden rounded-t-2xl rounded-b-none border-sidebar-border/80 bg-card/80 shadow-sm ring-1 ring-foreground/[0.06] backdrop-blur-sm dark:border-white/10 dark:bg-zinc-950/45 dark:ring-white/[0.06]",
          "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-sidebar-primary/35 before:to-transparent dark:before:via-white/15",
          loading && "opacity-[0.92]",
        )}
      >
        <CardHeader className="relative z-[1] flex flex-row items-start gap-3 space-y-0 rounded-t-none border-b border-border/60 pb-3 dark:border-white/[0.07]">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/15 text-sidebar-primary dark:bg-white/10 dark:text-zinc-200">
            <UserPlus className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="font-heading text-base font-semibold leading-snug tracking-tight text-foreground dark:text-zinc-50">
              Novos utilizadores
            </CardTitle>
            {sub ? (
              <CardDescription className="text-xs leading-relaxed text-muted-foreground dark:text-zinc-500">
                {sub}
              </CardDescription>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="font-heading text-3xl font-bold tabular-nums tracking-tight text-foreground dark:text-white sm:text-4xl">
              {formatInt(totals.signups)}
            </span>
            <span className="text-[11px] font-medium uppercase leading-tight tracking-wider text-muted-foreground dark:text-zinc-500">
              No período
            </span>
          </div>
        </CardHeader>
        <CardContent className="relative z-[1] space-y-2 pt-3">
          <p className="text-[11px] text-muted-foreground">Contas criadas no Firebase Auth (data UTC).</p>
          <div className="rounded-t-xl rounded-b-none border border-border/50 bg-muted/30 px-1 pt-2 pb-0 dark:border-white/[0.06] dark:bg-zinc-900/40">
            {signupsChartData.length ? (
              <PlatformStatAreaChart
                data={signupsChartData}
                color={GROWTH_CHART_SERIES_COLOR}
                yMax={ySignups}
                ariaLabel={signupsAria}
                valueLabel="Novos"
              />
            ) : (
              <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                Sem pontos no período.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card
        className={cn(
          "relative overflow-hidden rounded-t-2xl rounded-b-none border-sidebar-border/80 bg-card/80 shadow-sm ring-1 ring-foreground/[0.06] backdrop-blur-sm dark:border-white/10 dark:bg-zinc-950/45 dark:ring-white/[0.06]",
          "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-sidebar-primary/35 before:to-transparent dark:before:via-white/15",
          loading && "opacity-[0.92]",
        )}
      >
        <CardHeader className="relative z-[1] flex flex-row items-start gap-3 space-y-0 rounded-t-none border-b border-border/60 pb-3 dark:border-white/[0.07]">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/15 text-sidebar-primary dark:bg-white/10 dark:text-zinc-200">
            <Wallet className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="font-heading text-base font-semibold leading-snug tracking-tight text-foreground dark:text-zinc-50">
              Receita (referência)
            </CardTitle>
            {sub ? (
              <CardDescription className="text-xs leading-relaxed text-muted-foreground dark:text-zinc-500">
                {sub}
              </CardDescription>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="font-heading text-2xl font-bold tabular-nums tracking-tight text-right text-foreground dark:text-white sm:text-3xl">
              {formatBrl(totals.reais)}
            </span>
            <span className="text-[11px] font-medium uppercase leading-tight tracking-wider text-muted-foreground dark:text-zinc-500">
              Soma no período
            </span>
          </div>
        </CardHeader>
        <CardContent className="relative z-[1] space-y-2 pt-3">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Soma de <span className="font-medium text-foreground/80">planPriceCents</span> /{" "}
            <span className="font-medium text-foreground/80">subscriptionPriceCents</span> em{" "}
            <span className="font-medium text-foreground/80">userSettings</span> só das contas criadas em cada
            intervalo. Pagamentos reais e planos comerciais: configurar depois.
          </p>
          <div className="rounded-t-xl rounded-b-none border border-border/50 bg-muted/30 px-1 pt-2 pb-0 dark:border-white/[0.06] dark:bg-zinc-900/40">
            {revenueChartData.length ? (
              <PlatformStatAreaChart
                data={revenueChartData}
                color={GROWTH_CHART_SERIES_COLOR}
                yMax={yReais}
                ariaLabel={revenueAria}
                valueLabel="Valor"
                yAllowDecimals
                yTickFormatter={(v) =>
                  v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: v >= 100 ? 0 : 2 })
                }
                tooltipValueFormatter={(v) => formatBrl(v)}
              />
            ) : (
              <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                Sem pontos no período.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
