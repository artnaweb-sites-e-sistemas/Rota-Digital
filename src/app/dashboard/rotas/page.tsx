"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getReportsByUser, deleteReportAndCleanup } from "@/lib/reports";
import { RotaDigitalReport } from "@/types/report";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ExternalLink, Sparkles, Calendar, Trash2, Search } from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/link-button";
import { Button } from "@/components/ui/button";
import { ReportSiteAvatar } from "@/components/report-site-avatar";

const MATURITY_LEVELS = ["Iniciante", "Intermediário", "Avançado"] as const;
type DigitalMaturityLevel = (typeof MATURITY_LEVELS)[number];

const MATURITY_FILTER_TODOS = "todos" as const;
type MaturityFilter = typeof MATURITY_FILTER_TODOS | DigitalMaturityLevel;

function maturityFilterLabel(v: MaturityFilter): string {
  return v === MATURITY_FILTER_TODOS ? "Todos os níveis" : v;
}

const MATURITY_COLORS: Record<string, string> = {
  Iniciante:
    "border-orange-600/35 bg-orange-500/15 text-orange-950 dark:bg-orange-500/20 dark:text-orange-200 dark:border-orange-500/30",
  Intermediário:
    "border-amber-600/35 bg-amber-500/12 text-amber-950 dark:bg-yellow-500/20 dark:text-yellow-200 dark:border-yellow-500/30",
  Avançado:
    "border-emerald-600/35 bg-emerald-500/12 text-emerald-950 dark:bg-green-500/20 dark:text-green-200 dark:border-green-500/30",
};

function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

/** Busca em empresa, nome do lead, e-mail, resumo e nota de maturidade (texto). */
function reportMatchesSearch(report: RotaDigitalReport, rawQuery: string): boolean {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  const terms = q.split(/\s+/).filter(Boolean);
  const scoreStr = String(report.digitalMaturityScore ?? "");
  const levelNorm = normalizeSearchText(report.digitalMaturityLevel || "");
  const fieldTexts = [
    report.leadCompany,
    report.leadName,
    report.leadEmail,
    report.executiveSummary || "",
    scoreStr,
    report.digitalMaturityLevel || "",
  ].map(normalizeSearchText);
  const hayFlat = fieldTexts.join(" ");
  return terms.every((term) => {
    if (hayFlat.includes(term)) return true;
    if (levelNorm.includes(term)) return true;
    return fieldTexts.some((field) =>
      field.split(/[\s@._\-/+]+/).some((word) => word.length > 0 && word.startsWith(term)),
    );
  });
}

function normalizeMaturityLevel(
  raw: string | undefined
): DigitalMaturityLevel | null {
  if (!raw) return null;
  const n = normalizeSearchText(raw);
  for (const level of MATURITY_LEVELS) {
    if (normalizeSearchText(level) === n) return level;
  }
  return null;
}

