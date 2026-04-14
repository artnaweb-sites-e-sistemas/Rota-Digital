"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Lead, LEAD_STATUSES, normalizeLeadStatus, type LeadStatus } from "@/types/lead";
import { getLeads, createLead, updateLead, deleteLead } from "@/lib/leads";
import { deleteReportsByLead, getReportsByUser } from "@/lib/reports";
import type { RotaDigitalReport } from "@/types/report";
import { buildWhatsAppHref, maskWhatsappBRDisplay, onlyDigitsPhone } from "@/lib/report-cta";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isLeadStatusSelectable, leadHasGeneratedRoute } from "@/lib/lead-status-rules";
import { getLeadFollowupDay, statusUsesFollowupUrgencyColor } from "@/lib/lead-followup";
import {
  LEAD_STATUS_DOT_CLASSES,
  LEAD_STATUS_MENU_DOT_CLASSES,
  leadStatusDropdownTriggerSurface,
} from "@/lib/lead-status-ui";
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { LeadCaptureProgressOverlay } from "@/components/leads/lead-capture-progress-overlay";
// import { toast } from "sonner"; // If not available, we can use a simple alert or just implement without it

const PAGE_SIZE = 10;

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

/** Uma linha ou vírgula/ponto e vírgula por item (nichos e cidades). */
function splitToList(raw: string): string[] {
  const parts = raw
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).slice(0, 40);
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

/** Dígitos nacionais ou já com 55; remove zeros de tronco (ex.: 011…) para wa.me com +55. */
function leadPhoneDigitsForWhatsApp(raw: string): string {
  return onlyDigitsPhone(raw).replace(/^0+/, "");
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
  if (ALL_STATUSES.includes(decoded as LeadStatus)) return decoded as LeadStatus;
  const fromLegacy = normalizeLeadStatus(decoded);
  if (decoded === "Novo" || decoded === "Qualificado") return fromLegacy;
  return null;
}

function leadMatchesSearch(lead: Lead, rawQuery: string): boolean {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  const terms = q.split(/\s+/).filter(Boolean);
  const fieldTexts = [
    lead.name,
    lead.company,
    lead.email,
    lead.phone || "",
    lead.websiteUrl || "",
    lead.instagramUrl || "",
  ].map(normalizeSearchText);
  const hayFlat = fieldTexts.join(" ");
  return terms.every((term) => {
    if (hayFlat.includes(term)) return true;
    return fieldTexts.some((field) =>
      field.split(/[\s@._\-/+]+/).some((word) => word.length > 0 && word.startsWith(term)),
    );
  });
}

/** Chip verde do WhatsApp na tabela (link externo compacto). */
const TABLE_EXTERNAL_LINK_CHIP_CLASS =
  "inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border border-[#25D366]/20 bg-[#25D366]/5 text-[#25D366]/80 transition-colors hover:border-[#25D366]/35 hover:bg-[#25D366]/10 hover:text-[#25D366] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#25D366]/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background dark:border-[#25D366]/15 dark:bg-[#25D366]/10 dark:hover:border-[#25D366]/28 dark:hover:bg-[#25D366]/12";

/** Chip da rota pública / painel — tom marca, distinto do WhatsApp. */
const TABLE_PUBLIC_ROUTE_CHIP_CLASS =
  "inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border border-brand/30 bg-brand/10 text-brand transition-colors hover:border-brand/50 hover:bg-brand/18 hover:text-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background dark:border-brand/40 dark:bg-brand/15 dark:text-brand dark:hover:border-brand/50 dark:hover:bg-brand/22";

/** Chip “gerar rota” — tom âmbar, distinto do link externo (ícone Sparkles). */
const TABLE_CREATE_ROUTE_CHIP_CLASS =
  "inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border border-amber-500/35 bg-amber-500/10 text-amber-800 transition-colors hover:border-amber-500/55 hover:bg-amber-500/18 hover:text-amber-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200 dark:hover:border-amber-300/45 dark:hover:bg-amber-400/16 dark:hover:text-amber-50";

