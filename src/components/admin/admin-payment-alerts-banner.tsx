"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  AdminPaymentAlertEntry,
  AdminPaymentAlertsResponse,
} from "@/app/api/admin-users/payment-alerts/route";

function formatMsDatePt(ms: number | null): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  try {
    return new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function entryLabel(e: AdminPaymentAlertEntry): string {
  return e.displayName?.trim() || e.email?.trim() || e.uid.slice(0, 10);
}

function AlertList({
  title,
  description,
  tone,
  entries,
  timestampLabel,
  timestampKey,
}: {
  title: string;
  description: string;
  tone: "amber" | "red";
  entries: AdminPaymentAlertEntry[];
  timestampLabel: string;
  timestampKey: "autoSuspendedAtMs" | "lastPaymentFailureAtMs";
}) {
  if (entries.length === 0) return null;
  const toneClasses =
    tone === "red"
      ? "border-destructive/40 bg-destructive/5 text-destructive-foreground dark:border-destructive/45 dark:bg-destructive/10"
      : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:border-amber-400/35 dark:bg-amber-400/10 dark:text-amber-100";
  const iconTone = tone === "red" ? "text-destructive" : "text-amber-700 dark:text-amber-300";
  const badgeClasses =
    tone === "red"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : "border-amber-500/40 bg-amber-500/20 text-amber-900 dark:text-amber-200";

  return (
    <div className={cn("space-y-2 rounded-md border px-3 py-2.5", toneClasses)}>
      <div className="flex items-center gap-2">
        <AlertTriangle className={cn("size-4 shrink-0", iconTone)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {title} <Badge variant="outline" className={cn("ml-1 text-[10px]", badgeClasses)}>{entries.length}</Badge>
          </p>
          <p className="text-xs opacity-80">{description}</p>
        </div>
      </div>
      <ul className="space-y-1 text-xs">
        {entries.slice(0, 5).map((e) => (
          <li
            key={e.uid}
            className="flex flex-wrap items-center gap-2 rounded-sm bg-background/60 px-2 py-1 dark:bg-background/20"
          >
            <Link
              href={`/dashboard/usuarios/${encodeURIComponent(e.uid)}`}
              className="font-medium underline-offset-2 hover:underline"
            >
              {entryLabel(e)}
            </Link>
            {e.email && e.email !== entryLabel(e) ? (
              <span className="text-[11px] opacity-70">({e.email})</span>
            ) : null}
            <span className="ml-auto flex items-center gap-1 text-[11px] tabular-nums opacity-75">
              <span className="opacity-70">{timestampLabel}:</span>
              {formatMsDatePt(e[timestampKey])}
            </span>
          </li>
        ))}
        {entries.length > 5 ? (
          <li className="px-2 text-[11px] opacity-70">+ {entries.length - 5} não exibidos</li>
        ) : null}
      </ul>
    </div>
  );
}

export function AdminPaymentAlertsBanner() {
  const { user } = useAuth();
  const [data, setData] = useState<AdminPaymentAlertsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin-users/payment-alerts", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = (await res.json().catch(() => ({}))) as AdminPaymentAlertsResponse & {
        error?: string;
      };
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Erro ao carregar alertas.");
        setData(null);
        return;
      }
      setData({ pastDue: body.pastDue ?? [], autoSuspended: body.autoSuspended ?? [] });
    } catch {
      setError("Erro de rede ao carregar alertas.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = useMemo(
    () => (data ? data.pastDue.length + data.autoSuspended.length : 0),
    [data],
  );

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        A verificar alertas de pagamento…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        <span>Não foi possível carregar alertas de pagamento: {error}</span>
        <Button type="button" size="sm" variant="ghost" onClick={() => void load()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (!data || total === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 dark:border-amber-400/25 dark:bg-amber-400/[0.04]">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
        <p className="flex-1 text-sm font-semibold text-amber-900 dark:text-amber-100">
          {total} {total === 1 ? "conta" : "contas"} com pagamento em risco
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-amber-900 hover:bg-amber-500/10 dark:text-amber-100"
          onClick={() => setCollapsed((s) => !s)}
        >
          {collapsed ? (
            <>
              <ChevronDown className="mr-1 size-3" aria-hidden /> Expandir
            </>
          ) : (
            <>
              <ChevronUp className="mr-1 size-3" aria-hidden /> Recolher
            </>
          )}
        </Button>
      </div>
      {collapsed ? null : (
        <div className="space-y-2">
          <AlertList
            title="Pagamento em atraso"
            description="Stripe ainda a tentar cobrar — conta continua ativa até decisão final."
            tone="amber"
            entries={data.pastDue}
            timestampLabel="última falha"
            timestampKey="lastPaymentFailureAtMs"
          />
          <AlertList
            title="Suspensas automaticamente"
            description="Stripe marcou como unpaid/canceled/expired; login bloqueado."
            tone="red"
            entries={data.autoSuspended}
            timestampLabel="suspensa em"
            timestampKey="autoSuspendedAtMs"
          />
        </div>
      )}
    </div>
  );
}
