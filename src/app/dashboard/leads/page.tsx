"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Lead, LEAD_STATUSES, type LeadStatus } from "@/types/lead";
import { getLeads, createLead, updateLead, deleteLead } from "@/lib/leads";
import { deleteReportsByLead } from "@/lib/reports";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Kanban,
  Loader2,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
// import { toast } from "sonner"; // If not available, we can use a simple alert or just implement without it

const PAGE_SIZE = 10;

const STATUS_DOT: Record<LeadStatus, string> = {
  "Em Contato": "bg-zinc-500 dark:bg-zinc-400",
  Convertido: "bg-emerald-600 dark:bg-emerald-400",
  Perdido: "bg-red-600 dark:bg-red-400",
};

/** Fundo + texto legíveis no claro e no escuro */
const STATUS_BADGE_SURFACE: Record<LeadStatus, string> = {
  "Em Contato":
    "bg-muted/90 text-muted-foreground ring-1 ring-border dark:bg-zinc-800/90 dark:text-zinc-300 dark:ring-zinc-600/40",
  Convertido:
    "bg-emerald-500/12 text-emerald-950 ring-1 ring-emerald-600/28 dark:bg-emerald-500/18 dark:text-emerald-100 dark:ring-emerald-400/30",
  Perdido: "bg-red-500/12 text-red-950 ring-1 ring-red-600/28 dark:bg-red-500/18 dark:text-red-100 dark:ring-red-400/30",
};

const ALL_STATUSES: LeadStatus[] = [...LEAD_STATUSES];

/** Valor interno em português (evita exibir “all” no gatilho do select). */
const STATUS_FILTER_TODOS = "todos" as const;

type StatusFilter = typeof STATUS_FILTER_TODOS | LeadStatus;

function statusFilterLabel(v: StatusFilter): string {
  return v === STATUS_FILTER_TODOS ? "Todos os status" : v;
}

function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function formatPhoneBr(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** Busca instantânea: qualquer termo deve aparecer em nome, empresa, e-mail ou telefone (trecho ou início de palavra). */
/** `?status=` na URL (ex.: vindo do dashboard). */
function statusFromQueryParam(raw: string | null): LeadStatus | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return ALL_STATUSES.includes(decoded as LeadStatus) ? (decoded as LeadStatus) : null;
}

function leadMatchesSearch(lead: Lead, rawQuery: string): boolean {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  const terms = q.split(/\s+/).filter(Boolean);
  const fieldTexts = [lead.name, lead.company, lead.email, lead.phone || ""].map(normalizeSearchText);
  const hayFlat = fieldTexts.join(" ");
  return terms.every((term) => {
    if (hayFlat.includes(term)) return true;
    return fieldTexts.some((field) =>
      field.split(/[\s@._\-/+]+/).some((word) => word.length > 0 && word.startsWith(term)),
    );
  });
}

function LeadsPageContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(STATUS_FILTER_TODOS);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<LeadStatus>("Em Contato");

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const data = await getLeads(user.uid);
      setLeads(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const statusQuery = searchParams.get("status");
  useEffect(() => {
    const parsed = statusFromQueryParam(statusQuery);
    if (parsed) setStatusFilter(parsed);
  }, [statusQuery]);

  const filteredLeads = useMemo(
    () =>
      leads.filter((lead) => {
        if (!leadMatchesSearch(lead, search)) return false;
        if (statusFilter !== STATUS_FILTER_TODOS && lead.status !== statusFilter) return false;
        return true;
      }),
    [leads, search, statusFilter],
  );

  const pageCount = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, currentPage), pageCount);
  const pageSliceStart = (safePage - 1) * PAGE_SIZE;
  const paginatedLeads = filteredLeads.slice(pageSliceStart, pageSliceStart + PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    setCurrentPage((p) => Math.min(Math.max(1, p), pageCount));
  }, [pageCount]);

  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== STATUS_FILTER_TODOS;

  const openForm = (lead?: Lead) => {
    if (lead) {
      setEditingLead(lead);
      setName(lead.name);
      setEmail(lead.email);
      setPhone(formatPhoneBr(lead.phone));
      setCompany(lead.company);
      setStatus(lead.status);
    } else {
      setEditingLead(null);
      setName("");
      setEmail("");
      setPhone("");
      setCompany("");
      setStatus("Em Contato");
    }
    setSaveError(null);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim() || !company.trim()) {
      setSaveError("Nome e Empresa são obrigatórios.");
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const payload = {
        name,
        email,
        phone,
        company,
        status,
      };
      if (editingLead) {
        await updateLead(editingLead.id, payload);
      } else {
        await createLead({
          userId: user.uid,
          ...payload,
        });
      }
      setIsDialogOpen(false);
      fetchLeads();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido ao salvar.";
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    if (!confirm("Excluir este lead e também a rota vinculada? Esta ação não pode ser desfeita.")) return;
    try {
      await deleteReportsByLead({ leadId: id, userId: user.uid });
      await deleteLead(id);
      fetchLeads();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Leads</h1>
          <p className="mt-1 text-muted-foreground">Gerencie seus contatos e oportunidades de negócio.</p>
        </div>
        <Button onClick={() => openForm()} className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-6 shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] gap-2">
          <Plus size={20} /> Novo Lead
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          showCloseButton
          className={cn(
            "max-h-[min(92vh,820px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-y-auto overflow-x-hidden border-white/10 bg-zinc-950 p-0 text-zinc-100 shadow-2xl sm:max-w-xl md:max-w-[36rem]",
            "rounded-2xl ring-1 ring-white/10",
          )}
        >
          <div className="relative border-b border-white/5 px-6 pb-6 pt-7 pr-14 sm:px-8 sm:pb-7 sm:pt-8 sm:pr-16">
            <div className="flex gap-4 sm:gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/12 ring-1 ring-indigo-500/25 sm:h-14 sm:w-14">
                <UserRound className="size-6 text-indigo-400 sm:size-7" aria-hidden />
              </div>
              <DialogHeader className="flex-1 text-left">
                <DialogTitle className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                  {editingLead ? "Editar lead" : "Novo lead"}
                </DialogTitle>
              </DialogHeader>
            </div>
          </div>

          <div className="space-y-7 px-6 py-7 sm:px-8 sm:py-8">
            <section className="space-y-4">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
                <div className="space-y-2.5">
                  <Label htmlFor="lead-name" className="text-sm font-medium text-zinc-300">
                    Nome completo <span className="text-red-400/90">*</span>
                  </Label>
                  <Input
                    id="lead-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-12 rounded-xl border-white/10 bg-white/[0.04] text-base text-zinc-100 placeholder:text-zinc-600 focus-visible:border-indigo-500/50 focus-visible:ring-indigo-500/20"
                    placeholder="Ex.: João Silva"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2.5">
                  <Label htmlFor="lead-company" className="text-sm font-medium text-zinc-300">
                    Empresa <span className="text-red-400/90">*</span>
                  </Label>
                  <Input
                    id="lead-company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="h-12 rounded-xl border-white/10 bg-white/[0.04] text-base text-zinc-100 placeholder:text-zinc-600 focus-visible:border-indigo-500/50 focus-visible:ring-indigo-500/20"
                    placeholder="Ex.: Tech Solutions"
                    autoComplete="organization"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
                <div className="space-y-2.5">
                  <Label htmlFor="lead-email" className="text-sm font-medium text-zinc-300">
                    E-mail
                  </Label>
                  <Input
                    id="lead-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 rounded-xl border-white/10 bg-white/[0.04] text-base text-zinc-100 placeholder:text-zinc-600 focus-visible:border-indigo-500/50 focus-visible:ring-indigo-500/20"
                    placeholder="nome@empresa.com"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2.5">
                  <Label htmlFor="lead-phone" className="text-sm font-medium text-zinc-300">
                    Telefone / WhatsApp
                  </Label>
                  <div className="relative">
                    <Phone
                      className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-600"
                      aria-hidden
                    />
                    <Input
                      id="lead-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(formatPhoneBr(e.target.value))}
                      className="h-12 rounded-xl border-white/10 bg-white/[0.04] pl-10 text-base text-zinc-100 placeholder:text-zinc-600 focus-visible:border-indigo-500/50 focus-visible:ring-indigo-500/20"
                      placeholder="(11) 99999-9999"
                      autoComplete="tel"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="space-y-2.5">
                <Label htmlFor="lead-status" className="text-sm font-medium text-zinc-300">
                  Status atual
                </Label>
                <Select
                  value={status}
                  onValueChange={(val) => {
                    if (val) setStatus(val as LeadStatus);
                  }}
                >
                  <SelectTrigger
                    id="lead-status"
                    className="h-12 w-full rounded-xl border-white/10 bg-white/[0.04] px-3 text-base text-zinc-100 shadow-none focus:ring-indigo-500/20 focus:border-indigo-500/50"
                  >
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-white/10 bg-zinc-900 text-zinc-100">
                    {ALL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="m-1 rounded-lg focus:bg-white/10">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            {saveError ? (
              <div
                role="alert"
                className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm font-medium leading-relaxed text-red-300"
              >
                {saveError}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-white/5 bg-white/[0.02] px-6 py-5 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-8 sm:py-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSaving}
              className="h-11 rounded-xl text-zinc-400 hover:bg-white/5 hover:text-zinc-200 sm:min-w-[7rem]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="h-11 rounded-xl bg-indigo-600 px-8 font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 sm:min-w-[10rem]"
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" aria-hidden /> : "Salvar lead"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl dark:border-white/5 dark:bg-white/[0.02]">
        <div className="border-b border-border px-4 py-4 dark:border-white/5 sm:px-6">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center sm:gap-3">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="leads-table-search"
                  name="leads_table_search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome, empresa, e-mail ou telefone…"
                  className="h-10 w-full rounded-xl border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-indigo-500/50 focus-visible:ring-indigo-500/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                  aria-label="Buscar leads"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(val) => {
                  if (val) setStatusFilter(val as StatusFilter);
                }}
              >
                <SelectTrigger
                  className="h-10 w-full rounded-xl border-input bg-background px-3 text-sm text-foreground shadow-none focus:border-indigo-500/50 focus:ring-indigo-500/20 data-placeholder:text-muted-foreground sm:w-[13.75rem] sm:shrink-0 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:data-placeholder:text-zinc-500"
                  aria-label="Filtrar por status do funil"
                >
                  <SelectValue placeholder="Todos os status">{statusFilterLabel(statusFilter)}</SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl border-white/10 bg-zinc-900 text-zinc-100">
                  <SelectItem value={STATUS_FILTER_TODOS} className="m-1 rounded-lg focus:bg-white/10">
                    Todos os status
                  </SelectItem>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="m-1 rounded-lg focus:bg-white/10">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {leads.length > 0 ? (
              <p className="text-[11px] leading-snug text-muted-foreground sm:text-xs">
                {hasActiveFilters ? (
                  <>
                    <span className="text-foreground/80">
                      {filteredLeads.length} de {leads.length}
                    </span>{" "}
                    {leads.length === 1 ? "lead encontrado" : "leads encontrados"}
                    {filteredLeads.length > 0 && pageCount > 1 ? (
                      <>
                        {" "}
                        · página {safePage} de {pageCount}
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="text-foreground/80">{leads.length}</span>{" "}
                    {leads.length === 1 ? "lead no total" : "leads no total"}
                    {filteredLeads.length > 0 && pageCount > 1 ? (
                      <>
                        {" "}
                        · página {safePage} de {pageCount}
                      </>
                    ) : null}
                  </>
                )}
              </p>
            ) : null}
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center items-center py-24">
            <Loader2 className="animate-spin text-muted-foreground" size={40} />
          </div>
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="border-border bg-muted/40 hover:bg-transparent dark:border-white/5 dark:bg-white/[0.03]">
                <TableHead className="h-auto w-[19%] py-3 pl-6 pr-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Nome
                </TableHead>
                <TableHead className="h-auto w-[19%] px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Empresa
                </TableHead>
                <TableHead className="h-auto w-[23%] px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  E-mail
                </TableHead>
                <TableHead className="h-auto w-[17%] px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Telefone
                </TableHead>
                <TableHead className="h-auto w-[14%] px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="h-auto w-[8%] min-w-[4rem] py-3 pl-3 pr-6 align-middle" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow className="border-b-0 hover:bg-transparent">
                  <TableCell colSpan={6} className="text-center py-24">
                    <div className="flex flex-col items-center gap-3">
                      <Users className="size-12 text-muted-foreground/50" />
                      <p className="font-medium text-muted-foreground">Nenhum lead encontrado.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredLeads.length === 0 ? (
                <TableRow className="border-b-0 hover:bg-transparent">
                  <TableCell colSpan={6} className="text-center py-16">
                    <p className="font-medium text-muted-foreground">
                      Nenhum lead corresponde à busca ou ao status selecionado.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setStatusFilter(STATUS_FILTER_TODOS);
                      }}
                      className="mt-3 text-sm font-semibold text-indigo-700 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      Limpar filtros
                    </button>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLeads.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className="border-border transition-colors hover:bg-muted/50 dark:border-white/5 dark:hover:bg-white/[0.02] group"
                  >
                    <TableCell className="py-4 pl-6 pr-3 align-middle">
                      <Link
                        href={`/dashboard/leads/${lead.id}`}
                        className="block truncate text-base font-bold text-foreground transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        {lead.name}
                      </Link>
                    </TableCell>
                    <TableCell className="px-3 py-4 align-middle">
                      <span className="block truncate text-sm font-medium text-foreground/90">{lead.company}</span>
                    </TableCell>
                    <TableCell className="px-3 py-4 align-middle">
                      <span className="block truncate text-sm font-medium text-foreground/90">{lead.email || "Sem e-mail"}</span>
                    </TableCell>
                    <TableCell className="px-3 py-4 align-middle">
                      <span className="block truncate text-sm text-muted-foreground">{lead.phone || "Sem telefone"}</span>
                    </TableCell>
                    <TableCell className="px-3 py-4 align-middle">
                      <Badge
                        className={cn(
                          "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider shadow-sm",
                          STATUS_BADGE_SURFACE[lead.status],
                        )}
                      >
                        <div className={cn("mr-1.5 h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[lead.status])} />
                        {lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-4 pl-3 pr-6 text-right align-middle">
                     <DropdownMenu>
                        <DropdownMenuTrigger>
                          <Button
                            variant="ghost"
                            className="h-9 w-9 rounded-lg p-0 text-muted-foreground transition-all hover:bg-muted hover:text-foreground dark:hover:bg-white/10 dark:hover:text-white"
                          >
                            <MoreHorizontal className="h-5 w-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-950 border-white/10 text-zinc-300 rounded-xl p-1.5 min-w-[160px] shadow-2xl">
                          <DropdownMenuItem
                            className="focus:bg-white/10 focus:text-white rounded-lg cursor-pointer py-2 px-3 gap-2"
                            onClick={() => window.location.href = `/dashboard/leads/${lead.id}`}
                          >
                            Ver Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem className="focus:bg-white/10 focus:text-white rounded-lg cursor-pointer py-2 px-3 gap-2" onClick={() => openForm(lead)}>
                            Editar Lead
                          </DropdownMenuItem>
                          <div className="h-px bg-white/5 my-1" />
                          <DropdownMenuItem className="text-red-400 focus:bg-red-500/10 focus:text-red-300 rounded-lg cursor-pointer py-2 px-3 gap-2" onClick={() => handleDelete(lead.id)}>
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
        {!loading && filteredLeads.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 dark:border-white/5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-xs text-muted-foreground">
              Mostrando{" "}
              <span className="font-medium text-foreground/85">
                {pageSliceStart + 1}–{Math.min(pageSliceStart + PAGE_SIZE, filteredLeads.length)}
              </span>{" "}
              de{" "}
              <span className="font-medium text-foreground/85">
                {filteredLeads.length}
              </span>
            </p>
            {pageCount > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-9 gap-1 rounded-xl border-border bg-background dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06] disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  Anterior
                </Button>
                <span className="min-w-[5.5rem] text-center text-xs font-medium text-muted-foreground">
                  {safePage} / {pageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safePage >= pageCount}
                  onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
                  className="h-9 gap-1 rounded-xl border-border bg-background dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06] disabled:opacity-40"
                >
                  Próxima
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] w-full items-center justify-center text-muted-foreground">
          <Loader2 className="size-8 shrink-0 animate-spin" aria-hidden />
        </div>
      }
    >
      <LeadsPageContent />
    </Suspense>
  );
}
