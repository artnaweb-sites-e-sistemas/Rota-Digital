"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, FileText, Loader2, Search, Sparkles, Trash2 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { deleteProposal, getProposalsByUser } from "@/lib/proposals";
import type { Proposal } from "@/types/proposal";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 10;
const STATUS_FILTERS = ["todos", "validas", "expiradas"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function proposalStatus(proposal: Proposal): "validas" | "expiradas" {
  return proposal.validUntilDate < Date.now() ? "expiradas" : "validas";
}

function formatDate(value: number): string {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusTone(proposal: Proposal): string {
  return proposalStatus(proposal) === "expiradas"
    ? "border-red-500/25 bg-red-500/10 text-red-700 dark:border-red-500/25 dark:bg-red-500/15 dark:text-red-200"
    : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-100";
}

export default function PropostasPage() {
  const { user } = useAuth();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        setLoading(true);
        const data = await getProposalsByUser(user.uid);
        setProposals(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user]);

  const filteredProposals = useMemo(() => {
    const query = normalizeText(search);
    return proposals.filter((proposal) => {
      if (statusFilter !== "todos" && proposalStatus(proposal) !== statusFilter) return false;
      if (!query) return true;
      const haystack = normalizeText(
        [
          proposal.title,
          proposal.lead.company,
          proposal.lead.name,
          proposal.agencySnapshot.companyName,
          proposal.companyProfile.companyProfile,
        ].join(" "),
      );
      return haystack.includes(query);
    });
  }, [proposals, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredProposals.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, currentPage), pageCount);
  const paginatedProposals = filteredProposals.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(Math.max(1, prev), pageCount));
  }, [pageCount]);

  const handleDelete = async (proposal: Proposal) => {
    const ok = window.confirm(`Excluir a proposta de "${proposal.lead.company}"?`);
    if (!ok) return;
    setDeletingId(proposal.id);
    try {
      await deleteProposal(proposal.id);
      setProposals((prev) => prev.filter((item) => item.id !== proposal.id));
    } catch (e) {
      console.error(e);
      window.alert("Não foi possível excluir a proposta agora.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Propostas</h1>
          <p className="mt-1 text-muted-foreground">Páginas comerciais geradas para apresentar e fechar novos projetos.</p>
        </div>
        <LinkButton href="/dashboard/propostas/new" className="gap-2">
          <Sparkles className="size-4" />
          Gerar Proposta
        </LinkButton>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : proposals.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-xl dark:border-white/5 dark:bg-white/[0.02]">
          <FileText className="mx-auto mb-4 size-10 text-muted-foreground" aria-hidden />
          <p className="text-lg font-semibold text-foreground">Nenhuma proposta gerada ainda.</p>
          <p className="mt-2 text-sm text-muted-foreground">Crie a primeira proposta e compartilhe uma página profissional com o lead.</p>
          <LinkButton href="/dashboard/propostas/new" className="mt-6 gap-2">
            <Sparkles className="size-4" />
            Gerar Proposta
          </LinkButton>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por empresa, lead ou título da proposta…"
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((filter) => {
                const active = statusFilter === filter;
                const label =
                  filter === "todos"
                    ? "Todas"
                    : filter === "validas"
                      ? "Válidas"
                      : "Expiradas";
                return (
                  <Button
                    key={filter}
                    type="button"
                    variant={active ? "cta" : "outline"}
                    className="min-w-[6.5rem]"
                    onClick={() => setStatusFilter(filter)}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {filteredProposals.length === proposals.length
              ? `${proposals.length} proposta${proposals.length === 1 ? "" : "s"}`
              : `${filteredProposals.length} de ${proposals.length} propostas`}
          </p>

          {filteredProposals.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/35 px-4 py-10 text-center dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-sm text-muted-foreground">Nenhuma proposta corresponde aos filtros atuais.</p>
              <Button type="button" variant="outline" className="mt-4" onClick={() => { setSearch(""); setStatusFilter("todos"); }}>
                Limpar filtros
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {paginatedProposals.map((proposal) => (
                  <Card key={proposal.id} className="overflow-hidden border-border bg-card shadow-lg transition-colors hover:border-brand/25 dark:border-white/5 dark:bg-white/[0.02]">
                    <CardContent className="space-y-5 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-lg font-bold text-foreground">{proposal.lead.company}</p>
                          <p className="truncate text-sm text-muted-foreground">{proposal.lead.name}</p>
                        </div>
                        <Badge variant="outline" className={statusTone(proposal)}>
                          {proposalStatus(proposal) === "expiradas" ? "Expirada" : "Válida"}
                        </Badge>
                      </div>

                      <div className="space-y-3 rounded-2xl border border-border bg-background/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <FileText className="size-4 text-brand" aria-hidden />
                          {proposal.title}
                        </div>
                        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                          <div className="rounded-xl bg-muted/45 px-3 py-2 dark:bg-white/[0.04]">
                            {proposal.spotPlans.length} plano{proposal.spotPlans.length === 1 ? "" : "s"} pontual
                          </div>
                          <div className="rounded-xl bg-muted/45 px-3 py-2 dark:bg-white/[0.04]">
                            {proposal.recurringPlans.length} plano{proposal.recurringPlans.length === 1 ? "" : "s"} recorrente
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="size-4 text-brand" aria-hidden />
                          Válida até {formatDate(proposal.validUntilDate)}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <LinkButton
                          href={`/dashboard/propostas/${proposal.id}`}
                          variant="cta"
                          size="lg"
                          className="h-9 gap-2 rounded-xl px-3.5 text-sm"
                        >
                          Abrir proposta
                        </LinkButton>
                        {proposal.publicSlug ? (
                          <Button asChild variant="outline" size="lg" className="h-9 gap-2 rounded-xl px-3.5 text-sm">
                            <a href={`/p/${proposal.publicSlug}`} target="_blank" rel="noreferrer">
                              <ExternalLink className="size-4" aria-hidden />
                              Página pública
                            </a>
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          className="gap-2 text-red-600 hover:text-red-700 dark:text-red-300"
                          onClick={() => void handleDelete(proposal)}
                          disabled={deletingId === proposal.id}
                        >
                          {deletingId === proposal.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                          Excluir
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {pageCount > 1 ? (
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={safePage <= 1}>
                    <ChevronLeft className="size-4" aria-hidden />
                    Anterior
                  </Button>
                  <span className="min-w-[5rem] text-center text-sm text-muted-foreground">
                    {safePage} / {pageCount}
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={() => setCurrentPage((prev) => Math.min(pageCount, prev + 1))} disabled={safePage >= pageCount}>
                    Próxima
                    <ChevronRight className="size-4" aria-hidden />
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
