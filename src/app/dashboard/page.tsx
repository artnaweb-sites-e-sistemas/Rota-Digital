"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, List, CheckCircle, Clock, Sparkles, Loader2, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getLeads } from "@/lib/leads";
import { getReportsByUser } from "@/lib/reports";
import type { Lead } from "@/types/lead";
import type { RotaDigitalReport } from "@/types/report";
import { ReportSiteAvatar } from "@/components/report-site-avatar";

function formatInt(n: number) {
  return n.toLocaleString("pt-BR");
}

function leadsCreatedInMonth(leads: Lead[], year: number, monthIndex: number): number {
  const start = new Date(year, monthIndex, 1).getTime();
  const end = new Date(year, monthIndex + 1, 1).getTime();
  return leads.filter((l) => l.createdAt >= start && l.createdAt < end).length;
}

function describeLeadMonthComparison(leads: Lead[]): string {
  const now = new Date();
  const cur = leadsCreatedInMonth(leads, now.getFullYear(), now.getMonth());
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prev = leadsCreatedInMonth(leads, prevDate.getFullYear(), prevDate.getMonth());
  if (prev === 0) {
    if (cur === 0) return "Nenhum lead novo neste mês";
    return `${formatInt(cur)} novo(s) neste mês`;
  }
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct > 0) return `+${pct}% de novos leads vs. mês anterior`;
  if (pct < 0) return `${pct}% de novos leads vs. mês anterior`;
  return "Mesmo ritmo de novos leads do mês anterior";
}

type DayBucket = { key: string; label: string; weekday: string; count: number };

function bucketLeadsLast7Days(leads: Lead[]): DayBucket[] {
  const now = new Date();
  const buckets: DayBucket[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const end = start + 24 * 60 * 60 * 1000;
    const count = leads.filter((l) => l.createdAt >= start && l.createdAt < end).length;
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      weekday: d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
      count,
    });
  }
  return buckets;
}

const WEEK_CHART_TRACK_PX = 168;
const CHART_GRID_ROWS = 4;
const CHART_GAP = "gap-1.5 sm:gap-2";

/** Fundo quadriculado (linhas horizontais + verticais) só na área das barras. */
function WeeklyChartPlotGrid({ className }: { className?: string }) {
  const stepY = WEEK_CHART_TRACK_PX / CHART_GRID_ROWS;
  return (
    <div
      aria-hidden
      className={className}
      style={{
        backgroundImage: [
          `repeating-linear-gradient(
            0deg,
            transparent 0,
            transparent ${stepY - 1}px,
            color-mix(in oklch, var(--border) 55%, transparent) ${stepY - 1}px,
            color-mix(in oklch, var(--border) 55%, transparent) ${stepY}px
          )`,
          `repeating-linear-gradient(
            90deg,
            transparent 0,
            transparent calc(100% / 7 - 1px),
            color-mix(in oklch, var(--border) 42%, transparent) calc(100% / 7 - 1px),
            color-mix(in oklch, var(--border) 42%, transparent) calc(100% / 7)
          )`,
        ].join(","),
      }}
    />
  );
}