const FOLLOWUP_NEUTRAL_BADGE_CLASS =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-border/80 bg-muted/60 px-1.5 text-[10px] font-bold uppercase tabular-nums tracking-wide text-muted-foreground dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400";

function leadFollowupBadgeClass(status: LeadStatus, day: number): string {
  if (!statusUsesFollowupUrgencyColor(status)) return FOLLOWUP_NEUTRAL_BADGE_CLASS;
  if (day <= 2) {
    return "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-emerald-700/40 bg-emerald-500/12 px-1.5 text-[10px] font-bold uppercase tabular-nums tracking-wide text-emerald-900 dark:border-emerald-400/45 dark:bg-emerald-500/18 dark:text-emerald-100";
  }
  if (day <= 5) {
    return "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-amber-700/40 bg-amber-500/12 px-1.5 text-[10px] font-bold uppercase tabular-nums tracking-wide text-amber-900 dark:border-amber-400/45 dark:bg-amber-500/18 dark:text-amber-100";
  }
  return "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-red-700/40 bg-red-500/12 px-1.5 text-[10px] font-bold uppercase tabular-nums tracking-wide text-red-900 dark:border-red-400/45 dark:bg-red-500/18 dark:text-red-100";
}

function LeadFollowupCell({ lead }: { lead: Lead }) {
  const day = getLeadFollowupDay(lead);
  return (
    <span className={leadFollowupBadgeClass(lead.status, day)} title={`Followup dia ${day}`}>
      D{day}
    </span>
  );
}

function LeadTableSharedRouteLink({
  lead,
  rowHasRoute,
  publicSlugByReportId,
}: {
  lead: Lead;
  rowHasRoute: boolean;
  publicSlugByReportId: Map<string, string>;
}) {
  const canOpenNewRotaForm =
    (lead.status === "Novo Lead" || lead.status === "Em Contato") && !rowHasRoute;

  if (canOpenNewRotaForm) {
    const href = `/dashboard/rotas/new?leadId=${encodeURIComponent(lead.id)}`;
    return (
      <Link
        href={href}
        className={TABLE_CREATE_ROUTE_CHIP_CLASS}
        aria-label={`Gerar rota digital para ${lead.name}`}
        title="Gerar rota para este lead (abre o formulário com o lead já selecionado)"
        onClick={(e) => e.stopPropagation()}
      >
        <Sparkles className="size-3 shrink-0" aria-hidden />
      </Link>
    );
  }

  if (!rowHasRoute || lead.status !== "Rota Gerada" || !lead.reportId) {
    return null;
  }
  const slug = publicSlugByReportId.get(lead.reportId);
  const href = slug ? `/r/${slug}` : `/dashboard/rotas/${lead.reportId}`;
  const opensPublic = Boolean(slug);
  const label = opensPublic
    ? `Abrir rota pública${slug ? ` (${slug})` : ""}`
    : "Abrir relatório da rota";
  return (
    <Link
      href={href}
      target={opensPublic ? "_blank" : undefined}
      rel={opensPublic ? "noopener noreferrer" : undefined}
      className={TABLE_PUBLIC_ROUTE_CHIP_CLASS}
      aria-label={label}
      title={opensPublic ? "Abrir página pública da rota" : "Abrir relatório no painel"}
      onClick={(e) => e.stopPropagation()}
    >
      <ExternalLink className="size-3 shrink-0" aria-hidden />
    </Link>
  );
}

