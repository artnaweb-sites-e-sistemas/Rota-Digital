"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Link2, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { PlatformVolumeCharts } from "@/components/admin/platform-volume-charts";
import {
  PlatformPeriodSelector,
  type PlatformPeriodMonth,
  type PlatformPeriodYear,
} from "@/components/admin/platform-period-selector";
import { useAuth } from "@/lib/auth-context";
import { isGeneralAdminEmail } from "@/lib/general-admin";
import type { AdminListedUser } from "@/types/admin-user-list";
import type { PlatformSeriesResponse } from "@/types/platform-series";
import type { PlatformStats } from "@/types/platform-stats";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PLATFORM_CHART_COLOR_LEADS,
  PLATFORM_CHART_COLOR_PROPOSALS,
  PLATFORM_CHART_COLOR_REPORTS,
} from "@/lib/platform-chart-colors";
import { planBadgeVisualClasses } from "@/lib/billing-plan-label";
import { cn } from "@/lib/utils";

function formatDatePt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

function splitDateTimePt(value: string): { date: string; time: string | null } {
  if (!value || value === "—") return { date: "—", time: null };
  const [date, time] = value.split(", ");
  if (!date) return { date: value, time: null };
  return { date, time: time ?? null };
}

function formatBrlFromCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type BillingPlan = "Starter" | "Pro" | "Agency" | "Master";

const LEADS_MONTHLY_LIMIT_BY_PLAN: Record<BillingPlan, number | null> = {
  Starter: 30,
  Pro: 50,
  Agency: 100,
  Master: null,
};

const REPORTS_MONTHLY_LIMIT_BY_PLAN: Record<BillingPlan, number | null> = {
  Starter: 2,
  Pro: 20,
  Agency: 50,
  Master: null,
};

const PROPOSALS_MONTHLY_LIMIT_BY_PLAN: Record<BillingPlan, number | null> = {
  Starter: 2,
  Pro: 30,
  Agency: null,
  Master: null,
};

const PLAN_MONTHLY_PRICE_CENTS_BY_PLAN: Record<BillingPlan, number> = {
  Starter: 0,
  Pro: 12_700,
  Agency: 34_700,
  Master: 0,
};

function normalizedPlanLabel(raw: string | null | undefined): BillingPlan {
  const text = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (text.includes("master")) return "Master";
  if (text.includes("agency") || text.includes("enterprise")) return "Agency";
  if (text.includes("starter") || text.includes("free") || text.includes("trial")) return "Starter";
  return "Pro";
}

function sumUsageInSeries(series: PlatformSeriesResponse | null): { leads: number; reports: number; proposals: number } {
  if (!series?.days?.length) return { leads: 0, reports: 0, proposals: 0 };
  return series.days.reduce(
    (acc, day) => ({
      leads: acc.leads + (Number.isFinite(day.leads) ? day.leads : 0),
      reports: acc.reports + (Number.isFinite(day.reports) ? day.reports : 0),
      proposals: acc.proposals + (Number.isFinite(day.proposals) ? day.proposals : 0),
    }),
    { leads: 0, reports: 0, proposals: 0 },
  );
}