function WeeklyLeadsChart({ data, loading }: { data: DayBucket[]; loading: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const totalWeek = data.reduce((s, d) => s + d.count, 0);

  if (loading) {
    return (
      <div className="flex h-[280px] items-center justify-center text-muted-foreground">
        <Loader2 className="size-8 animate-spin shrink-0" aria-hidden />
      </div>
    );
  }

  return (
    <div className="mx-4 mb-4 mt-0 space-y-3">
      <p className="text-xs text-muted-foreground">
        {totalWeek === 0
          ? "Nenhum lead novo cadastrado nesta semana."
          : `${formatInt(totalWeek)} lead(s) novo(s) nos últimos 7 dias.`}
      </p>
      <div
        className="relative rounded-md bg-muted/15 px-1 py-2 ring-1 ring-inset ring-border/40"
        role="img"
        aria-label={`Leads novos por dia na semana: ${data.map((d) => `${d.weekday} ${d.count}`).join(", ")}`}
      >
        <div className={`grid grid-cols-7 ${CHART_GAP} relative z-10`}>
          {data.map((d) => (
            <span key={`n-${d.key}`} className="text-center text-[10px] font-medium tabular-nums text-foreground">
              {d.count}
            </span>
          ))}
        </div>
        <div className="relative mt-1.5">
          <WeeklyChartPlotGrid className="pointer-events-none absolute inset-0 z-0 rounded-sm opacity-90 dark:opacity-80" />
          <div
            className={`relative z-10 grid grid-cols-7 ${CHART_GAP}`}
            style={{ height: WEEK_CHART_TRACK_PX }}
          >
            {data.map((d) => {
              const barPx =
                d.count === 0 ? 3 : Math.max(8, Math.round((d.count / max) * WEEK_CHART_TRACK_PX));
              return (
                <div
                  key={d.key}
                  className="flex min-w-0 flex-col justify-end"
                  title={`${d.label}: ${d.count} lead(s)`}
                >
                  <div
                    className="mx-auto w-full max-w-10 rounded-t-md bg-violet-500/85 shadow-sm dark:bg-violet-500/70"
                    style={{ height: barPx }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className={`relative z-10 mt-1.5 grid grid-cols-7 ${CHART_GAP}`}>
          {data.map((d) => (
            <span key={`w-${d.key}`} className="truncate text-center text-[10px] capitalize text-muted-foreground">
              {d.weekday}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [reports, setReports] = useState<RotaDigitalReport[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [leadList, reportList] = await Promise.all([getLeads(user.uid), getReportsByUser(user.uid)]);
      setLeads(leadList);
      setReports(reportList);
    } catch (e) {
      console.error(e);
      setLeads([]);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const reportCount = reports.length;
  const weekBuckets = useMemo(() => bucketLeadsLast7Days(leads), [leads]);
  const latestReports = useMemo(() => reports.slice(0, 6), [reports]);

  const stats = useMemo(() => {
    const total = leads.length;
    const convertidos = leads.filter((l) => l.status === "Convertido").length;
    const emNegociacao = leads.filter((l) => l.status !== "Convertido" && l.status !== "Perdido").length;
    const taxa =
      total > 0 ? Math.round((convertidos / total) * 100) : 0;

    return [
      {
        title: "Total de Leads",
        value: formatInt(total),
        description: total === 0 ? "Nenhum lead cadastrado ainda" : describeLeadMonthComparison(leads),
        icon: Users,
        color: "text-blue-500",
        href: "/dashboard/leads",
      },
      {
        title: "Rotas Digitais",
        value: formatInt(reportCount),
        description:
          reportCount === 0 ? "Nenhum relatório gerado ainda" : "Relatórios gerados na sua conta",
        icon: Sparkles,
        color: "text-violet-500",
        href: "/dashboard/rotas",
      },
      {
        title: "Leads convertidos",
        value: formatInt(convertidos),
        description:
          total === 0
            ? "Cadastre leads para acompanhar conversões"
            : `${taxa}% da base com status “Convertido”`,
        icon: CheckCircle,
        color: "text-green-500",
        href: "/dashboard/leads",
      },
      {
        title: "Em negociação",
        value: formatInt(emNegociacao),
        description: "Leads em aberto (exceto convertidos e perdidos)",
        icon: Clock,
        color: "text-amber-500",
        href: "/dashboard/leads",
      },
    ] as const;
  }, [leads, reportCount]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Visão geral</h1>
        <p className="text-muted-foreground mt-1">Resumo das atividades da plataforma.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Link key={i} href={stat.href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            <Card className="h-full transition-colors hover:bg-accent/30 border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-foreground">{stat.title}</CardTitle>
                <stat.icon className={`w-4 h-4 shrink-0 ${stat.color}`} aria-hidden />
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-5 animate-spin shrink-0" aria-hidden />
                    <span className="text-sm">Carregando…</span>
                  </div>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                    <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
                  </>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <Card className="md:col-span-4 border-border">
          <CardHeader>
            <CardTitle>Desempenho semanal</CardTitle>
            <CardDescription>Leads novos cadastrados nos últimos 7 dias (por dia)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-md border border-dashed border-border">
              <WeeklyLeadsChart data={weekBuckets} loading={loading} />
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3 border-border">
          <CardHeader>
            <CardTitle>Últimas rotas geradas</CardTitle>
            <CardDescription>Acesso rápido aos relatórios mais recentes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="flex justify-center py-10 text-muted-foreground">
                <Loader2 className="size-6 animate-spin" aria-hidden />
              </div>
            ) : latestReports.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
                <p>Nenhuma rota gerada ainda.</p>
                <Link
                  href="/dashboard/rotas/new"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                >
                  <Sparkles className="size-4 shrink-0" aria-hidden />
                  Gerar rota digital
                </Link>
              </div>
            ) : (
              <ul className="space-y-1">
                {latestReports.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/dashboard/rotas/${r.id}`}
                      className="flex items-center gap-3 rounded-lg border border-transparent px-2 py-2.5 text-left text-sm transition-colors hover:border-border hover:bg-muted/50"
                    >
                      <ReportSiteAvatar report={r} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{r.leadCompany}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {new Date(r.createdAt).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {!loading && latestReports.length > 0 ? (
              <Link
                href="/dashboard/rotas"
                className="mt-2 flex items-center justify-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
              >
                <List className="size-3.5 shrink-0" aria-hidden />
                Ver todas as rotas
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