export default function RotasPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<RotaDigitalReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [maturityFilter, setMaturityFilter] = useState<MaturityFilter>(MATURITY_FILTER_TODOS);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (maturityFilter !== MATURITY_FILTER_TODOS) {
        const level = normalizeMaturityLevel(r.digitalMaturityLevel);
        if (level !== maturityFilter) return false;
      }
      return reportMatchesSearch(r, search);
    });
  }, [reports, search, maturityFilter]);

  const handleDeleteReport = async (report: RotaDigitalReport) => {
    if (!user) return;
    const ok = window.confirm(
      `Excluir o relatório de "${report.leadCompany}"? O link público deixará de funcionar e os arquivos de evidência serão removidos.`
    );
    if (!ok) return;
    setDeletingId(report.id);
    try {
      await deleteReportAndCleanup({
        reportId: report.id,
        leadId: report.leadId,
        userId: user.uid,
      });
      setReports((prev) => prev.filter((r) => r.id !== report.id));
    } catch (err) {
      console.error(err);
      window.alert("Não foi possível excluir o relatório. Verifique sua conexão e as permissões do Firebase.");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    const fetchReports = async () => {
      if (!user) return;
      try {
        setLoading(true);
        const data = await getReportsByUser(user.uid);
        setReports(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, [user]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Rotas Digitais</h1>
          <p className="text-muted-foreground mt-1">Relatórios gerados por IA para seus leads</p>
        </div>
        <LinkButton href="/dashboard/rotas/new" className="gap-2">
          <Sparkles size={16} />
          Gerar Rota
        </LinkButton>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="animate-spin text-muted-foreground" size={24} />
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <Sparkles className="mx-auto mb-4 text-muted-foreground" size={32} />
          <p className="text-lg font-medium text-foreground">Nenhum relatório gerado ainda</p>
          <p className="mx-auto mt-1 mb-6 max-w-md text-sm text-muted-foreground">
            Clique em <strong className="text-foreground">Gerar Rota</strong>, selecione um lead e preencha
            site, instagram, serviços e objetivo para a IA gerar o relatório.
          </p>
          <LinkButton href="/dashboard/rotas/new" className="gap-2">
            <Sparkles size={16} />
            Gerar Rota
          </LinkButton>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por empresa, lead, e-mail ou trecho do resumo…"
                className="h-10 border-input bg-background pl-9 text-foreground placeholder:text-muted-foreground dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-100 dark:placeholder:text-zinc-600"
              />
            </div>
            <Select
              value={maturityFilter}
              onValueChange={(v) => setMaturityFilter(v as MaturityFilter)}
            >
              <SelectTrigger className="h-10 w-full border-input bg-background text-foreground sm:w-[13.75rem] dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-100">
                <SelectValue>{maturityFilterLabel(maturityFilter)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MATURITY_FILTER_TODOS}>{maturityFilterLabel(MATURITY_FILTER_TODOS)}</SelectItem>
                {MATURITY_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {filteredReports.length === reports.length
              ? `${reports.length} rota${reports.length === 1 ? "" : "s"}`
              : `${filteredReports.length} de ${reports.length} rotas`}
          </p>

          {filteredReports.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-sm text-muted-foreground">
                Nenhuma rota corresponde à busca ou ao nível selecionado.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                onClick={() => {
                  setSearch("");
                  setMaturityFilter(MATURITY_FILTER_TODOS);
                }}
              >
                Limpar filtros
              </Button>
            </div>
          ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredReports.map((report) => (
            <Card
              key={report.id}
              className="border-border bg-card transition-colors hover:border-primary/20 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            >
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <ReportSiteAvatar
                      report={report}
                      size="sm"
                      className="border border-border bg-muted text-muted-foreground dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-500"
                    />
                    <h3 className="truncate font-semibold text-foreground">{report.leadCompany}</h3>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge
                      className={`text-xs ${
                        MATURITY_COLORS[normalizeMaturityLevel(report.digitalMaturityLevel) || "Iniciante"]
                      }`}
                    >
                      {normalizeMaturityLevel(report.digitalMaturityLevel) || report.digitalMaturityLevel || "—"}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={deletingId === report.id}
                      aria-label="Excluir relatório"
                      onClick={() => handleDeleteReport(report)}
                    >
                      {deletingId === report.id ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>Score de Maturidade</span>
                    <span className="font-medium text-foreground">{report.digitalMaturityScore}/10</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden dark:bg-zinc-800">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${report.digitalMaturityScore * 10}%` }}
                    />
                  </div>
                </div>

                <p className="line-clamp-2 text-sm text-muted-foreground">{report.executiveSummary}</p>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar size={12} />
                    {new Date(report.createdAt).toLocaleDateString("pt-BR")}
                  </div>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/dashboard/rotas/${report.id}`}
                      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-500/10 hover:text-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-300"
                    >
                      <ExternalLink size={13} />
                      Visualizar
                    </Link>
                    {report.publicSlug ? (
                      <Link
                        href={`/r/${report.publicSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        Compartilhar
                      </Link>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
          )}
        </>
      )}
    </div>
  );
}