function LeadTablePhoneCell({ phone }: { phone: string | undefined }) {
  const trimmed = phone?.trim() ?? "";
  if (!trimmed) {
    return <span className="block truncate text-sm text-muted-foreground">Sem telefone</span>;
  }
  const waDigits = leadPhoneDigitsForWhatsApp(trimmed);
  const waHref = buildWhatsAppHref(waDigits);
  const displayPlus55 = maskWhatsappBRDisplay(waDigits);
  return (
    <div className="inline-flex min-w-0 max-w-full items-center gap-2">
      <span className="min-w-0 truncate text-sm text-muted-foreground" title={displayPlus55}>
        {displayPlus55 || trimmed}
      </span>
      {waHref ? (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className={TABLE_EXTERNAL_LINK_CHIP_CLASS}
          aria-label={`Abrir WhatsApp ${displayPlus55}`}
          title="Abrir no WhatsApp"
          onClick={(e) => e.stopPropagation()}
        >
          <WhatsAppIcon className="size-3" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

function LeadsPageContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [reports, setReports] = useState<RotaDigitalReport[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(STATUS_FILTER_TODOS);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureNiches, setCaptureNiches] = useState("");
  const [captureCities, setCaptureCities] = useState("");
  const [captureMax, setCaptureMax] = useState(25);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureNoticeOpen, setCaptureNoticeOpen] = useState(false);
  const [captureNoticeMessage, setCaptureNoticeMessage] = useState("");

  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [status, setStatus] = useState<LeadStatus>("Novo Lead");

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [data, userReports] = await Promise.all([
        getLeads(user.uid),
        getReportsByUser(user.uid),
      ]);
      setLeads(data);
      setReports(userReports);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const publicSlugByReportId = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of reports) {
      if (r.publicSlug) m.set(r.id, r.publicSlug);
    }
    return m;
  }, [reports]);

  const captureOverlayHint = useMemo(() => {
    const n = splitToList(captureNiches)[0];
    const c = splitToList(captureCities)[0];
    if (n && c) return `${n} · ${c}`;
    if (n) return n;
    return undefined;
  }, [captureNiches, captureCities]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    if (!captureBusy) return;
    const id = window.setInterval(() => {
      setCaptureProgress((p) => (p >= 88 ? p : p + 2));
    }, 240);
    return () => window.clearInterval(id);
  }, [captureBusy]);

  const statusQuery = searchParams.get("status");
  useEffect(() => {
    const parsed = statusFromQueryParam(statusQuery);
    if (parsed) setStatusFilter(parsed);
  }, [statusQuery]);

  const filteredLeads = useMemo(
    () =>
      leads
        .filter((lead) => {
        if (!leadMatchesSearch(lead, search)) return false;
        if (statusFilter !== STATUS_FILTER_TODOS && lead.status !== statusFilter) return false;
        return true;
      })
        .sort((a, b) => {
          const dayDiff = getLeadFollowupDay(b) - getLeadFollowupDay(a);
          if (dayDiff !== 0) return dayDiff;
          return b.updatedAt - a.updatedAt;
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
      setWebsiteUrl(lead.websiteUrl?.trim() ?? "");
      setInstagramUrl(lead.instagramUrl?.trim() ?? "");
      const hasRoute = leadHasGeneratedRoute({
        reportDocumentExists: false,
        reportIdOnLead: lead.reportId,
      });
      let nextStatus = lead.status;
      if (!hasRoute && nextStatus === "Rota Gerada") nextStatus = "Novo Lead";
      if (hasRoute && nextStatus === "Novo Lead") nextStatus = "Rota Gerada";
      setStatus(nextStatus);
    } else {
      setEditingLead(null);
      setName("");
      setEmail("");
      setPhone("");
      setCompany("");
      setWebsiteUrl("");
      setInstagramUrl("");
      setStatus("Novo Lead");
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
    const hasRoute = editingLead
      ? leadHasGeneratedRoute({ reportDocumentExists: false, reportIdOnLead: editingLead.reportId })
      : false;
    if (!isLeadStatusSelectable(status, hasRoute)) {
      setSaveError(
        hasRoute
          ? "Com rota gerada não é possível voltar o status para Novo Lead."
          : "O status Rota Gerada só fica disponível depois de gerar o relatório para este lead.",
      );
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
        websiteUrl: websiteUrl.trim(),
        instagramUrl: instagramUrl.trim(),
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

  const handleLeadStatusChange = async (leadRow: Lead, next: LeadStatus) => {
    if (!user || next === leadRow.status) return;
    const hasRoute = leadHasGeneratedRoute({
      reportDocumentExists: false,
      reportIdOnLead: leadRow.reportId,
    });
    if (!isLeadStatusSelectable(next, hasRoute)) return;
    try {
      await updateLead(leadRow.id, { status: next });
      await fetchLeads();
    } catch (error) {
      console.error(error);
    }
  };

  const openCapture = () => {
    setCaptureError(null);
    setCaptureOpen(true);
  };

  const runCapture = async () => {
    if (!user) return;
    const niches = splitToList(captureNiches);
    const cities = splitToList(captureCities);
    if (!niches.length || !cities.length) {
      setCaptureError("Informe ao menos um nicho e uma cidade (linhas ou separados por vírgula).");
      return;
    }
    const maxResults = Math.min(50, Math.max(1, Math.floor(Number(captureMax)) || 25));
    setCaptureError(null);
    setCaptureBusy(true);
    setCaptureProgress(4);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/leads-capture", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          niches,
          cities,
          maxResults,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        created?: number;
        requested?: number;
        eligibleUnique?: number;
        diagnostics?: {
          textSearches: number;
          placesFromSearch: number;
          detailCalls: number;
          skippedNoDetails: number;
          skippedNoContact: number;
          skippedDuplicate: number;
        };
      };
      if (!res.ok) {
        setCaptureError(payload.error || "Não foi possível concluir a captura.");
        return;
      }
      setCaptureProgress(100);
      const created = typeof payload.created === "number" ? payload.created : 0;
      const requested = typeof payload.requested === "number" ? payload.requested : maxResults;
      const eligible =
        typeof payload.eligibleUnique === "number" ? payload.eligibleUnique : undefined;
      await fetchLeads();
      if (created === 0) {
        const d = payload.diagnostics;
        let msg =
          "Nenhum lead novo gravado. Só entram empresas com telefone (8+ dígitos), site ou e-mail público, sem duplicar a sua lista.";
        if (d) {
          if (d.placesFromSearch === 0 && d.textSearches > 0) {
            msg +=
              " O Google não devolveu resultados para esta pesquisa — confira a chave `GOOGLE_PLACES_API_KEY`, a API Places (New) e as restrições da chave (pedidos vêm do servidor, não do browser).";
          } else if (d.detailCalls > 0 && d.skippedNoDetails === d.detailCalls) {
            msg +=
              " Não foi possível obter detalhes dos lugares (404/erro) — confira se a mesma chave permite Place Details (New).";
          } else {
            if (d.skippedNoContact > 0) {
              msg += ` ${d.skippedNoContact} resultado(s) sem contacto público suficiente.`;
            }
            if (d.skippedDuplicate > 0) {
              msg += ` ${d.skippedDuplicate} ignorado(s) por já existirem na base (telefone, site ou Google Place).`;
            }
          }
        }
        setCaptureError(msg);
        return;
      }
      setCaptureOpen(false);
      if (created < requested) {
        const extra =
          typeof eligible === "number"
            ? ` Na pesquisa apareceram ${eligible} empresa(s) com contacto público (telefone, site ou e-mail) que ainda não estavam duplicadas na sua base.`
            : "";
        setCaptureNoticeMessage(
          `Foram cadastrados ${created} de ${requested} leads.${extra} Para chegar ao número total, experimente alargar cidades, variar os nichos ou repetir mais tarde — o Google pode devolver resultados diferentes ao longo do tempo.`,
        );
        setCaptureNoticeOpen(true);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro de rede ao capturar leads.";
      setCaptureError(msg);
    } finally {
      setCaptureBusy(false);
      setTimeout(() => setCaptureProgress(0), 400);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Leads</h1>
          <p className="mt-1 text-muted-foreground">Gerencie seus contatos e oportunidades de negócio.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="gap-2 border-white/15 bg-white/[0.03] text-foreground hover:bg-white/[0.06]"
            onClick={openCapture}
            disabled={captureBusy || !user}
          >
            <MapPin className="size-4 shrink-0" aria-hidden />
            Captura automática
          </Button>
          <Button variant="cta" size="lg" onClick={() => openForm()} className="gap-2">
            <Plus className="size-4 shrink-0" aria-hidden />
            Novo Lead
          </Button>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          showCloseButton
          className={cn(
            "max-h-[min(92vh,820px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-y-auto overflow-x-hidden border-white/10 bg-zinc-950 p-0 text-zinc-100 shadow-2xl sm:max-w-xl md:max-w-[36rem]",
            "rounded-2xl ring-1 ring-white/10",
          )}
        >
          <div className="relative border-b border-white/[0.06] bg-white/[0.015] px-6 pb-5 pt-6 pr-14 sm:px-8 sm:pb-6 sm:pt-7 sm:pr-16">
            <DialogHeader className="gap-1.5 space-y-0 text-left">
              <DialogTitle className="font-heading text-lg font-semibold tracking-tight text-white sm:text-xl">
                {editingLead ? "Editar lead" : "Novo lead"}
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed text-zinc-500 sm:text-sm">
                {editingLead
                  ? "Atualize os dados do contacto. As alterações refletem-se na lista e nas rotas associadas."
                  : "Preencha os dados básicos para criar o contacto e acompanhar o funil na Rota Digital."}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-6 px-6 py-6 sm:px-8 sm:py-7">
            <section className="space-y-3.5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <div className="space-y-2">
                  <Label htmlFor="lead-name" className="text-xs font-medium text-zinc-500">
                    Nome completo <span className="text-red-400/90">*</span>
                  </Label>
                  <Input
                    id="lead-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="Ex.: João Silva"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-company" className="text-xs font-medium text-zinc-500">
                    Empresa <span className="text-red-400/90">*</span>
                  </Label>
                  <Input
                    id="lead-company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="Ex.: Tech Solutions"
                    autoComplete="organization"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3.5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <div className="space-y-2">
                  <Label htmlFor="lead-email" className="text-xs font-medium text-zinc-500">
                    E-mail <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <Input
                    id="lead-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="nome@empresa.com"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-phone" className="text-xs font-medium text-zinc-500">
                    Telefone / WhatsApp <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <div className="relative">
                    <Phone
                      className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600"
                      aria-hidden
                    />
                    <Input
                      id="lead-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(formatPhoneBr(e.target.value))}
                      className="h-10 rounded-md border-white/10 bg-white/[0.04] pl-9 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                      placeholder="(11) 99999-9999"
                      autoComplete="tel"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-3.5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <div className="space-y-2">
                  <Label htmlFor="lead-website" className="text-xs font-medium text-zinc-500">
                    Site da empresa <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <Input
                    id="lead-website"
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="https://empresa.com.br"
                    autoComplete="url"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-instagram" className="text-xs font-medium text-zinc-500">
                    Instagram <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <Input
                    id="lead-instagram"
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="https://instagram.com/empresa ou @empresa"
                    autoComplete="off"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3.5">
              <div className="space-y-2">
                <Label htmlFor="lead-status" className="text-xs font-medium text-zinc-500">
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
                    className="h-10 w-full rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 focus-visible:border-brand/45 dark:hover:bg-white/[0.06]"
                  >
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent sideOffset={8}>
                    {(() => {
                      const hasRouteForDialog = editingLead
                        ? leadHasGeneratedRoute({
                            reportDocumentExists: false,
                            reportIdOnLead: editingLead.reportId,
                          })
                        : false;
                      return ALL_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} disabled={!isLeadStatusSelectable(s, hasRouteForDialog)}>
                          {s}
                        </SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>
            </section>

            {saveError ? (
              <div
                role="alert"
                className="rounded-md border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-sm font-medium leading-relaxed text-red-300"
              >
                {saveError}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] bg-white/[0.02] px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-8 sm:py-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSaving}
              className="h-10 rounded-md text-zinc-400 hover:bg-white/5 hover:text-zinc-200 sm:min-w-[7rem]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="cta"
              size="lg"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="min-w-[10rem] gap-2"
            >
              {isSaving ? <Loader2 className="size-4 animate-spin shrink-0" aria-hidden /> : null}
              {isSaving ? "A guardar…" : "Salvar lead"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={captureOpen}
        onOpenChange={(next) => {
          if (captureBusy) return;
          setCaptureOpen(next);
          if (!next) setCaptureError(null);
        }}
      >
        <DialogContent
          showCloseButton
          className={cn(
            "max-h-[min(92vh,820px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-y-auto overflow-x-hidden border-white/10 bg-zinc-950 p-0 text-zinc-100 shadow-2xl sm:max-w-xl md:max-w-[36rem]",
            "rounded-2xl ring-1 ring-white/10",
          )}
        >
          <div className="relative border-b border-white/[0.06] bg-white/[0.015] px-6 pb-5 pt-6 pr-14 sm:px-8 sm:pb-6 sm:pt-7 sm:pr-16">
            <DialogHeader className="gap-1.5 space-y-0 text-left">
              <DialogTitle className="font-heading text-lg font-semibold tracking-tight text-white sm:text-xl">
                Captura automática (Google Places)
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed text-zinc-300 sm:text-sm">
                Nichos e cidades no Google Places. Mínimo: telefone (8+ dígitos), site ou e-mail público. Sem duplicados.
                Novos em <span className="font-medium text-white">Novo Lead</span>.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 px-6 py-6 sm:px-8 sm:py-7">
            <div className="space-y-2">
              <Label htmlFor="capture-niches" className="text-xs font-medium text-zinc-200">
                Nichos / segmentos <span className="text-red-400">*</span>
              </Label>
              <Textarea
                id="capture-niches"
                value={captureNiches}
                onChange={(e) => setCaptureNiches(e.target.value)}
                rows={3}
                placeholder={"Ex.: clínica dentária\nmarketing para restaurantes"}
                className="min-h-[88px] rounded-md border border-white/15 bg-white/[0.07] text-sm text-zinc-50 placeholder:text-zinc-400 placeholder:opacity-100 focus-visible:border-brand/55 focus-visible:ring-2 focus-visible:ring-brand/25"
              />
              <p className="text-[11px] leading-relaxed text-zinc-400">Um por linha, ou separados por vírgula.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="capture-cities" className="text-xs font-medium text-zinc-200">
                Cidades <span className="text-red-400">*</span>
              </Label>
              <Textarea
                id="capture-cities"
                value={captureCities}
                onChange={(e) => setCaptureCities(e.target.value)}
                rows={2}
                placeholder={"Campinas\nSão Paulo"}
                className="min-h-[72px] rounded-md border border-white/15 bg-white/[0.07] text-sm text-zinc-50 placeholder:text-zinc-400 placeholder:opacity-100 focus-visible:border-brand/55 focus-visible:ring-2 focus-visible:ring-brand/25"
              />
            </div>

            <div className="space-y-4 rounded-xl border border-white/12 bg-white/[0.05] px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex items-end justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="capture-radius" className="text-xs font-medium text-zinc-200">
                    Raio da captação
                  </Label>
                  <p className="text-[12px] leading-relaxed text-zinc-300 sm:text-[13px]">
                    Quanto maior o valor, mais empresas tentamos trazer.
                  </p>
                </div>
                <output
                  htmlFor="capture-radius"
                  className="shrink-0 rounded-full border border-brand/45 bg-brand px-3 py-1.5 text-sm font-bold tabular-nums text-brand-foreground shadow-[0_1px_0_0_rgba(255,255,255,0.12)_inset,0_1px_8px_-2px_rgba(0,0,0,0.35)] ring-1 ring-black/20 dark:border-brand/55 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.14)_inset,0_2px_12px_-2px_rgba(0,0,0,0.45)] dark:ring-white/10"
                >
                  {captureMax} leads
                </output>
              </div>
              <div className="relative pt-1">
                <div
                  className="pointer-events-none absolute left-0 right-0 top-[calc(50%+2px)] h-2 -translate-y-1/2 rounded-full bg-white/18"
                  aria-hidden
                />
                <input
                  id="capture-radius"
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={captureMax}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setCaptureMax(Number.isFinite(v) ? v : 25);
                  }}
                  className={cn(
                    "relative z-[1] h-2 w-full cursor-pointer appearance-none bg-transparent",
                    "[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent",
                    "[&::-webkit-slider-thumb]:mt-[-4px] [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/25 [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-[#8a7a4a] [&::-webkit-slider-thumb]:to-brand [&::-webkit-slider-thumb]:shadow-[0_2px_10px_rgba(0,0,0,0.35)]",
                    "[&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent",
                    "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-white/25 [&::-moz-range-thumb]:bg-gradient-to-br [&::-moz-range-thumb]:from-[#8a7a4a] [&::-moz-range-thumb]:to-brand [&::-moz-range-thumb]:shadow-[0_2px_10px_rgba(0,0,0,0.35)]",
                  )}
                  aria-valuemin={1}
                  aria-valuemax={50}
                  aria-valuenow={captureMax}
                  aria-valuetext={`${captureMax} leads`}
                />
              </div>
              <div className="flex justify-between text-xs font-semibold tabular-nums tracking-wide text-zinc-400">
                <span>1</span>
                <span>50</span>
              </div>
            </div>

            {captureError ? (
              <div
                role="alert"
                className="rounded-md border border-red-400/35 bg-red-500/15 px-3.5 py-2.5 text-sm font-medium leading-relaxed text-red-200"
              >
                {captureError}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] bg-white/[0.02] px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-8 sm:py-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCaptureOpen(false)}
              disabled={captureBusy}
              className="h-10 rounded-md text-zinc-200 hover:bg-white/10 hover:text-white sm:min-w-[7rem]"
            >
              Fechar
            </Button>
            <Button
              type="button"
              variant="cta"
              size="lg"
              disabled={captureBusy}
              onClick={() => void runCapture()}
              className="min-w-[10rem] gap-2"
            >
              {captureBusy ? <Loader2 className="size-4 animate-spin shrink-0" aria-hidden /> : null}
              {captureBusy ? "A capturar…" : "Iniciar captura"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <LeadCaptureProgressOverlay open={captureBusy} progress={captureProgress} hint={captureOverlayHint} />

      <Dialog open={captureNoticeOpen} onOpenChange={setCaptureNoticeOpen}>
        <DialogContent
          showCloseButton
          className={cn(
            "w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden border-white/10 bg-zinc-950 p-0 text-zinc-100 shadow-2xl sm:max-w-md",
            "rounded-2xl ring-1 ring-white/10",
          )}
        >
          <div className="border-b border-white/[0.06] bg-white/[0.015] px-6 py-5 sm:px-8 sm:py-6">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="font-heading text-lg font-semibold tracking-tight text-white">
                Resultado da captura
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-zinc-200">
                {captureNoticeMessage}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex justify-end border-t border-white/[0.06] bg-white/[0.02] px-6 py-4 sm:px-8 sm:py-5">
            <Button type="button" variant="cta" size="lg" onClick={() => setCaptureNoticeOpen(false)}>
              Entendi
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
                  className="h-10 w-full rounded-md border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-brand/50 focus-visible:ring-brand/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-600"
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
                  className="w-full font-medium sm:w-[14rem] sm:shrink-0"
                  aria-label="Filtrar por status do funil"
                >
                  <SelectValue placeholder="Todos os status">{statusFilterLabel(statusFilter)}</SelectValue>
                </SelectTrigger>
                <SelectContent align="start" className="max-h-72">
                  <SelectItem value={STATUS_FILTER_TODOS}>Todos os status</SelectItem>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
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
                <TableHead className="h-auto w-[10%] py-3 pl-6 pr-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Followup
                </TableHead>
                <TableHead className="h-auto w-[17%] px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Nome
                </TableHead>
                <TableHead className="h-auto w-[18%] px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Empresa
                </TableHead>
                <TableHead className="h-auto w-[22%] px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  E-mail
                </TableHead>
                <TableHead className="h-auto w-[16%] px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Telefone
                </TableHead>
                <TableHead className="h-auto w-[12%] px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="h-auto w-[5%] min-w-[4rem] py-3 pl-3 pr-6 align-middle" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow className="border-b-0 hover:bg-transparent">
                  <TableCell colSpan={7} className="text-center py-24">
                    <div className="flex flex-col items-center gap-3">
                      <Users className="size-12 text-muted-foreground/50" />
                      <p className="font-medium text-muted-foreground">Nenhum lead encontrado.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredLeads.length === 0 ? (
                <TableRow className="border-b-0 hover:bg-transparent">
                  <TableCell colSpan={7} className="text-center py-16">
                    <p className="font-medium text-muted-foreground">
                      Nenhum lead corresponde à busca ou ao status selecionado.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setStatusFilter(STATUS_FILTER_TODOS);
                      }}
                      className="mt-3 text-sm font-semibold text-brand hover:text-brand/90 dark:text-brand dark:hover:text-brand"
                    >
                      Limpar filtros
                    </button>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLeads.map((lead) => {
                  const rowHasRoute = leadHasGeneratedRoute({
                    reportDocumentExists: false,
                    reportIdOnLead: lead.reportId,
                  });
                  return (
                  <TableRow
                    key={lead.id}
                    className="border-border transition-colors hover:bg-muted/50 dark:border-white/5 dark:hover:bg-white/[0.02] group"
                  >
                    <TableCell className="py-4 pl-6 pr-3 align-middle">
                      <LeadFollowupCell lead={lead} />
                    </TableCell>
                    <TableCell className="px-3 py-4 align-middle">
                      <Link
                        href={`/dashboard/leads/${lead.id}`}
                        className="block truncate text-base font-bold text-foreground transition-colors hover:text-brand dark:hover:text-brand"
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
                    <TableCell className="min-w-0 px-3 py-4 align-middle">
                      <LeadTablePhoneCell phone={lead.phone} />
                    </TableCell>
                    <TableCell className="px-3 py-4 align-middle">
                      <div className="inline-flex max-w-full items-center gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            title="Alterar status"
                            className={cn(
                              "group/badge inline-flex h-5 min-h-5 w-fit max-w-full min-w-0 shrink cursor-pointer items-center justify-center gap-1 overflow-hidden rounded-md px-2.5 py-0.5 text-left text-[10px] font-bold uppercase tracking-wider shadow-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:focus-visible:ring-ring/40",
                              leadStatusDropdownTriggerSurface(lead.status),
                            )}
                          >
                            <span
                              className={cn(
                                "mr-0.5 h-1.5 w-1.5 shrink-0 rounded-full",
                                LEAD_STATUS_DOT_CLASSES[lead.status],
                              )}
                              aria-hidden
                            />
                            <span className="min-w-0 truncate">{lead.status}</span>
                            <ChevronDown className="size-3 shrink-0 opacity-70" aria-hidden />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="min-w-[13.5rem] p-1.5">
                            <div className="px-2 pb-1.5 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Status do funil
                            </div>
                            {ALL_STATUSES.map((s) => (
                              <DropdownMenuItem
                                key={s}
                                disabled={
                                  lead.status === s || !isLeadStatusSelectable(s, rowHasRoute)
                                }
                                className="gap-2.5 rounded-md py-2"
                                onClick={() => void handleLeadStatusChange(lead, s)}
                              >
                                <span
                                  className={cn(
                                    "size-2 shrink-0 rounded-full ring-1 ring-black/8 dark:ring-white/10",
                                    LEAD_STATUS_MENU_DOT_CLASSES[s],
                                  )}
                                  aria-hidden
                                />
                                <span className="min-w-0 flex-1 text-left">{s}</span>
                                {lead.status === s ? (
                                  <span className="text-[10px] font-medium uppercase text-muted-foreground">
                                    atual
                                  </span>
                                ) : null}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <LeadTableSharedRouteLink
                          lead={lead}
                          rowHasRoute={rowHasRoute}
                          publicSlugByReportId={publicSlugByReportId}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="py-4 pl-3 pr-6 text-right align-middle">
                     <DropdownMenu>
                        <DropdownMenuTrigger
                          title="Mais opções"
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "icon" }),
                            "h-9 w-9 rounded-lg p-0 text-muted-foreground transition-all hover:bg-muted hover:text-foreground dark:hover:bg-white/10 dark:hover:text-white",
                          )}
                        >
                          <MoreHorizontal className="h-5 w-5" aria-hidden />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[168px]">
                          <DropdownMenuItem onClick={() => (window.location.href = `/dashboard/leads/${lead.id}`)}>
                            Ver Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openForm(lead)}>Editar Lead</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => handleDelete(lead.id)}>
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  );
                })
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
