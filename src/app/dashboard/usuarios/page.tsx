"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsUpDown,
  Copy,
  Loader2,
  Search,
  UserPlus,
  X,
} from "lucide-react";

import { AdminGrowthCharts } from "@/components/admin/admin-growth-charts";
import { PlatformVolumeCharts } from "@/components/admin/platform-volume-charts";
import {
  PlatformPeriodSelector,
  type PlatformPeriodMonth,
  type PlatformPeriodYear,
} from "@/components/admin/platform-period-selector";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PLATFORM_CHART_COLOR_LEADS,
  PLATFORM_CHART_COLOR_PROPOSALS,
  PLATFORM_CHART_COLOR_REPORTS,
} from "@/lib/platform-chart-colors";
import { cn } from "@/lib/utils";
import type { AdminListedUser, AdminUsersListResponse } from "@/types/admin-user-list";
import type { PlatformSeriesResponse } from "@/types/platform-series";
import type { PlatformStats } from "@/types/platform-stats";
import { useAdminUsersTableColumnWidths } from "@/lib/admin-users-table-column-widths";

function formatCount(n: number) {
  return n.toLocaleString("pt-BR");
}

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

function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function rowTimestamp(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

const PLAN_FILTER_ALL = "all" as const;
const PLAN_FILTER_PRO = "pro" as const;
type AdminUserPlanFilter = typeof PLAN_FILTER_ALL | typeof PLAN_FILTER_PRO;

type UsersSortKey = "leads" | "reports" | "proposals" | "created" | "lastAccess";
type UsersSortState = { key: UsersSortKey | null; dir: "asc" | "desc" };

function SortHeaderGlyph({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) {
    return <ChevronsUpDown className="size-3 shrink-0 opacity-40" aria-hidden />;
  }
  return dir === "asc" ? (
    <ArrowUp className="size-3 shrink-0 text-foreground" aria-hidden />
  ) : (
    <ArrowDown className="size-3 shrink-0 text-foreground" aria-hidden />
  );
}

function AdminUsersColumnResizeHandle({
  leftColumnIndex,
  onResizerMouseDown,
}: {
  leftColumnIndex: number;
  onResizerMouseDown: (leftColumnIndex: number, e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label="Arrastar para redimensionar a coluna"
      title="Redimensionar coluna"
      className={cn(
        "group absolute inset-y-2 right-0 z-10 flex w-2.5 cursor-col-resize items-center justify-center border-0 bg-transparent p-0",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/45",
      )}
      onMouseDown={(e) => onResizerMouseDown(leftColumnIndex, e)}
    >
      <span
        className={cn(
          "pointer-events-none block h-[min(64%,2.25rem)] w-px shrink-0 origin-center scale-x-[0.55]",
          "bg-foreground/[0.14] transition-[transform,background-color] duration-150 ease-out",
          "group-hover:scale-x-100 group-hover:bg-foreground/[0.24]",
          "group-active:bg-foreground/[0.3]",
          "dark:bg-white/[0.16] dark:group-hover:bg-white/[0.26] dark:group-active:bg-white/[0.32]",
        )}
        aria-hidden
      />
    </button>
  );
}

function filterAdminUsers(
  users: AdminListedUser[],
  opts: { q: string; planFilter: AdminUserPlanFilter },
): AdminListedUser[] {
  const needle = normalizeSearchText(opts.q);

  return users.filter((row) => {
    if (opts.planFilter === PLAN_FILTER_PRO) {
      const p = row.plan?.trim().toLowerCase() ?? "";
      if (p !== "pro") return false;
    }

    if (needle) {
      const email = normalizeSearchText(row.email ?? "");
      const name = normalizeSearchText(row.displayName ?? "");
      const agency = normalizeSearchText(row.companyName ?? "");
      if (!email.includes(needle) && !name.includes(needle) && !agency.includes(needle)) return false;
    }

    return true;
  });
}

function sortAdminUsers(users: AdminListedUser[], sort: UsersSortState): AdminListedUser[] {
  if (!sort.key) return users;
  const mult = sort.dir === "asc" ? 1 : -1;
  const copy = [...users];
  copy.sort((a, b) => {
    switch (sort.key) {
      case "leads": {
        const cmp = a.leadsCount - b.leadsCount;
        if (cmp !== 0) return mult * cmp;
        break;
      }
      case "reports": {
        const cmp = a.reportsCount - b.reportsCount;
        if (cmp !== 0) return mult * cmp;
        break;
      }
      case "proposals": {
        const cmp = a.proposalsCount - b.proposalsCount;
        if (cmp !== 0) return mult * cmp;
        break;
      }
      case "created": {
        const at = rowTimestamp(a.createdAt);
        const bt = rowTimestamp(b.createdAt);
        if (at == null && bt == null) break;
        if (at == null) return 1;
        if (bt == null) return -1;
        const cmp = at - bt;
        if (cmp !== 0) return mult * cmp;
        break;
      }
      case "lastAccess": {
        const at = rowTimestamp(a.lastSignInAt);
        const bt = rowTimestamp(b.lastSignInAt);
        if (at == null && bt == null) break;
        if (at == null) return 1;
        if (bt == null) return -1;
        const cmp = at - bt;
        if (cmp !== 0) return mult * cmp;
        break;
      }
    }
    return a.uid.localeCompare(b.uid);
  });
  return copy;
}

export default function UsuariosAdminPage() {
  const router = useRouter();
  const { user, loading: authLoading, isGeneralAdmin } = useAuth();
  const [list, setList] = useState<AdminUsersListResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const pageTokensRef = useRef<(string | null)[]>([null]);
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [platformSeries, setPlatformSeries] = useState<PlatformSeriesResponse | null>(null);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [statsLoadError, setStatsLoadError] = useState<string | null>(null);
  const [seriesLoadError, setSeriesLoadError] = useState<string | null>(null);
  const chartsError = statsLoadError ?? seriesLoadError;
  const [periodYear, setPeriodYear] = useState<PlatformPeriodYear>(() => new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState<PlatformPeriodMonth>(() => new Date().getMonth() + 1);

  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<AdminUserPlanFilter>(PLAN_FILTER_ALL);
  const [sort, setSort] = useState<UsersSortState>({ key: null, dir: "asc" });
  const [copyFeedbackUid, setCopyFeedbackUid] = useState<string | null>(null);
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const usersTableRef = useRef<HTMLTableElement | null>(null);
  const [colWidthsPct, { onResizerMouseDown: onColResizeMouseDown }] = useAdminUsersTableColumnWidths(usersTableRef);

  const seriesQueryString =
    periodYear === "all" && periodMonth === "all"
      ? "year=all&month=all"
      : periodYear === "all"
        ? `year=all&month=${periodMonth}`
        : periodMonth === "all"
          ? `year=${periodYear}&month=all`
          : `year=${periodYear}&month=${periodMonth}`;

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current) clearTimeout(copyFeedbackTimeoutRef.current);
    };
  }, []);

  const onCopyUserEmail = useCallback((e: MouseEvent<HTMLButtonElement>, uid: string, email: string) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(email).then(() => {
      if (copyFeedbackTimeoutRef.current) clearTimeout(copyFeedbackTimeoutRef.current);
      setCopyFeedbackUid(uid);
      copyFeedbackTimeoutRef.current = setTimeout(() => {
        setCopyFeedbackUid(null);
        copyFeedbackTimeoutRef.current = null;
      }, 2000);
    });
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!isGeneralAdmin) {
      router.replace("/dashboard");
    }
  }, [authLoading, user, isGeneralAdmin, router]);

  const loadPage = useCallback(
    async (index: number) => {
      if (!user) return;
      setLoading(true);
      setFetchError(null);
      setList(null);
      try {
        const pageToken = pageTokensRef.current[index] ?? null;
        const qs =
          pageToken != null && pageToken !== ""
            ? `?pageToken=${encodeURIComponent(pageToken)}`
            : "";
        const idToken = await user.getIdToken();
        const res = await fetch(`/api/admin-users${qs}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const body = (await res.json().catch(() => ({}))) as AdminUsersListResponse & { error?: string };
        if (!res.ok) {
          setList(null);
          setFetchError(typeof body.error === "string" ? body.error : "Não foi possível carregar a lista.");
          return;
        }
        setList({ users: body.users ?? [], nextPageToken: body.nextPageToken ?? null });
        if (body.nextPageToken) {
          const chain = [...pageTokensRef.current];
          chain[index + 1] = body.nextPageToken;
          pageTokensRef.current = chain;
        }
      } catch {
        setList(null);
        setFetchError("Erro de rede ao carregar utilizadores.");
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (authLoading || !user || !isGeneralAdmin) return;
    void loadPage(pageIndex);
  }, [authLoading, user, isGeneralAdmin, pageIndex, loadPage]);

  useEffect(() => {
    if (authLoading || !user || !isGeneralAdmin) return;
    let cancelled = false;
    void (async () => {
      try {
        const idToken = await user.getIdToken();
        const resStats = await fetch("/api/admin-platform-stats", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const bodyStats = (await resStats.json().catch(() => ({}))) as PlatformStats & { error?: string };

        if (!resStats.ok) {
          if (!cancelled) {
            setPlatformStats(null);
            setStatsLoadError(
              typeof bodyStats.error === "string" ? bodyStats.error : "Não foi possível carregar as estatísticas.",
            );
          }
          return;
        }

        if (!cancelled) {
          setStatsLoadError(null);
          setPlatformStats({
            reportsCount: typeof bodyStats.reportsCount === "number" ? bodyStats.reportsCount : 0,
            proposalsCount: typeof bodyStats.proposalsCount === "number" ? bodyStats.proposalsCount : 0,
            leadsCount: typeof bodyStats.leadsCount === "number" ? bodyStats.leadsCount : 0,
          });
        }
      } catch {
        if (!cancelled) {
          setPlatformStats(null);
          setStatsLoadError("Erro de rede ao carregar estatísticas.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, isGeneralAdmin]);

  useEffect(() => {
    if (authLoading || !user || !isGeneralAdmin) return;
    let cancelled = false;
    void (async () => {
      setChartsLoading(true);
      try {
        const idToken = await user.getIdToken();
        const resSeries = await fetch(`/api/admin-platform-series?${seriesQueryString}`, {
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
  }, [authLoading, user, isGeneralAdmin, seriesQueryString]);

  const pageUsers = list?.users ?? [];

  const filteredUsers = useMemo(
    () => filterAdminUsers(pageUsers, { q: search, planFilter }),
    [pageUsers, search, planFilter],
  );

  const sortedUsers = useMemo(() => sortAdminUsers(filteredUsers, sort), [filteredUsers, sort]);

  const hasActiveFilters = useMemo(() => {
    return normalizeSearchText(search) !== "" || planFilter !== PLAN_FILTER_ALL;
  }, [search, planFilter]);

  const toggleColumnSort = useCallback((key: UsersSortKey) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setSearch("");
    setPlanFilter(PLAN_FILTER_ALL);
    setSort({ key: null, dir: "asc" });
  }, []);

  const resetCreateUserForm = useCallback(() => {
    setCreateEmail("");
    setCreatePassword("");
    setCreateDisplayName("");
    setCreateError(null);
  }, []);

  const onCreateUserOpenChange = useCallback(
    (open: boolean) => {
      setCreateUserOpen(open);
      if (!open) resetCreateUserForm();
    },
    [resetCreateUserForm],
  );

  const submitCreateUser = useCallback(async () => {
    if (!user) return;
    setCreateError(null);
    const email = createEmail.trim();
    if (!email) {
      setCreateError("Indique o e-mail.");
      return;
    }
    if (createPassword.length < 6) {
      setCreateError("A palavra-passe deve ter pelo menos 6 caracteres.");
      return;
    }
    setCreateBusy(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin-users", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password: createPassword,
          displayName: createDisplayName.trim() || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setCreateError(typeof body.error === "string" ? body.error : "Não foi possível criar o utilizador.");
        return;
      }
      setCreateUserOpen(false);
      resetCreateUserForm();
      pageTokensRef.current = [null];
      const previousPage = pageIndex;
      setPageIndex(0);
      if (previousPage === 0) {
        await loadPage(0);
      }
    } catch {
      setCreateError("Erro de rede. Tente novamente.");
    } finally {
      setCreateBusy(false);
    }
  }, [
    user,
    createEmail,
    createPassword,
    createDisplayName,
    pageIndex,
    loadPage,
    resetCreateUserForm,
  ]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <span>A carregar…</span>
      </div>
    );
  }

  if (!isGeneralAdmin) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground dark:text-zinc-100">
              Usuários
            </h1>
            <p className="text-sm text-muted-foreground dark:text-zinc-400 [scrollbar-width:thin] lg:max-w-xl">
              Utilizadores e métricas da plataforma.
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
        <AdminGrowthCharts queryString={seriesQueryString} />
        <PlatformVolumeCharts
          stats={platformStats}
          series={platformSeries}
          loading={chartsLoading && (platformStats == null || platformSeries == null)}
          refreshing={chartsLoading && platformSeries != null && platformStats != null}
          error={chartsError}
        />
      </div>

      <Card className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl dark:border-white/5 dark:bg-white/[0.02]">
        <div className="border-b border-border px-4 py-4 dark:border-white/5 sm:px-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center sm:gap-3">
                <div className="relative min-w-0 flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="admin-users-table-search"
                    name="admin_users_table_search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por e-mail, agência ou nome…"
                    className="h-10 w-full rounded-md border-input bg-background pl-9 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-brand/50 focus-visible:ring-brand/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                    aria-label="Buscar por e-mail, agência ou nome"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-1p-ignore
                    data-lpignore="true"
                  />
                  {search.trim() ? (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Limpar busca"
                      title="Limpar busca"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  ) : null}
                </div>
                <Select
                  value={planFilter}
                  onValueChange={(val) => {
                    if (val === PLAN_FILTER_ALL || val === PLAN_FILTER_PRO) setPlanFilter(val);
                  }}
                >
                  <SelectTrigger
                    className="h-10 w-full font-medium sm:w-[14rem] sm:shrink-0"
                    aria-label="Filtrar por plano"
                  >
                    <SelectValue placeholder="Plano">
                      {planFilter === PLAN_FILTER_ALL ? "Todos os planos" : "Pro"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectItem value={PLAN_FILTER_ALL}>Todos os planos</SelectItem>
                    <SelectItem value={PLAN_FILTER_PRO}>Pro</SelectItem>
                  </SelectContent>
                </Select>
                {isGeneralAdmin ? (
                  <Button
                    type="button"
                    variant="default"
                    className="h-10 w-full shrink-0 gap-2 sm:w-auto"
                    onClick={() => setCreateUserOpen(true)}
                  >
                    <UserPlus className="size-4 shrink-0" aria-hidden />
                    Criar utilizador
                  </Button>
                ) : null}
                {hasActiveFilters || sort.key != null ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10 shrink-0 text-xs sm:self-auto"
                    onClick={clearFilters}
                  >
                    Limpar
                  </Button>
                ) : null}
              </div>
            </div>

            {pageUsers.length > 0 ? (
              <p className="text-[10px] leading-tight text-muted-foreground/80 sm:text-[11px]">
                {hasActiveFilters ? (
                  <>
                    <span className="font-medium text-foreground/75">
                      {filteredUsers.length} de {pageUsers.length}
                    </span>{" "}
                    {pageUsers.length === 1 ? "utilizador nesta página" : "utilizadores nesta página"}
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground/75">{pageUsers.length}</span>{" "}
                    {pageUsers.length === 1 ? "utilizador nesta página" : "utilizadores nesta página"}
                  </>
                )}
              </p>
            ) : null}
          </div>
        </div>

        {fetchError ? (
          <p className="border-b border-border px-4 py-3 text-sm text-destructive dark:border-white/5 sm:px-6">
            {fetchError}
          </p>
        ) : null}

        {loading && !pageUsers.length ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            <span>A carregar utilizadores…</span>
          </div>
        ) : pageUsers.length ? (
          <Table ref={usersTableRef} className="table-fixed">
            <colgroup>
              {colWidthsPct.map((pct, i) => (
                <col key={i} style={{ width: `${pct}%` }} />
              ))}
            </colgroup>
            <TableHeader>
              <TableRow className="border-border bg-muted/40 hover:bg-transparent dark:border-white/5 dark:bg-white/[0.03]">
                <TableHead className="relative h-auto py-3 pl-6 pr-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  E-mail
                  <AdminUsersColumnResizeHandle leftColumnIndex={0} onResizerMouseDown={onColResizeMouseDown} />
                </TableHead>
                <TableHead className="relative h-auto px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Agência
                  <AdminUsersColumnResizeHandle leftColumnIndex={1} onResizerMouseDown={onColResizeMouseDown} />
                </TableHead>
                <TableHead className="relative h-auto px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Plano
                  <AdminUsersColumnResizeHandle leftColumnIndex={2} onResizerMouseDown={onColResizeMouseDown} />
                </TableHead>
                <TableHead
                  className="relative h-auto px-3 py-3 text-right align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                  aria-sort={
                    sort.key === "leads"
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className="inline-flex w-full min-w-0 items-center justify-end gap-1 rounded-md py-0.5 pr-5 text-[10px] font-bold uppercase tracking-widest outline-none ring-offset-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    onClick={() => toggleColumnSort("leads")}
                    title="Total de leads no Firestore (todos os períodos)"
                    aria-label={
                      sort.key === "leads"
                        ? sort.dir === "asc"
                          ? "Leads ordenados do menor para o maior; clicar para inverter"
                          : "Leads ordenados do maior para o menor; clicar para inverter"
                        : "Ordenar por total de leads (Firestore, todos os períodos)"
                    }
                  >
                    Leads
                    <SortHeaderGlyph active={sort.key === "leads"} dir={sort.dir} />
                  </button>
                  <AdminUsersColumnResizeHandle leftColumnIndex={3} onResizerMouseDown={onColResizeMouseDown} />
                </TableHead>
                <TableHead
                  className="relative h-auto px-3 py-3 text-right align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                  aria-sort={
                    sort.key === "reports"
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className="inline-flex w-full min-w-0 items-center justify-end gap-1 rounded-md py-0.5 pr-5 text-[10px] font-bold uppercase tracking-widest outline-none ring-offset-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    onClick={() => toggleColumnSort("reports")}
                    title="Total de rotas no Firestore (todos os períodos)"
                    aria-label={
                      sort.key === "reports"
                        ? sort.dir === "asc"
                          ? "Rotas ordenadas do menor para o maior; clicar para inverter"
                          : "Rotas ordenadas do maior para o menor; clicar para inverter"
                        : "Ordenar por total de rotas (Firestore, todos os períodos)"
                    }
                  >
                    Rotas
                    <SortHeaderGlyph active={sort.key === "reports"} dir={sort.dir} />
                  </button>
                  <AdminUsersColumnResizeHandle leftColumnIndex={4} onResizerMouseDown={onColResizeMouseDown} />
                </TableHead>
                <TableHead
                  className="relative h-auto px-3 py-3 text-right align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                  aria-sort={
                    sort.key === "proposals"
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className="inline-flex w-full min-w-0 items-center justify-end gap-1 rounded-md py-0.5 pr-5 text-[10px] font-bold uppercase tracking-widest outline-none ring-offset-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    onClick={() => toggleColumnSort("proposals")}
                    title="Total de propostas no Firestore (todos os períodos)"
                    aria-label={
                      sort.key === "proposals"
                        ? sort.dir === "asc"
                          ? "Propostas ordenadas do menor para o maior; clicar para inverter"
                          : "Propostas ordenadas do maior para o menor; clicar para inverter"
                        : "Ordenar por total de propostas (Firestore, todos os períodos)"
                    }
                  >
                    Propostas
                    <SortHeaderGlyph active={sort.key === "proposals"} dir={sort.dir} />
                  </button>
                  <AdminUsersColumnResizeHandle leftColumnIndex={5} onResizerMouseDown={onColResizeMouseDown} />
                </TableHead>
                <TableHead
                  className="relative h-auto px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                  aria-sort={
                    sort.key === "created"
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className="inline-flex w-full min-w-0 items-center justify-start gap-1 rounded-md py-0.5 pr-5 text-left text-[10px] font-bold uppercase tracking-widest outline-none ring-offset-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    onClick={() => toggleColumnSort("created")}
                    aria-label={
                      sort.key === "created"
                        ? sort.dir === "asc"
                          ? "Data de criação mais antiga primeiro; clicar para inverter"
                          : "Data de criação mais recente primeiro; clicar para inverter"
                        : "Ordenar por data de criação"
                    }
                  >
                    Criado
                    <SortHeaderGlyph active={sort.key === "created"} dir={sort.dir} />
                  </button>
                  <AdminUsersColumnResizeHandle leftColumnIndex={6} onResizerMouseDown={onColResizeMouseDown} />
                </TableHead>
                <TableHead
                  className="relative h-auto px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                  aria-sort={
                    sort.key === "lastAccess"
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className="inline-flex w-full min-w-0 items-center justify-start gap-1 rounded-md py-0.5 pr-5 text-left text-[10px] font-bold uppercase tracking-widest outline-none ring-offset-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    onClick={() => toggleColumnSort("lastAccess")}
                    aria-label={
                      sort.key === "lastAccess"
                        ? sort.dir === "asc"
                          ? "Último acesso mais antigo primeiro; clicar para inverter"
                          : "Último acesso mais recente primeiro; clicar para inverter"
                        : "Ordenar por último acesso"
                    }
                  >
                    Último acesso
                    <SortHeaderGlyph active={sort.key === "lastAccess"} dir={sort.dir} />
                  </button>
                  <AdminUsersColumnResizeHandle leftColumnIndex={7} onResizerMouseDown={onColResizeMouseDown} />
                </TableHead>
                <TableHead className="relative h-auto min-w-[3rem] py-3 pl-3 pr-6 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow className="border-b-0 hover:bg-transparent">
                  <TableCell colSpan={9} className="py-16 text-center">
                    <p className="font-medium text-muted-foreground">
                      Nenhum utilizador corresponde aos filtros nesta página.
                    </p>
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="mt-3 text-sm font-semibold text-brand hover:text-brand/90 dark:text-brand dark:hover:text-brand"
                    >
                      Limpar filtros
                    </button>
                  </TableCell>
                </TableRow>
              ) : (
                sortedUsers.map((row) => (
                  <TableRow
                    key={row.uid}
                    className="cursor-pointer border-border transition-colors hover:bg-muted/50 dark:border-white/5 dark:hover:bg-white/[0.06]"
                    onClick={() => router.push(`/dashboard/usuarios/${encodeURIComponent(row.uid)}`)}
                  >
                    <TableCell className="max-w-0 py-4 pl-6 pr-3 align-middle">
                      <div className="flex w-full min-w-0 flex-nowrap items-center gap-1">
                        {row.email ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className={cn(
                              "-ml-1 size-6 shrink-0 p-0 text-muted-foreground hover:text-foreground",
                              copyFeedbackUid === row.uid &&
                                "text-emerald-600 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400",
                            )}
                            aria-label={
                              copyFeedbackUid === row.uid
                                ? "E-mail copiado"
                                : `Copiar e-mail ${row.email}`
                            }
                            title={copyFeedbackUid === row.uid ? "Copiado" : "Copiar e-mail"}
                            onClick={(e) => onCopyUserEmail(e, row.uid, row.email!)}
                          >
                            {copyFeedbackUid === row.uid ? (
                              <Check className="size-3.5" aria-hidden strokeWidth={2.5} />
                            ) : (
                              <Copy className="size-3.5" aria-hidden />
                            )}
                          </Button>
                        ) : null}
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-xs leading-snug sm:text-sm",
                            row.email ? "" : "whitespace-normal break-all",
                          )}
                          title={row.email ?? undefined}
                        >
                          {row.email ?? "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-0 whitespace-normal px-3 py-4 align-middle text-xs sm:text-sm">
                      <span
                        className="line-clamp-2"
                        title={
                          [row.companyName?.trim(), row.displayName?.trim()].filter(Boolean).join(" · ") || undefined
                        }
                      >
                        {row.companyName?.trim() || row.displayName?.trim() || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-4 align-middle">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-semibold",
                          "border-sidebar-primary/45 bg-sidebar-primary/12 text-sidebar-primary",
                          "dark:border-sidebar-primary/50 dark:bg-sidebar-primary/15 dark:text-sidebar-primary",
                        )}
                      >
                        {row.plan}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="px-3 py-4 text-right align-middle text-xs font-semibold tabular-nums sm:text-sm"
                      style={{ color: PLATFORM_CHART_COLOR_LEADS }}
                    >
                      {formatCount(row.leadsCount)}
                    </TableCell>
                    <TableCell
                      className="px-3 py-4 text-right align-middle text-xs font-semibold tabular-nums sm:text-sm"
                      style={{ color: PLATFORM_CHART_COLOR_REPORTS }}
                    >
                      {formatCount(row.reportsCount)}
                    </TableCell>
                    <TableCell
                      className="px-3 py-4 text-right align-middle text-xs font-semibold tabular-nums sm:text-sm"
                      style={{ color: PLATFORM_CHART_COLOR_PROPOSALS }}
                    >
                      {formatCount(row.proposalsCount)}
                    </TableCell>
                    <TableCell className="px-3 py-4 align-middle text-xs text-muted-foreground">
                      {formatDatePt(row.createdAt)}
                    </TableCell>
                    <TableCell className="px-3 py-4 align-middle text-xs text-muted-foreground">
                      {formatDatePt(row.lastSignInAt)}
                    </TableCell>
                    <TableCell className="py-4 pl-3 pr-6 align-middle">
                      <Badge
                        variant={row.disabled ? "destructive" : "outline"}
                        className={cn(
                          "text-[10px] font-semibold",
                          !row.disabled &&
                            "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300",
                        )}
                      >
                        {row.disabled ? "Desativada" : "Ativa"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        ) : !loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum utilizador neste lote.</p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 dark:border-white/5 sm:px-6">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || pageIndex <= 0}
            onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || !list?.nextPageToken}
            onClick={() => setPageIndex((i) => i + 1)}
          >
            Seguinte
          </Button>
        </div>
      </Card>

      <Dialog open={createUserOpen} onOpenChange={onCreateUserOpenChange}>
        <DialogContent showCloseButton={!createBusy} className="sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle>Criar utilizador</DialogTitle>
            <DialogDescription>
              Conta nova no Firebase Auth. A palavra-passe deve ter pelo menos 6 caracteres. O utilizador poderá
              alterá-la após o primeiro acesso.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitCreateUser();
            }}
          >
            {createError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {createError}
              </p>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="admin-create-user-email">E-mail</Label>
              <Input
                id="admin-create-user-email"
                name="admin_create_user_email"
                type="email"
                autoComplete="off"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="nome@empresa.com"
                disabled={createBusy}
                className="h-10"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-create-user-name">Nome (opcional)</Label>
              <Input
                id="admin-create-user-name"
                name="admin_create_user_name"
                type="text"
                autoComplete="off"
                value={createDisplayName}
                onChange={(e) => setCreateDisplayName(e.target.value)}
                placeholder="Nome para exibição"
                disabled={createBusy}
                className="h-10"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-create-user-password">Palavra-passe</Label>
              <Input
                id="admin-create-user-password"
                name="admin_create_user_password"
                type="password"
                autoComplete="new-password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                disabled={createBusy}
                className="h-10"
              />
            </div>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={createBusy}
                onClick={() => onCreateUserOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createBusy} className="gap-2">
                {createBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
