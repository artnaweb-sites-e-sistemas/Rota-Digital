"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Link2, Loader2, RefreshCw } from "lucide-react";

import { PlatformVolumeCharts } from "@/components/admin/platform-volume-charts";
import {
  PlatformPeriodSelector,
  type PlatformPeriodMonth,
  type PlatformPeriodYear,
} from "@/components/admin/platform-period-selector";
import { useAuth } from "@/lib/auth-context";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PLATFORM_CHART_COLOR_LEADS,
  PLATFORM_CHART_COLOR_PROPOSALS,
  PLATFORM_CHART_COLOR_REPORTS,
} from "@/lib/platform-chart-colors";
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

function formatBrlFromCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);

  const [periodYear, setPeriodYear] = useState<PlatformPeriodYear>(() => new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState<PlatformPeriodMonth>(() => new Date().getMonth() + 1);
  const [platformSeries, setPlatformSeries] = useState<PlatformSeriesResponse | null>(null);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [seriesLoadError, setSeriesLoadError] = useState<string | null>(null);

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
                  <dd className="tabular-nums">{formatDatePt(detail.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Último acesso</dt>
                  <dd className="tabular-nums">{formatDatePt(detail.lastSignInAt)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">UID</dt>
                  <dd className="max-w-[min(100%,14rem)] truncate font-mono text-[11px]">{detail.uid}</dd>
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
                  className={cn(
                    "font-semibold",
                    "border-sidebar-primary/45 bg-sidebar-primary/12 text-sidebar-primary",
                    "dark:border-sidebar-primary/50 dark:bg-sidebar-primary/15 dark:text-sidebar-primary",
                  )}
                >
                  {detail.plan}
                </Badge>
              </div>
              <dl className="grid gap-3">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Valor do plano (mensal / referência)</dt>
                  <dd className="font-medium tabular-nums">{formatBrlFromCents(detail.planPriceCents)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Total pago até agora</dt>
                  <dd className="font-medium tabular-nums">{formatBrlFromCents(detail.lifetimePaidCents)}</dd>
                </div>
              </dl>
              <dl className="grid gap-2 border-t border-border pt-3 dark:border-white/10">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Leads gerados</dt>
                  <dd
                    className="text-lg font-semibold tabular-nums"
                    style={{ color: PLATFORM_CHART_COLOR_LEADS }}
                  >
                    {detail.leadsCount.toLocaleString("pt-BR")}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Rotas digitais</dt>
                  <dd
                    className="text-lg font-semibold tabular-nums"
                    style={{ color: PLATFORM_CHART_COLOR_REPORTS }}
                  >
                    {detail.reportsCount.toLocaleString("pt-BR")}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Propostas</dt>
                  <dd
                    className="text-lg font-semibold tabular-nums"
                    style={{ color: PLATFORM_CHART_COLOR_PROPOSALS }}
                  >
                    {detail.proposalsCount.toLocaleString("pt-BR")}
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
