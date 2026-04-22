"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { PlatformVolumeCharts } from "@/components/admin/platform-volume-charts";
import {
  PlatformPeriodSelector,
  type PlatformPeriodMonth,
  type PlatformPeriodYear,
} from "@/components/admin/platform-period-selector";
import { useAuth } from "@/lib/auth-context";
import { isGeneralAdminEmail } from "@/lib/general-admin";
import type { AdminListedUser, AdminUserSubscriptionStatus } from "@/types/admin-user-list";
import type { PlatformSeriesResponse } from "@/types/platform-series";
import type { PlatformStats } from "@/types/platform-stats";
import type { StoredStripeInvoice } from "@/types/stripe-invoice";
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
import { Input } from "@/components/ui/input";
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

function formatMsDateTimePt(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  try {
    return new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function formatMsDatePt(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  try {
    return new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "—";
  }
}

type AccountStatusAppearance = {
  label: string;
  variant: "default" | "outline" | "destructive" | "secondary";
  className: string;
  icon?: "alert" | null;
  sub: string | null;
  /** Quando presente, é mostrado como Badge ao lado do badge principal (sem substituir `sub`). */
  subBadge?: { label: string; className: string } | null;
};

function mapAutoSuspendedReasonPt(reason: string | null | undefined): string {
  switch (reason) {
    case "subscription_unpaid":
      return "assinatura não paga";
    case "subscription_canceled":
      return "assinatura cancelada";
    case "subscription_incomplete_expired":
      return "assinatura expirou antes do 1.º pagamento";
    default:
      return "pagamento em falta";
  }
}

const STRIPE_REFUND_REASON_LABEL: Record<
  "requested_by_customer" | "duplicate" | "fraudulent" | "none",
  string
> = {
  requested_by_customer: "Pedido do cliente",
  duplicate: "Cobrança duplicada",
  fraudulent: "Transação fraudulenta",
  none: "Sem motivo declarado",
};

function subscriptionStatusLabelPt(status: AdminUserSubscriptionStatus | undefined): string {
  switch (status) {
    case "active":
      return "Assinatura ativa";
    case "trialing":
      return "Em período de teste";
    case "past_due":
      return "Pagamento em atraso";
    case "unpaid":
      return "Assinatura não paga";
    case "canceled":
      return "Assinatura cancelada";
    case "incomplete":
      return "Pagamento incompleto";
    case "incomplete_expired":
      return "Pagamento expirado";
    case "none":
    default:
      return "Sem assinatura Stripe";
  }
}

function computeAccountStatus(detail: AdminListedUser | null): AccountStatusAppearance {
  if (!detail) {
    return { label: "—", variant: "outline", className: "", sub: null };
  }
  const status = detail.subscriptionStatus;
  const autoSuspended = detail.autoSuspended === true;

  if (autoSuspended) {
    return {
      label: "Rebaixada para Starter",
      variant: "outline",
      className:
        "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200",
      icon: "alert",
      sub: `Rebaixamento automático · ${mapAutoSuspendedReasonPt(detail.autoSuspendedReason)} · ${formatMsDatePt(detail.autoSuspendedAtMs ?? null)}`,
    };
  }
  if (detail.disabled) {
    return {
      label: "Conta desativada",
      variant: "destructive",
      className: "",
      sub: "Desativada manualmente pelo admin",
    };
  }
  if (status === "past_due") {
    return {
      label: "Pagamento em atraso",
      variant: "outline",
      className:
        "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200",
      icon: "alert",
      sub: detail.lastPaymentFailureAtMs
        ? `Última falha: ${formatMsDateTimePt(detail.lastPaymentFailureAtMs)}`
        : "Stripe a tentar cobrar novamente",
    };
  }
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
    return {
      label: subscriptionStatusLabelPt(status),
      variant: "destructive",
      className: "",
      sub: null,
    };
  }
  const subscriptionBadgeClassName =
    status === "trialing"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:border-amber-400/35 dark:bg-amber-400/10 dark:text-amber-200"
      : "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:border-sky-400/35 dark:bg-sky-400/15 dark:text-sky-200";

  return {
    label: "Conta ativa",
    variant: "outline",
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300",
    sub: null,
    subBadge:
      status && status !== "none"
        ? {
            label: subscriptionStatusLabelPt(status),
            className: subscriptionBadgeClassName,
          }
        : null,
  };
}

function sumAddOnCentsForPeriod(
  map: Record<string, number> | undefined,
  year: PlatformPeriodYear,
  month: PlatformPeriodMonth,
): number {
  if (!map) return 0;
  if (typeof year === "number" && typeof month === "number") {
    const k = `${year}-${String(month).padStart(2, "0")}`;
    return map[k] ?? 0;
  }
  if (typeof year === "number" && month === "all") {
    const p = `${year}-`;
    return Object.entries(map)
      .filter(([key]) => key.startsWith(p))
      .reduce((s, [, v]) => s + (typeof v === "number" && Number.isFinite(v) ? v : 0), 0);
  }
  if (year === "all" && typeof month === "number") {
    const m = String(month).padStart(2, "0");
    return Object.entries(map)
      .filter(([key]) => key.length >= 7 && key.endsWith(`-${m}`))
      .reduce((s, [, v]) => s + (typeof v === "number" && Number.isFinite(v) ? v : 0), 0);
  }
  return Object.values(map).reduce(
    (s, v) => s + (typeof v === "number" && Number.isFinite(v) ? v : 0),
    0,
  );
}

function formatBillingPeriodLabel(year: PlatformPeriodYear, month: PlatformPeriodMonth): string {
  if (typeof year === "number" && typeof month === "number") {
    const raw = new Date(2000, month - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
    const mLabel = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : String(month);
    return `${mLabel} de ${year}`;
  }
  if (typeof year === "number" && month === "all") {
    return `Ano ${year} (soma dos 12 meses)`;
  }
  if (year === "all" && typeof month === "number") {
    const raw = new Date(2000, month - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
    const mLabel = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : String(month);
    return `${mLabel} — todos os anos`;
  }
  return "Todo o período (soma geral)";
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
  const billingPeriodLabel = useMemo(
    () => formatBillingPeriodLabel(periodYear, periodMonth),
    [periodYear, periodMonth],
  );
  const addOnPaidInSelectedPeriodCents = useMemo(
    () => sumAddOnCentsForPeriod(detail?.addOnPaidByMonthCents, periodYear, periodMonth),
    [detail?.addOnPaidByMonthCents, periodYear, periodMonth],
  );
  /** Renovações de plano pagas (Stripe) — real, vindo do webhook `invoice.paid`. */
  const subscriptionPaidInSelectedPeriodCents = useMemo(
    () => sumAddOnCentsForPeriod(detail?.subscriptionPaidByMonthCents, periodYear, periodMonth),
    [detail?.subscriptionPaidByMonthCents, periodYear, periodMonth],
  );
  const stripeRealPaidInSelectedPeriodCents = useMemo(
    () => subscriptionPaidInSelectedPeriodCents + addOnPaidInSelectedPeriodCents,
    [subscriptionPaidInSelectedPeriodCents, addOnPaidInSelectedPeriodCents],
  );

  const accountStatus = useMemo(() => computeAccountStatus(detail), [detail]);

  const [invoices, setInvoices] = useState<StoredStripeInvoice[] | null>(null);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [stripePortalBusy, setStripePortalBusy] = useState(false);
  const [stripePortalError, setStripePortalError] = useState<string | null>(null);

  const [refundTarget, setRefundTarget] = useState<StoredStripeInvoice | null>(null);
  const [refundAmountReais, setRefundAmountReais] = useState<string>("");
  const [refundReason, setRefundReason] = useState<
    "requested_by_customer" | "duplicate" | "fraudulent" | "none"
  >("requested_by_customer");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const openStripePortal = useCallback(async () => {
    if (!user || !uid) return;
    setStripePortalBusy(true);
    setStripePortalError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin-users/${encodeURIComponent(uid)}/stripe-portal`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setStripePortalError(
          typeof body.error === "string" ? body.error : "Não foi possível abrir o portal Stripe.",
        );
        return;
      }
      window.open(body.url, "_blank", "noopener,noreferrer");
    } catch {
      setStripePortalError("Erro de rede ao abrir o portal Stripe.");
    } finally {
      setStripePortalBusy(false);
    }
  }, [user, uid]);

  const loadInvoices = useCallback(async () => {
    if (!user || !uid) return;
    setInvoicesLoading(true);
    setInvoicesError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin-users/${encodeURIComponent(uid)}/invoices?limit=50`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = (await res.json().catch(() => ({}))) as {
        invoices?: StoredStripeInvoice[];
        error?: string;
      };
      if (!res.ok) {
        setInvoices(null);
        setInvoicesError(
          typeof body.error === "string" ? body.error : "Não foi possível carregar faturas.",
        );
        return;
      }
      setInvoices(Array.isArray(body.invoices) ? body.invoices : []);
    } catch {
      setInvoices(null);
      setInvoicesError("Erro de rede ao carregar faturas.");
    } finally {
      setInvoicesLoading(false);
    }
  }, [user, uid]);

  useEffect(() => {
    if (authLoading || !user || !isGeneralAdmin || !uid) return;
    void loadInvoices();
  }, [authLoading, user, isGeneralAdmin, uid, loadInvoices]);

  const openRefundDialog = useCallback((inv: StoredStripeInvoice) => {
    const paid = typeof inv.amountPaidCents === "number" ? inv.amountPaidCents : 0;
    const refunded = typeof inv.refundedCents === "number" ? inv.refundedCents : 0;
    const remaining = Math.max(0, paid - refunded);
    setRefundTarget(inv);
    setRefundAmountReais((remaining / 100).toFixed(2).replace(".", ","));
    setRefundReason("requested_by_customer");
    setRefundError(null);
  }, []);

  const closeRefundDialog = useCallback(() => {
    if (refundBusy) return;
    setRefundTarget(null);
    setRefundError(null);
  }, [refundBusy]);

  const submitRefund = useCallback(async () => {
    if (!user || !uid || !refundTarget) return;
    const paid = typeof refundTarget.amountPaidCents === "number" ? refundTarget.amountPaidCents : 0;
    const refundedSoFar =
      typeof refundTarget.refundedCents === "number" ? refundTarget.refundedCents : 0;
    const remaining = Math.max(0, paid - refundedSoFar);

    const normalized = refundAmountReais.replace(/\s+/g, "").replace(",", ".");
    const asFloat = Number(normalized);
    if (!Number.isFinite(asFloat) || asFloat <= 0) {
      setRefundError("Informe um valor válido em reais.");
      return;
    }
    const amountCents = Math.round(asFloat * 100);
    if (amountCents > remaining) {
      setRefundError(
        `Valor excede o disponível (${(remaining / 100).toFixed(2).replace(".", ",")}).`,
      );
      return;
    }

    setRefundBusy(true);
    setRefundError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(
        `/api/admin-users/${encodeURIComponent(uid)}/invoices/${encodeURIComponent(refundTarget.stripeInvoiceId)}/refund`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amountCents,
            ...(refundReason !== "none" ? { reason: refundReason } : {}),
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setRefundError(typeof body.error === "string" ? body.error : "Falha ao estornar.");
        return;
      }
      setRefundTarget(null);
      await Promise.all([loadInvoices(), loadDetail()]);
    } catch {
      setRefundError("Erro de rede ao estornar.");
    } finally {
      setRefundBusy(false);
    }
  }, [user, uid, refundTarget, refundAmountReais, refundReason, loadInvoices, loadDetail]);

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

  const onDeleteAccount = async () => {
    if (!user || !detail) return;
    if (!detail.disabled) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin-users/${encodeURIComponent(uid)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setDeleteError(
          typeof body.error === "string"
            ? body.error
            : "Falha ao excluir a conta.",
        );
        return;
      }
      router.replace("/dashboard/usuarios");
    } catch {
      setDeleteError("Erro de rede ao excluir a conta.");
    } finally {
      setDeleteBusy(false);
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
        <div className="grid items-stretch gap-6 lg:grid-cols-2">
          <Card className="h-full min-h-0 min-w-0 border-sidebar-border/80 dark:border-white/10">
            <CardHeader className="gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant={accountStatus.variant}
                  className={cn("text-xs font-medium", accountStatus.className)}
                >
                  {accountStatus.icon === "alert" ? (
                    <AlertTriangle className="mr-1 size-3" aria-hidden />
                  ) : null}
                  {accountStatus.label}
                </Badge>
                {accountStatus.subBadge ? (
                  <Badge
                    variant="outline"
                    className={cn("text-xs font-medium", accountStatus.subBadge.className)}
                  >
                    {accountStatus.subBadge.label}
                  </Badge>
                ) : null}
              </div>
              {accountStatus.sub ? (
                <p className="text-xs text-muted-foreground">{accountStatus.sub}</p>
              ) : null}
              {detail.autoSuspended ? (
                <p className="flex items-start gap-1.5 rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                  <span>
                    Rebaixamento automático pelo webhook Stripe (pagamento não concluído). O utilizador
                    mantém o login e passa a usar o plano Starter. O plano anterior é restaurado assim que
                    a Stripe confirmar um pagamento.
                  </span>
                </p>
              ) : null}
              {!detail.autoSuspended && detail.subscriptionStatus === "past_due" ? (
                <p className="flex items-start gap-1.5 rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                  <span>
                    Última cobrança falhou
                    {detail.lastPaymentFailureAtMs
                      ? ` em ${formatMsDateTimePt(detail.lastPaymentFailureAtMs)}`
                      : ""}
                    . Stripe a tentar de novo — se desistir, a conta será rebaixada para Starter automaticamente.
                  </span>
                </p>
              ) : null}
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-0 text-sm">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">
                <div className="space-y-4 border-t border-border pt-5 dark:border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">E-mail</span>
                    <span className="min-w-0 break-all font-medium">{detail.email ?? "—"}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
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
                </div>
                <dl className="grid gap-2.5 text-xs sm:text-sm">
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
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 border-t border-border pt-4 dark:border-white/10">
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
                {detail.disabled ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    disabled={deleteBusy}
                    onClick={() => {
                      setDeleteDialogOpen(true);
                      setDeleteConfirmText("");
                      setDeleteError(null);
                    }}
                  >
                    Excluir conta
                  </Button>
                ) : null}
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
                {detail.stripeCustomerId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={stripePortalBusy}
                    onClick={() => {
                      void openStripePortal();
                    }}
                  >
                    {stripePortalBusy ? (
                      <>
                        <Loader2 className="mr-1 size-3 animate-spin" aria-hidden />
                        A abrir…
                      </>
                    ) : (
                      <>
                        Portal Stripe
                        <ExternalLink className="ml-1 size-3" aria-hidden />
                      </>
                    )}
                  </Button>
                ) : null}
              </div>
              {stripePortalError ? (
                <p className="text-xs text-destructive">{stripePortalError}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="h-full min-h-0 min-w-0 border-sidebar-border/80 dark:border-white/10">
            <CardHeader>
              <CardTitle className="font-heading text-lg">Plano e utilização</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <dl className="grid gap-2.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground/70">
                  Pago real (Stripe) · {billingPeriodLabel}
                </p>
                <div className="flex w-full min-w-0 items-end gap-1.5">
                  <dt className="min-w-0 text-muted-foreground">Renovações de plano</dt>
                  <span
                    className="min-w-2 flex-1 self-end border-b-2 border-dotted border-foreground/20 -translate-y-1.5"
                    aria-hidden
                  />
                  <dd className="shrink-0 text-sm font-medium tabular-nums text-foreground/85">
                    {formatBrlFromCents(subscriptionPaidInSelectedPeriodCents)}
                  </dd>
                </div>
                <div className="flex w-full min-w-0 items-end gap-1.5">
                  <dt className="min-w-0 text-muted-foreground">Pacotes adicionais</dt>
                  <span
                    className="min-w-2 flex-1 self-end border-b-2 border-dotted border-foreground/20 -translate-y-1.5"
                    aria-hidden
                  />
                  <dd className="shrink-0 text-sm font-medium tabular-nums text-foreground/85">
                    {formatBrlFromCents(addOnPaidInSelectedPeriodCents)}
                  </dd>
                </div>
                <div className="flex w-full min-w-0 items-end gap-1.5">
                  <dt className="min-w-0 text-foreground">Cash-in Stripe</dt>
                  <span
                    className="min-w-2 flex-1 self-end border-b-2 border-dotted border-foreground/20 -translate-y-1.5"
                    aria-hidden
                  />
                  <dd className="shrink-0 font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {formatBrlFromCents(stripeRealPaidInSelectedPeriodCents)}
                  </dd>
                </div>
                {detail.subscriptionCurrentPeriodEndMs ? (
                  <div className="flex w-full min-w-0 items-end gap-1.5 pt-1 text-xs text-muted-foreground">
                    <dt className="min-w-0">Próxima renovação</dt>
                    <span
                      className="min-w-2 flex-1 self-end border-b border-dotted border-foreground/20 -translate-y-1"
                      aria-hidden
                    />
                    <dd className="shrink-0 tabular-nums">
                      {formatMsDatePt(detail.subscriptionCurrentPeriodEndMs)}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <dl className="grid gap-2 border-t border-border pt-3 dark:border-white/10">
                <div className="flex w-full min-w-0 items-end gap-1.5">
                  <dt
                    className="shrink-0 font-medium"
                    style={{ color: PLATFORM_CHART_COLOR_LEADS }}
                  >
                    Leads gerados
                  </dt>
                  <span
                    className="min-w-2 flex-1 self-end border-b-2 border-dotted border-foreground/20 -translate-y-1.5"
                    aria-hidden
                  />
                  <dd className="shrink-0 text-base font-medium tabular-nums">
                    <span className="text-foreground">
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
                <div className="flex w-full min-w-0 items-end gap-1.5">
                  <dt
                    className="shrink-0 font-medium"
                    style={{ color: PLATFORM_CHART_COLOR_REPORTS }}
                  >
                    Rotas digitais
                  </dt>
                  <span
                    className="min-w-2 flex-1 self-end border-b-2 border-dotted border-foreground/20 -translate-y-1.5"
                    aria-hidden
                  />
                  <dd className="shrink-0 text-base font-medium tabular-nums">
                    <span className="text-foreground">
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
                <div className="flex w-full min-w-0 items-end gap-1.5">
                  <dt
                    className="shrink-0 font-medium"
                    style={{ color: PLATFORM_CHART_COLOR_PROPOSALS }}
                  >
                    Propostas
                  </dt>
                  <span
                    className="min-w-2 flex-1 self-end border-b-2 border-dotted border-foreground/20 -translate-y-1.5"
                    aria-hidden
                  />
                  <dd className="shrink-0 text-base font-medium tabular-nums">
                    <span className="text-foreground">
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

      {detail ? (
        <Card className="border-sidebar-border/80 dark:border-white/10">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="font-heading text-lg">Faturas (Stripe)</CardTitle>
              <p className="text-xs text-muted-foreground">
                Histórico real de cobranças processadas pelo webhook Stripe. Ordenadas por data de criação, mais recentes primeiro.
              </p>
            </div>
            {invoicesLoading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
            ) : null}
          </CardHeader>
          <CardContent>
            {invoicesError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {invoicesError}
              </p>
            ) : invoices == null ? (
              <p className="text-xs text-muted-foreground">A carregar faturas…</p>
            ) : invoices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sem faturas registadas para este utilizador. Cobranças futuras aparecem aqui automaticamente via webhook Stripe.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground dark:border-white/10">
                      <th className="py-2 pr-3 font-medium">Data</th>
                      <th className="py-2 pr-3 font-medium">Motivo</th>
                      <th className="py-2 pr-3 font-medium">Período</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 text-right font-medium">Valor</th>
                      <th className="py-2 pr-3 text-right font-medium">PDF</th>
                      <th className="py-2 text-right font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const paidOrCreatedMs = inv.paidAtMs ?? inv.createdAtMs;
                      const amountShownCents =
                        inv.status === "paid" ? inv.amountPaidCents : inv.amountDueCents;
                      const statusLabel =
                        inv.status === "paid"
                          ? "Paga"
                          : inv.status === "open"
                            ? "Em aberto"
                            : inv.status === "void"
                              ? "Anulada"
                              : inv.status === "uncollectible"
                                ? "Incobrável"
                                : inv.status === "draft"
                                  ? "Rascunho"
                                  : inv.status || "—";
                      const billingReasonLabel =
                        inv.billingReason === "subscription_create"
                          ? "Criação de assinatura"
                          : inv.billingReason === "subscription_cycle"
                            ? "Renovação mensal/anual"
                            : inv.billingReason === "subscription_update"
                              ? "Atualização de plano"
                              : inv.billingReason === "manual"
                                ? "Cobrança manual"
                                : inv.billingReason === "subscription"
                                  ? "Assinatura"
                                  : inv.billingReason === "add_on"
                                    ? "Pacote adicional"
                                    : inv.billingReason ?? "—";
                      return (
                        <tr
                          key={inv.stripeInvoiceId}
                          className="border-b border-border/60 align-top last:border-b-0 dark:border-white/[0.07]"
                        >
                          <td className="py-2 pr-3 tabular-nums">
                            {formatMsDatePt(paidOrCreatedMs)}
                            {inv.paidAtMs && inv.paidAtMs !== inv.createdAtMs ? (
                              <span className="block text-[10px] text-muted-foreground/70">
                                paga {formatMsDatePt(inv.paidAtMs)}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground">
                            {billingReasonLabel}
                            {inv.number ? (
                              <span className="block font-mono text-[10px] text-muted-foreground/60">
                                {inv.number}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground tabular-nums">
                            {inv.periodStartMs && inv.periodEndMs
                              ? `${formatMsDatePt(inv.periodStartMs)} → ${formatMsDatePt(inv.periodEndMs)}`
                              : "—"}
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge
                                variant={
                                  inv.status === "paid"
                                    ? "outline"
                                    : inv.status === "open" || inv.status === "uncollectible"
                                      ? "destructive"
                                      : "secondary"
                                }
                                className={cn(
                                  "text-[10px] font-medium",
                                  inv.status === "paid" &&
                                    "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300",
                                )}
                              >
                                {statusLabel}
                              </Badge>
                              {inv.refundStatus ? (
                                <Badge
                                  variant="outline"
                                  className="border-amber-500/40 bg-amber-500/10 text-[10px] font-medium text-amber-800 dark:border-amber-400/35 dark:bg-amber-400/10 dark:text-amber-200"
                                >
                                  {inv.refundStatus === "refunded" ? "Estornada" : "Estorno parcial"}
                                </Badge>
                              ) : null}
                            </div>
                            {inv.refundedCents && inv.refundedCents > 0 ? (
                              <span className="mt-1 block text-[10px] text-muted-foreground">
                                Estornado: {formatBrlFromCents(inv.refundedCents)}
                              </span>
                            ) : null}
                            {inv.failureMessage ? (
                              <span className="mt-1 block text-[10px] text-destructive">
                                {inv.failureMessage}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 text-right font-medium tabular-nums">
                            {formatBrlFromCents(amountShownCents)}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {inv.hostedInvoiceUrl || inv.invoicePdf ? (
                              <a
                                href={inv.hostedInvoiceUrl ?? inv.invoicePdf ?? "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-sidebar-primary hover:underline dark:text-zinc-200"
                              >
                                Abrir
                                <ExternalLink className="size-3" aria-hidden />
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground/60">—</span>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            {(() => {
                              const paid =
                                typeof inv.amountPaidCents === "number" ? inv.amountPaidCents : 0;
                              const refunded =
                                typeof inv.refundedCents === "number" ? inv.refundedCents : 0;
                              const remaining = Math.max(0, paid - refunded);
                              if (inv.status !== "paid" || remaining <= 0) {
                                return <span className="text-xs text-muted-foreground/60">—</span>;
                              }
                              return (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => openRefundDialog(inv)}
                                >
                                  <RotateCcw className="mr-1 size-3" aria-hidden />
                                  Estornar
                                </Button>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={refundTarget != null}
        onOpenChange={(open) => {
          if (!open) closeRefundDialog();
        }}
      >
        <DialogContent
          className="gap-3 p-4 pt-3 pb-7 sm:max-w-md sm:gap-3 sm:px-6 sm:pt-4 sm:pb-8"
          showCloseButton
        >
          <DialogHeader className="gap-2 space-y-0 text-left sm:gap-2.5">
            <DialogTitle>Estornar pagamento Stripe</DialogTitle>
            <DialogDescription className="space-y-2.5 text-sm leading-relaxed text-muted-foreground">
              {refundTarget ? (
                <>
                  <span className="block text-foreground/90">
                    O valor devolvido volta para o cartão do cliente e deixa de contar nos
                    indicadores de receita do painel.
                  </span>
                  <span className="block text-xs leading-normal text-muted-foreground/90">
                    Referência da fatura:{" "}
                    <span className="break-all text-foreground/80">
                      {refundTarget.stripeInvoiceId}
                    </span>
                  </span>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {refundTarget ? (
            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3.5 text-xs dark:border-white/10 dark:bg-white/[0.03]">
                <span className="text-muted-foreground">Valor pago</span>
                <span className="text-right tabular-nums">
                  {formatBrlFromCents(refundTarget.amountPaidCents)}
                </span>
                <span className="text-muted-foreground">Já estornado</span>
                <span className="text-right tabular-nums">
                  {formatBrlFromCents(refundTarget.refundedCents ?? 0)}
                </span>
                <span className="font-medium">Disponível para estorno</span>
                <span className="text-right font-medium tabular-nums">
                  {formatBrlFromCents(
                    Math.max(
                      0,
                      (refundTarget.amountPaidCents ?? 0) - (refundTarget.refundedCents ?? 0),
                    ),
                  )}
                </span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="refund-amount" className="text-foreground">
                  Valor a estornar (R$)
                </Label>
                <Input
                  id="refund-amount"
                  inputMode="decimal"
                  value={refundAmountReais}
                  onChange={(e) => setRefundAmountReais(e.target.value)}
                  disabled={refundBusy}
                  className="h-10"
                />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Exemplo: 0,50 para cinquenta centavos. Para reembolsar tudo, deixa o valor igual ao
                  disponível acima.
                </p>
              </div>
              <div className="space-y-2 pt-0.5">
                <Label htmlFor="refund-reason" className="text-foreground">
                  Motivo do reembolso
                </Label>
                <Select
                  value={refundReason}
                  onValueChange={(v) => setRefundReason(v as typeof refundReason)}
                  disabled={refundBusy}
                >
                  <SelectTrigger id="refund-reason" className="w-full min-w-0" size="default">
                    <SelectValue>
                      {STRIPE_REFUND_REASON_LABEL[refundReason]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="requested_by_customer">Pedido do cliente</SelectItem>
                    <SelectItem value="duplicate">Cobrança duplicada</SelectItem>
                    <SelectItem value="fraudulent">Transação fraudulenta</SelectItem>
                    <SelectItem value="none">Sem motivo declarado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {refundError ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive">
                  {refundError}
                </p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="flex flex-col-reverse gap-2 border-0 bg-transparent p-0 sm:flex-row sm:justify-end sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refundBusy}
              onClick={closeRefundDialog}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="gap-2"
              disabled={refundBusy || !refundTarget}
              onClick={() => void submitRefund()}
            >
              {refundBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  A processar…
                </>
              ) : (
                <>
                  <RotateCcw className="size-3" aria-hidden />
                  Estornar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deleteBusy) return;
          setDeleteDialogOpen(open);
          if (!open) {
            setDeleteConfirmText("");
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Excluir esta conta permanentemente?</DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">
                Esta ação é <strong>irreversível</strong>. Serão apagados todos os dados do
                utilizador em Firestore (relatórios, propostas, leads, faturas sincronizadas) e o
                registo no Firebase Authentication.
              </span>
              <span className="block">
                O e-mail{" "}
                <span className="font-medium text-foreground">
                  {detail?.email?.trim() || detail?.uid}
                </span>{" "}
                ficará livre para voltar a registar-se do zero.
              </span>
              <span className="block text-xs text-muted-foreground">
                As faturas geradas na Stripe continuam preservadas no painel Stripe para auditoria.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm" className="text-xs font-medium text-muted-foreground">
              Para confirmar, escreve <code className="text-foreground">EXCLUIR</code>
            </Label>
            <Input
              id="delete-confirm"
              autoComplete="off"
              autoCorrect="off"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              disabled={deleteBusy}
            />
          </div>
          {deleteError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {deleteError}
            </p>
          ) : null}
          <DialogFooter className="flex flex-col-reverse gap-2 border-0 bg-transparent p-0 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={deleteBusy}
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="gap-2"
              disabled={
                deleteBusy || deleteConfirmText.trim().toUpperCase() !== "EXCLUIR" || !detail
              }
              onClick={() => void onDeleteAccount()}
            >
              {deleteBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  A excluir…
                </>
              ) : (
                "Excluir definitivamente"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
