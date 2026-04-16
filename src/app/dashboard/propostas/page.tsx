"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, FileText, Loader2, ScrollText, Search, Trash2 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { deleteProposal, getProposalsByUser } from "@/lib/proposals";
import type { Proposal } from "@/types/proposal";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { Badge } from "@/components/ui/badge";
import {
  type ProposalExpiryFloatingTone,
  proposalExpiryFloatingBadgeClassName,
} from "@/lib/proposal-floating-badges";

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

/** Dias corridos até a data de validade (meia-noite local), alinhado ao restante da app. */
function calendarDaysUntilValid(validUntilMs: number): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(validUntilMs);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
}

function proposalExpiryCountdownTag(proposal: Proposal): { label: string; tone: ProposalExpiryFloatingTone } {
  if (!proposal.validUntilDate) {
    return { label: "Prazo indefinido", tone: "indefinite" };
  }
  if (proposalStatus(proposal) === "expiradas") {
    return { label: "Expirada", tone: "expired" };
  }
  const d = calendarDaysUntilValid(proposal.validUntilDate);
  if (d < 0) {
    return { label: "Expirada", tone: "expired" };
  }
  const inner = d === 0 ? "hoje" : d === 1 ? "1 dia" : `${d} dias`;
  const label = `Vence em: ${inner}`;
  if (d > 3) return { label, tone: "green" };
  if (d === 3) return { label, tone: "yellow" };
  return { label, tone: "red" };
}

export default function PropostasPage() {
  const { user } = useAuth();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Proposal | null>(null);

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
    const list = proposals.filter((proposal) => {
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

    const byValidUntilAsc = (a: Proposal, b: Proposal) => a.validUntilDate - b.validUntilDate;
    const byValidUntilDesc = (a: Proposal, b: Proposal) => b.validUntilDate - a.validUntilDate;

    if (statusFilter === "todos") {
      const validas = list.filter((p) => proposalStatus(p) === "validas").sort(byValidUntilAsc);
      const expiradas = list.filter((p) => proposalStatus(p) === "expiradas").sort(byValidUntilDesc);
      return [...validas, ...expiradas];
    }
    if (statusFilter === "validas") {
      return [...list].sort(byValidUntilAsc);
    }
    return [...list].sort(byValidUntilDesc);
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

  const confirmDeleteProposal = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      await deleteProposal(deleteTarget.id);
      setProposals((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      console.error(e);
      window.alert("Não foi possível excluir a proposta agora.");
    } finally {
      setDeletingId(null);
    }
  };

  const deleteBusy = deletingId !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Propostas</h1>
          <p className="mt-1 text-muted-foreground">Páginas comerciais geradas para apresentar e fechar novos projetos.</p>
        </div>
        <LinkButton href="/dashboard/propostas/new" className="gap-2">
          <ScrollText className="size-4" aria-hidden />
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
            <ScrollText className="size-4" aria-hidden />
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
                {paginatedProposals.map((proposal) => {
                  const expiryTag = proposalExpiryCountdownTag(proposal);
                  return (
                  <div key={proposal.id} className="relative pt-1">
                    <Badge variant="outline" className={proposalExpiryFloatingBadgeClassName(expiryTag.tone)}>
                      {expiryTag.label}
                    </Badge>
                    <Card className="relative z-10 overflow-hidden border-border bg-card shadow-lg transition-colors hover:border-brand/25 dark:border-white/5 dark:bg-[color-mix(in_oklch,white_2%,var(--background))]">
                    <CardContent className="space-y-5 p-5">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-bold text-foreground">{proposal.lead.company}</p>
                        <p className="truncate text-sm text-muted-foreground">{proposal.lead.name}</p>
                      </div>

                      <div className="rounded-md border border-border px-3 py-3 dark:border-white/10">
                        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                          <div className="rounded-md px-0 py-1 sm:px-1">
                            <span className="font-semibold tabular-nums text-brand">{proposal.spotPlans.length}</span>{" "}
                            plano{proposal.spotPlans.length === 1 ? "" : "s"} pontual
                          </div>
                          <div className="rounded-md px-0 py-1 sm:px-1">
                            <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                              {proposal.recurringPlans.length}
                            </span>{" "}
                            plano{proposal.recurringPlans.length === 1 ? "" : "s"} recorrente
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CalendarDays className="size-4 shrink-0 text-brand" aria-hidden />
                        <span className="min-w-0 truncate">Válida até {formatDate(proposal.validUntilDate)}</span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-2">
                          <LinkButton
                            href={`/dashboard/propostas/${proposal.id}`}
                            variant="cta"
                            size="lg"
                            className="h-9 gap-2 rounded-md px-3.5 text-sm"
                          >
                            Abrir proposta
                          </LinkButton>
                          {proposal.publicSlug ? (
                            <LinkButton
                              href={`/p/${proposal.publicSlug}`}
                              variant="ghost"
                              size="lg"
                              className="h-9 gap-2 rounded-md border-0 bg-transparent px-3.5 text-sm font-medium text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink className="size-4 shrink-0 opacity-80" aria-hidden />
                              Página pública
                            </LinkButton>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          className="shrink-0 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-300 dark:hover:bg-red-500/15 dark:hover:text-red-200"
                          onClick={() => setDeleteTarget(proposal)}
                          disabled={deleteBusy}
                          aria-label="Excluir proposta"
                        >
                          {deletingId === proposal.id ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="size-4" aria-hidden />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  </div>
                  );
                })}
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

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteTarget(null);
        }}
      >
        <DialogContent showCloseButton={!deleteBusy} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir proposta?</DialogTitle>
            <DialogDescription>
              {deleteTarget ? (
                <>
                  A proposta ligada a <span className="font-medium text-foreground">“{deleteTarget.lead.company}”</span>{" "}
                  será removida de forma permanente. O link público deixará de funcionar.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDeleteProposal()}
              disabled={deleteBusy}
              className="gap-2"
            >
              {deleteBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