export default function UsuarioAdminDetailPage() {
  const router = useRouter();
  const params = useParams();
  const uid = typeof params.uid === "string" ? params.uid : "";
  const { user, loading: authLoading, isGeneralAdmin } = useAuth();

  const [detail, setDetail] = useState<AdminListedUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [toggleDialogOpen, setToggleDialogOpen] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planDraft, setPlanDraft] = useState<BillingPlan>("Pro");
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const [uidCopied, setUidCopied] = useState(false);

  const [periodYear, setPeriodYear] = useState<PlatformPeriodYear>(() => new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState<PlatformPeriodMonth>(() => new Date().getMonth() + 1);
  const [platformSeries, setPlatformSeries] = useState<PlatformSeriesResponse | null>(null);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [seriesLoadError, setSeriesLoadError] = useState<string | null>(null);
  const createdAtParts = useMemo(() => splitDateTimePt(formatDatePt(detail?.createdAt ?? null)), [detail?.createdAt]);
  const lastSignInParts = useMemo(
    () => splitDateTimePt(formatDatePt(detail?.lastSignInAt ?? null)),
    [detail?.lastSignInAt],
  );

  const seriesQueryString = useMemo(() => {
    if (periodYear === "all" && periodMonth === "all") return "year=all&month=all";
    if (periodYear === "all") return `year=all&month=${periodMonth}`;
    if (periodMonth === "all") return `year=${periodYear}&month=all`;
    return `year=${periodYear}&month=${periodMonth}`;
  }, [periodYear, periodMonth]);

  const userSeriesUrl = useMemo(() => {
    if (!uid.trim()) return "";
    return `/api/admin-platform-series?${seriesQueryString}&userId=${encodeURIComponent(uid.trim())}`;
  }, [seriesQueryString, uid]);

  const statsForCharts: PlatformStats | null = detail
    ? {
        leadsCount: detail.leadsCount,
        reportsCount: detail.reportsCount,
        proposalsCount: detail.proposalsCount,
      }
    : null;
  const selectedUsage = useMemo(() => {
    const fromSeries = sumUsageInSeries(platformSeries);
    if (!platformSeries?.days?.length && detail) {
      return {
        leads: detail.leadsCount,
        reports: detail.reportsCount,
        proposals: detail.proposalsCount,
      };
    }
    return fromSeries;
  }, [detail, platformSeries]);
  const effectivePlan = useMemo(() => normalizedPlanLabel(detail?.plan), [detail?.plan]);
  const canAssignMasterPlan = useMemo(() => isGeneralAdminEmail(detail?.email), [detail?.email]);
  const selectedMonthKey = useMemo(() => {
    if (typeof periodYear !== "number" || typeof periodMonth !== "number") return null;
    const month = String(periodMonth).padStart(2, "0");
    return `${periodYear}-${month}`;
  }, [periodMonth, periodYear]);
  const addOnPaidInSelectedMonthCents = useMemo(() => {
    if (!detail?.addOnPaidByMonthCents || !selectedMonthKey) return 0;
    return detail.addOnPaidByMonthCents[selectedMonthKey] ?? 0;
  }, [detail?.addOnPaidByMonthCents, selectedMonthKey]);
  const displayedPlanMonthlyCents = useMemo(
    () => detail?.planPriceCents ?? PLAN_MONTHLY_PRICE_CENTS_BY_PLAN[effectivePlan],
    [detail?.planPriceCents, effectivePlan],
  );
  const totalPaidInSelectedPeriodCents = useMemo(() => {
    return Math.max(0, displayedPlanMonthlyCents + addOnPaidInSelectedMonthCents);
  }, [addOnPaidInSelectedMonthCents, displayedPlanMonthlyCents]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!isGeneralAdmin) {
      router.replace("/dashboard");
    }
  }, [authLoading, user, isGeneralAdmin, router]);

  const loadDetail = useCallback(async () => {
    if (!user || !uid) return;
    setLoading(true);
    setLoadError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin-users/${encodeURIComponent(uid)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = (await res.json().catch(() => ({}))) as AdminListedUser & { error?: string };
      if (!res.ok) {
        setDetail(null);
        setLoadError(typeof body.error === "string" ? body.error : "Não foi possível carregar o utilizador.");
        return;
      }
      setDetail(body);
    } catch {
      setDetail(null);
      setLoadError("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }, [user, uid]);

  useEffect(() => {
    if (authLoading || !user || !isGeneralAdmin || !uid) return;
    void loadDetail();
  }, [authLoading, user, isGeneralAdmin, uid, loadDetail]);

  useEffect(() => {
    if (authLoading || !user || !isGeneralAdmin || !userSeriesUrl) return;
    let cancelled = false;
    void (async () => {
      setChartsLoading(true);
      try {
        const idToken = await user.getIdToken();
        const resSeries = await fetch(userSeriesUrl, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const bodySeries = (await resSeries.json().catch(() => ({}))) as PlatformSeriesResponse & {
          error?: string;
        };

        if (!resSeries.ok) {
          if (!cancelled) {
            setPlatformSeries(null);
            setSeriesLoadError(
              typeof bodySeries.error === "string" ? bodySeries.error : "Não foi possível carregar a série temporal.",
            );
          }
          return;
        }

        if (!cancelled) {
          const granularity = bodySeries.granularity;
          setSeriesLoadError(null);
          setPlatformSeries({
            granularity:
              granularity === "day" ||
              granularity === "month_in_year" ||
              granularity === "year_total" ||
              granularity === "fixed_month_by_year"
                ? granularity
                : "day",
            year: typeof bodySeries.year === "number" ? bodySeries.year : 0,
            month: typeof bodySeries.month === "number" ? bodySeries.month : 0,
            days: Array.isArray(bodySeries.days) ? bodySeries.days : [],
          });
        }
      } catch {
        if (!cancelled) {
          setPlatformSeries(null);
          setSeriesLoadError("Erro de rede ao carregar a série temporal.");
        }
      } finally {
        if (!cancelled) setChartsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, isGeneralAdmin, userSeriesUrl]);

  const onToggleDisabled = async () => {
    if (!user || !detail) return;
    setToggleBusy(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin-users/${encodeURIComponent(uid)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ disabled: !detail.disabled }),
      });
      const body = (await res.json().catch(() => ({}))) as AdminListedUser & { error?: string };
      if (!res.ok) {
        setLoadError(typeof body.error === "string" ? body.error : "Falha ao atualizar estado da conta.");
        return;
      }
      setDetail(body);
      setLoadError(null);
      setToggleDialogOpen(false);
    } catch {
      setLoadError("Erro de rede ao atualizar conta.");
    } finally {
      setToggleBusy(false);
    }
  };

  const onSavePlan = async () => {
    if (!user || !detail) return;
    setPlanBusy(true);
    setPlanError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin-users/${encodeURIComponent(uid)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan: planDraft }),
      });
      const body = (await res.json().catch(() => ({}))) as AdminListedUser & { error?: string };
      if (!res.ok) {
        setPlanError(typeof body.error === "string" ? body.error : "Falha ao atualizar plano.");
        return;
      }
      setDetail(body);
      setPlanDialogOpen(false);
    } catch {
      setPlanError("Erro de rede ao atualizar plano.");
    } finally {
      setPlanBusy(false);
    }
  };

  const onGenerateReset = async () => {
    if (!user) return;
    setResetBusy(true);
    setResetError(null);
    setResetLink(null);
    setCopyDone(false);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin-users/${encodeURIComponent(uid)}/reset-password`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = (await res.json().catch(() => ({}))) as { link?: string; error?: string };
      if (!res.ok) {
        setResetError(typeof body.error === "string" ? body.error : "Não foi possível gerar o link.");
        return;
      }
      if (typeof body.link === "string") setResetLink(body.link);
    } catch {
      setResetError("Erro de rede.");
    } finally {
      setResetBusy(false);
    }
  };

  const onCopyLink = async () => {
    if (!resetLink) return;
    try {
      await navigator.clipboard.writeText(resetLink);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    } catch {
      setResetError("Não foi possível copiar. Selecione o link manualmente.");
    }
  };

  const onCopyUid = async () => {
    if (!detail?.uid) return;
    try {
      await navigator.clipboard.writeText(detail.uid);
      setUidCopied(true);
      setTimeout(() => setUidCopied(false), 1800);
    } catch {
      // Silencioso: o campo continua selecionável manualmente.
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <span>A carregar…</span>
      </div>
    );
  }

  if (!isGeneralAdmin) return null;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-1">
            <Link
              href="/dashboard/usuarios"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "mb-1 -ml-2 inline-flex h-8 items-center gap-1 px-2 text-muted-foreground",
              )}
            >
              <ArrowLeft className="size-4" aria-hidden />
              Voltar à lista
            </Link>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground dark:text-zinc-100">
              {detail?.companyName?.trim() || detail?.displayName?.trim() || detail?.email || "Utilizador"}
            </h1>
            <p className="text-sm text-muted-foreground dark:text-zinc-400">
              Gráficos e totais só deste utilizador (UTC).
            </p>
          </div>
          <PlatformPeriodSelector
            year={periodYear}
            month={periodMonth}
            onYearChange={setPeriodYear}
            onMonthChange={setPeriodMonth}
            disabled={chartsLoading}
            className="shrink-0 sm:justify-end"
          />
        </div>

        <PlatformVolumeCharts
          stats={statsForCharts}
          series={platformSeries}
          loading={!detail || (chartsLoading && platformSeries == null)}
          refreshing={chartsLoading && platformSeries != null}
          error={seriesLoadError}
          chartTotalsMode="allTime"
        />
      </div>

      {loadError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          <span>A carregar utilizador…</span>
        </div>
      ) : detail ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-sidebar-border/80 dark:border-white/10">
            <CardHeader>
              <CardTitle className="font-heading text-lg">Conta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">E-mail</span>
                <span className="min-w-0 break-all font-medium">{detail.email ?? "—"}</span>
              </div>
              <Badge
                variant={detail.disabled ? "destructive" : "outline"}
                className={cn(
                  "text-xs font-medium",
                  !detail.disabled &&
                    "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300",
                )}
              >
                {detail.disabled ? "Conta desativada" : "Conta ativa"}
              </Badge>
              <dl className="grid gap-2 border-t border-border pt-3 text-xs dark:border-white/10 sm:text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Criado</dt>
                  <dd className="tabular-nums">
                    {createdAtParts.date}
                    {createdAtParts.time ? <span className="text-muted-foreground/75">, {createdAtParts.time}</span> : null}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Último acesso</dt>
                  <dd className="tabular-nums">
                    {lastSignInParts.date}
                    {lastSignInParts.time ? <span className="text-muted-foreground/75">, {lastSignInParts.time}</span> : null}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">UID</dt>
                  <dd className="flex max-w-[min(100%,14rem)] items-center gap-1.5">
                    <span className="truncate font-mono text-[11px] text-muted-foreground/80">{detail.uid}</span>
                    <button
                      type="button"
                      onClick={() => void onCopyUid()}
                      className={cn(
                        "inline-flex size-5 shrink-0 items-center justify-center rounded-md transition-colors",
                        uidCopied
                          ? "text-emerald-400"
                          : "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
                      )}
                      aria-label={uidCopied ? "UID copiado" : "Copiar UID"}
                      title={uidCopied ? "UID copiado" : "Copiar UID"}
                    >
                      {uidCopied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                    </button>
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2 border-t border-border pt-4 dark:border-white/10">
                <Button
                  type="button"
                  variant={detail.disabled ? "outline" : "destructive"}
                  size="sm"
                  className="gap-2"
                  disabled={toggleBusy}
                  onClick={() => setToggleDialogOpen(true)}
                >
                  {detail.disabled ? "Ativar conta" : "Desativar conta"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!detail.email}
                  onClick={() => {
                    setResetOpen(true);
                    setResetLink(null);
                    setResetError(null);
                    setCopyDone(false);
                  }}
                >
                  Redefinir senha
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-sidebar-border/80 dark:border-white/10">
            <CardHeader>
              <CardTitle className="font-heading text-lg">Plano e utilização</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Plano</span>
                <Badge
                  variant="outline"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    let next = normalizedPlanLabel(detail.plan);
                    if (next === "Master" && !canAssignMasterPlan) next = "Pro";
                    setPlanDraft(next);
                    setPlanError(null);
                    setPlanDialogOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      let next = normalizedPlanLabel(detail.plan);
                      if (next === "Master" && !canAssignMasterPlan) next = "Pro";
                      setPlanDraft(next);
                      setPlanError(null);
                      setPlanDialogOpen(true);
                    }
                  }}
                  className={cn("cursor-pointer font-semibold", planBadgeVisualClasses(effectivePlan))}
                  title="Clique para alterar o plano"
                >
                  {effectivePlan === "Master" ? (
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="size-3 opacity-90" aria-hidden />
                      Plano Master
                    </span>
                  ) : (
                    effectivePlan
                  )}
                </Badge>
              </div>
              <dl className="grid gap-3">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Valor do plano (mensal / referência)</dt>
                  <dd className="text-sm font-medium tabular-nums text-muted-foreground/85">
                    {formatBrlFromCents(displayedPlanMonthlyCents)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Add-on pago no período</dt>
                  <dd className="text-sm font-medium tabular-nums text-muted-foreground/85">
                    {formatBrlFromCents(addOnPaidInSelectedMonthCents)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Total pago no mês</dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {formatBrlFromCents(totalPaidInSelectedPeriodCents)}
                  </dd>
                </div>
              </dl>
              <dl className="grid gap-2 border-t border-border pt-3 dark:border-white/10">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Leads gerados</dt>
                  <dd className="text-base font-medium tabular-nums">
                    <span style={{ color: PLATFORM_CHART_COLOR_LEADS }}>
                      {selectedUsage.leads.toLocaleString("pt-BR")}
                    </span>
                    <span className="px-0.5 text-xs text-muted-foreground/75">/</span>
                    <span
                      className={cn(
                        "text-xs",
                        LEADS_MONTHLY_LIMIT_BY_PLAN[effectivePlan] != null &&
                          selectedUsage.leads >= LEADS_MONTHLY_LIMIT_BY_PLAN[effectivePlan]!
                          ? "font-semibold text-red-400"
                          : "text-muted-foreground/75",
                      )}
                    >
                      {LEADS_MONTHLY_LIMIT_BY_PLAN[effectivePlan] == null
                        ? "ilimitado"
                        : LEADS_MONTHLY_LIMIT_BY_PLAN[effectivePlan]!.toLocaleString("pt-BR")}
                    </span>
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Rotas digitais</dt>
                  <dd className="text-base font-medium tabular-nums">
                    <span style={{ color: PLATFORM_CHART_COLOR_REPORTS }}>
                      {selectedUsage.reports.toLocaleString("pt-BR")}
                    </span>
                    <span className="px-0.5 text-xs text-muted-foreground/75">/</span>
                    <span
                      className={cn(
                        "text-xs",
                        REPORTS_MONTHLY_LIMIT_BY_PLAN[effectivePlan] != null &&
                          selectedUsage.reports >= REPORTS_MONTHLY_LIMIT_BY_PLAN[effectivePlan]!
                          ? "font-semibold text-red-400"
                          : "text-muted-foreground/75",
                      )}
                    >
                      {REPORTS_MONTHLY_LIMIT_BY_PLAN[effectivePlan] == null
                        ? "ilimitado"
                        : REPORTS_MONTHLY_LIMIT_BY_PLAN[effectivePlan]!.toLocaleString("pt-BR")}
                    </span>
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Propostas</dt>
                  <dd className="text-base font-medium tabular-nums">
                    <span style={{ color: PLATFORM_CHART_COLOR_PROPOSALS }}>
                      {selectedUsage.proposals.toLocaleString("pt-BR")}
                    </span>
                    <span className="px-0.5 text-xs text-muted-foreground/75">/</span>
                    <span
                      className={cn(
                        "text-xs",
                        PROPOSALS_MONTHLY_LIMIT_BY_PLAN[effectivePlan] != null &&
                          selectedUsage.proposals >= PROPOSALS_MONTHLY_LIMIT_BY_PLAN[effectivePlan]!
                          ? "font-semibold text-red-400"
                          : "text-muted-foreground/75",
                      )}
                    >
                      {PROPOSALS_MONTHLY_LIMIT_BY_PLAN[effectivePlan] == null
                        ? "ilimitado"
                        : PROPOSALS_MONTHLY_LIMIT_BY_PLAN[effectivePlan]!.toLocaleString("pt-BR")}
                    </span>
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Dialog open={toggleDialogOpen} onOpenChange={setToggleDialogOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>{detail?.disabled ? "Ativar esta conta?" : "Desativar esta conta?"}</DialogTitle>
            <DialogDescription>
              {detail?.disabled
                ? "O utilizador voltará a poder iniciar sessão na plataforma."
                : `A conta ${detail?.email?.trim() || detail?.uid || "deste utilizador"} deixará de poder iniciar sessão até ser reativada.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse gap-2 border-0 bg-transparent p-0 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={toggleBusy}
              onClick={() => setToggleDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              variant={detail?.disabled ? "default" : "destructive"}
              className="gap-2"
              disabled={toggleBusy || !detail}
              onClick={() => void onToggleDisabled()}
            >
              {toggleBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  A atualizar…
                </>
              ) : detail?.disabled ? (
                "Ativar"
              ) : (
                "Desativar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent
          showCloseButton
          className={cn(
            "gap-0 overflow-hidden border-white/10 bg-zinc-950 p-0 text-zinc-100 shadow-2xl sm:max-w-md",
            "rounded-2xl ring-1 ring-white/10",
          )}
        >
          <div className="relative border-b border-white/[0.06] bg-white/[0.015] px-6 pb-5 pt-6 pr-14 sm:px-8 sm:pb-6 sm:pt-7 sm:pr-16">
            <div
              className="pointer-events-none absolute -right-20 -top-16 h-32 w-32 rounded-full bg-brand/15 blur-3xl"
              aria-hidden
            />
            <DialogHeader className="gap-2 space-y-0 text-left">
              <DialogTitle className="font-heading text-lg font-semibold tracking-tight text-white sm:text-xl">
                Alterar plano
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed text-zinc-400 sm:text-sm">
                Define o plano base para limites e métricas de faturamento deste utilizador. Alterações aplicam-se
                imediatamente após guardar.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 px-6 py-6 sm:px-8 sm:py-7">
            <div className="space-y-2">
              <Label htmlFor="admin-user-plan-select" className="text-xs font-medium text-zinc-300">
                Plano
              </Label>
              <Select value={planDraft} onValueChange={(value) => setPlanDraft(value as BillingPlan)}>
                <SelectTrigger
                  id="admin-user-plan-select"
                  aria-label="Selecionar plano"
                  className="h-11 w-full rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                >
                  <SelectValue placeholder="Selecione o plano" />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  className="border-white/10 bg-zinc-950 text-zinc-100 shadow-xl"
                >
                  <SelectItem value="Starter" className="focus:bg-white/10">
                    Starter
                  </SelectItem>
                  <SelectItem value="Pro" className="focus:bg-white/10">
                    Pro
                  </SelectItem>
                  <SelectItem value="Agency" className="focus:bg-white/10">
                    Agency
                  </SelectItem>
                  {canAssignMasterPlan ? (
                    <SelectItem value="Master" className="focus:bg-white/10">
                      <span className="inline-flex items-center gap-2">
                        <Sparkles className="size-3.5 text-amber-400/90" aria-hidden />
                        Plano Master
                      </span>
                    </SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>

            {canAssignMasterPlan ? (
              <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2.5 text-[11px] leading-relaxed text-amber-100/90">
                <span className="font-semibold text-amber-200">Plano Master:</span> exclusivo para a conta do
                administrador geral. Inclui uso ilimitado de leads, rotas e propostas na plataforma.
              </p>
            ) : (
              <p className="text-[11px] leading-relaxed text-zinc-500">
                Planos comerciais (Starter, Pro e Agency) aplicam-se a todas as contas. O Plano Master só aparece
                quando estiver a editar a conta do administrador geral.
              </p>
            )}

            {planError ? (
              <p
                role="alert"
                className="rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-200"
              >
                {planError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] bg-white/[0.02] px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-8 sm:py-5">
            <Button
              type="button"
              variant="ghost"
              disabled={planBusy}
              onClick={() => setPlanDialogOpen(false)}
              className="h-10 text-zinc-300 hover:bg-white/10 hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="cta"
              size="lg"
              className="min-w-[10rem] gap-2"
              disabled={planBusy}
              onClick={() => void onSavePlan()}
            >
              {planBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Salvar plano
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={resetOpen}
        onOpenChange={(open) => {
          setResetOpen(open);
          if (!open) {
            setResetLink(null);
            setResetError(null);
            setCopyDone(false);
          }
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={!resetBusy}>
          <div className="border-b border-border px-4 pb-4 pt-4 dark:border-white/10 sm:px-5 sm:pt-5">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-base leading-snug sm:text-lg">Redefinir palavra-passe</DialogTitle>
              <DialogDescription className="text-[11px] leading-snug text-muted-foreground sm:text-xs">
                Redefinição no site Rota Digital (não na página genérica do Firebase). Envie o link por um canal seguro.
              </DialogDescription>
              {detail?.email ? (
                <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
                  <span className="font-medium text-foreground/90">Conta</span>{" "}
                  <span className="break-all text-foreground/80">{detail.email}</span>
                </p>
              ) : null}
            </DialogHeader>
          </div>

          <div className="grid gap-4 px-4 py-4 sm:px-5 sm:py-5">
            {resetError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {resetError}
              </p>
            ) : null}

            {resetLink ? (
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="admin-reset-link-field" className="text-xs font-medium">
                    Link de redefinição
                  </Label>
                  <Textarea
                    id="admin-reset-link-field"
                    readOnly
                    value={resetLink}
                    rows={4}
                    className="min-h-[5.5rem] resize-none font-mono text-[11px] leading-snug break-all md:text-xs"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" className="gap-2 sm:min-w-0 sm:flex-1" disabled={resetBusy} onClick={() => void onCopyLink()}>
                    {copyDone ? (
                      <>
                        <Check className="size-4 shrink-0" aria-hidden />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="size-4 shrink-0" aria-hidden />
                        Copiar link
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 sm:shrink-0"
                    disabled={resetBusy}
                    onClick={() => void onGenerateReset()}
                  >
                    {resetBusy ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <RefreshCw className="size-4 shrink-0" aria-hidden />
                    )}
                    Gerar novo link
                  </Button>
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  O link expira conforme as regras do projeto Firebase e deixa de ser válido após ser usado. Não publique em
                  canais abertos.
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                <Button type="button" className="h-11 w-full gap-2" disabled={resetBusy} onClick={() => void onGenerateReset()}>
                  {resetBusy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      A gerar link…
                    </>
                  ) : (
                    <>
                      <Link2 className="size-4 shrink-0" aria-hidden />
                      Gerar link de redefinição
                    </>
                  )}
                </Button>
                <p className="text-center text-[11px] leading-snug text-muted-foreground">
                  O link só é mostrado nesta janela. Copie ou guarde antes de fechar.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
