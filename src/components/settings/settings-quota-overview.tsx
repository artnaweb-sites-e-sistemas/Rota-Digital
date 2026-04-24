"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, FileText, Loader2, Route } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import type { PlanKey } from "@/lib/plan-quotas";
import { type SidebarBillingPlan, planBadgeVisualClasses } from "@/lib/billing-plan-label";
import { cn } from "@/lib/utils";

type QuotaSlice = {
  limit: number;
  used: number;
  isUnlimited: boolean;
  atLimit: boolean;
};

type UserQuotaPayload = {
  plan: PlanKey;
  rotas: QuotaSlice;
  propostas: QuotaSlice;
};

const PLAN_LABEL: Record<PlanKey, string> = {
  starter: "Starter",
  pro: "Pro",
  agency: "Agency",
  master: "Master",
};

const PLAN_KEY_TO_BADGE: Record<PlanKey, SidebarBillingPlan> = {
  starter: "Starter",
  pro: "Pro",
  agency: "Agency",
  master: "Master",
};

function QuotaMeter({
  label,
  icon: Icon,
  q,
}: {
  label: string;
  icon: typeof Route;
  q: QuotaSlice;
}) {
  if (q.isUnlimited) {
    return (
      <div
        className={cn(
          "flex flex-col rounded-xl border border-border/80 bg-muted/25 px-4 py-4 dark:border-white/[0.07] dark:bg-white/[0.03]",
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-brand/10 ring-1 ring-brand/20">
            <Icon className="size-4 text-brand" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground dark:text-white">{label}</p>
            <p className="text-xs text-muted-foreground">Incluído no seu plano</p>
          </div>
        </div>
        <p className="mt-3 text-lg font-bold tracking-tight text-foreground dark:text-white">Ilimitado</p>
      </div>
    );
  }

  const pct = q.limit > 0 ? Math.min(100, Math.round((q.used / q.limit) * 100)) : 0;
  const remaining = Math.max(0, q.limit - q.used);

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border px-4 py-4",
        q.atLimit
          ? "border-destructive/55 bg-destructive/[0.08] dark:border-destructive/50 dark:bg-destructive/12"
          : "border-border/80 bg-muted/25 dark:border-white/[0.07] dark:bg-white/[0.03]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-brand/10 ring-1 ring-brand/20">
            <Icon className="size-4 text-brand" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground dark:text-white">{label}</p>
            <p className="text-xs text-muted-foreground">Usado no ciclo atual</p>
          </div>
        </div>
        {q.atLimit ? (
          <span className="shrink-0 rounded border border-destructive/45 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive dark:border-destructive/50 dark:bg-destructive/15">
            Limite
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground dark:text-white">
          {q.used}
        </span>
        <span className="text-sm text-muted-foreground">/ {q.limit} utilizados</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground dark:text-zinc-200">{remaining}</span> restantes neste
        ciclo
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/80 ring-1 ring-white/5">
        <div
          className="rd-progress-bar-fill h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={q.used}
          aria-valuemin={0}
          aria-valuemax={q.limit}
        />
      </div>
    </div>
  );
}

export function SettingsQuotaOverview() {
  const { user } = useAuth();
  const [data, setData] = useState<UserQuotaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/user-quota", { headers: { Authorization: `Bearer ${idToken}` } });
      if (!res.ok) {
        throw new Error("Falha ao carregar cotas.");
      }
      const json = (await res.json()) as UserQuotaPayload;
      setData(json);
    } catch (e) {
      console.error(e);
      setError("Não foi possível carregar o consumo de cotas.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="min-w-0 border-border bg-card shadow-xl overflow-hidden dark:border-white/5 dark:bg-white/[0.02]">
      <CardHeader className="space-y-2 border-b border-border pb-4 dark:border-white/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand/10 ring-1 ring-brand/20">
              <BarChart3 className="size-4 text-brand dark:text-brand" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-foreground dark:text-white">Cotas do plano</CardTitle>
              <CardDescription className="text-sm text-muted-foreground leading-relaxed">
                Rotas e propostas: utilizadas e restantes no ciclo de faturação atual.
              </CardDescription>
            </div>
          </div>
          {data ? (
            <div className="sm:pl-2">
              <span
                className={cn(
                  "inline-flex items-center rounded px-2.5 py-1 text-xs font-semibold",
                  planBadgeVisualClasses(PLAN_KEY_TO_BADGE[data.plan] ?? "Pro"),
                )}
                title="Plano da sua conta"
              >
                {PLAN_LABEL[data.plan] ?? data.plan}
              </span>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {loading ? (
          <div className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-5 shrink-0 animate-spin text-brand" aria-hidden />
            A carregar cotas…
          </div>
        ) : error ? (
          <p className="rounded-md border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-300">
            {error}
          </p>
        ) : data ? (
          <>
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
              <QuotaMeter label="Rota Digital" icon={Route} q={data.rotas} />
              <QuotaMeter label="Propostas" icon={FileText} q={data.propostas} />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground/90">
              * A cota não é acumulativa e renova a cada mês, conforme o seu ciclo de assinatura.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Inicie sessão para ver o consumo de cotas.</p>
        )}
      </CardContent>
    </Card>
  );
}
