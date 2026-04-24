"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getLead, updateLead } from "@/lib/leads";
import { getReportByLead } from "@/lib/reports";
import { Lead, LEAD_STATUSES, type LeadStatus } from "@/types/lead";
import { RotaDigitalReport } from "@/types/report";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  isLeadStatusSelectable,
  isNovoLeadBlockedFromCurrent,
  leadHasGeneratedRoute,
} from "@/lib/lead-status-rules";
import { getLeadFollowupDay, statusUsesFollowupUrgencyColor } from "@/lib/lead-followup";
import { buildWhatsAppHref, maskWhatsappBRDisplay, onlyDigitsPhone } from "@/lib/report-cta";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { LEAD_STATUS_MENU_DOT_CLASSES, leadStatusDropdownTriggerSurface } from "@/lib/lead-status-ui";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  AtSign,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  Mail,
  Phone,
  Pencil,
  Compass,
  Sparkles,
  User,
} from "lucide-react";
import { LinkButton } from "@/components/ui/link-button";
import { QuotaGuardLink } from "@/components/limits/quota-gate-context";

function leadWebsiteHref(raw: string | undefined): string {
  const t = raw?.trim() ?? "";
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function leadInstagramHref(raw: string | undefined): string {
  const t = raw?.trim() ?? "";
  if (!t) return "";
  if (t.startsWith("@")) {
    const h = t.slice(1).split("/")[0]?.split("?")[0] ?? "";
    return h ? `https://instagram.com/${h}` : "";
  }
  if (/^https?:\/\//i.test(t)) return t;
  const h = t.replace(/^@/, "").split("/")[0]?.split("?")[0] ?? "";
  return h ? `https://instagram.com/${h}` : "";
}

function resolvePublicAppOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
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

export default function LeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [lead, setLead] = useState<Lead | null>(null);
  const [existingReport, setExistingReport] = useState<RotaDigitalReport | null>(null);
  const [loading, setLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editWebsiteUrl, setEditWebsiteUrl] = useState("");
  const [editInstagramUrl, setEditInstagramUrl] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<LeadStatus>("Novo Lead");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [publicLinkOrigin, setPublicLinkOrigin] = useState("");
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);

  const loadLead = useCallback(async () => {
    if (!leadId) return;
    try {
      setLoading(true);
      const [leadData, reportData] = await Promise.all([
        getLead(leadId as string),
        user ? getReportByLead(leadId as string, user.uid) : Promise.resolve(null),
      ]);
      setLead(leadData);
      setExistingReport(reportData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [leadId, user]);

  useEffect(() => {
    void loadLead();
  }, [loadLead]);

  useEffect(() => {
    setPublicLinkOrigin(resolvePublicAppOrigin());
  }, []);

  const openEditDialog = () => {
    if (!lead) return;
    const hasRouteNow = leadHasGeneratedRoute({
      reportDocumentExists: Boolean(existingReport),
      reportIdOnLead: lead.reportId,
    });
    setEditName(lead.name);
    setEditCompany(lead.company);
    setEditEmail(lead.email);
    setEditPhone(formatPhoneBr(lead.phone));
    setEditWebsiteUrl(lead.websiteUrl?.trim() ?? "");
    setEditInstagramUrl(lead.instagramUrl?.trim() ?? "");
    setEditNotes(lead.notes ?? "");
    let initialStatus = lead.status;
    if (!hasRouteNow && initialStatus === "Rota Gerada") initialStatus = "Novo Lead";
    if (hasRouteNow && initialStatus === "Novo Lead") initialStatus = "Rota Gerada";
    setEditStatus(initialStatus);
    setEditError(null);
    setEditOpen(true);
  };

  const handleSaveLead = async () => {
    if (!user || !lead) return;
    if (!editName.trim() || !editCompany.trim()) {
      setEditError("Nome e empresa são obrigatórios.");
      return;
    }
    const hasRouteNow = leadHasGeneratedRoute({
      reportDocumentExists: Boolean(existingReport),
      reportIdOnLead: lead.reportId,
    });
    if (!isLeadStatusSelectable(editStatus, hasRouteNow, lead.status)) {
      setEditError(
        editStatus === "Novo Lead" && isNovoLeadBlockedFromCurrent(lead.status)
          ? "Não é possível voltar para “Novo Lead” a partir de “Em Contato”, “Proposta”, “Convertido” ou “Perdido”."
          : hasRouteNow
            ? "Com rota gerada não é possível voltar o status para Novo Lead ou Em Contato."
            : "O status Rota Gerada só fica disponível depois de gerar o relatório para este lead.",
      );
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await updateLead(lead.id, {
        name: editName.trim(),
        company: editCompany.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
        websiteUrl: editWebsiteUrl.trim(),
        instagramUrl: editInstagramUrl.trim(),
        notes: editNotes.trim(),
        status: editStatus,
      });
      setEditOpen(false);
      await loadLead();
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleStatusPick = async (next: LeadStatus) => {
    if (!lead || next === lead.status) return;
    const hasRouteNow = leadHasGeneratedRoute({
      reportDocumentExists: Boolean(existingReport),
      reportIdOnLead: lead.reportId,
    });
    if (!isLeadStatusSelectable(next, hasRouteNow, lead.status)) return;
    try {
      await updateLead(lead.id, { status: next });
      setLead((prev) => (prev ? { ...prev, status: next } : prev));
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-muted-foreground" size={32} />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-muted-foreground">Lead não encontrado.</p>
        <Button variant="outline" onClick={() => router.back()}>
          Voltar
        </Button>
      </div>
    );
  }

  const hasRoute = leadHasGeneratedRoute({
    reportDocumentExists: Boolean(existingReport),
    reportIdOnLead: lead.reportId,
  });

  const phoneTrimmed = lead.phone?.trim() ?? "";
  const waDigits = phoneTrimmed ? onlyDigitsPhone(phoneTrimmed).replace(/^0+/, "") : "";
  const waHref = buildWhatsAppHref(waDigits);
  const phoneDisplay =
    !phoneTrimmed ? "—" : maskWhatsappBRDisplay(waDigits) || phoneTrimmed;

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/dashboard/leads")}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={20} />
          </Button>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-foreground">{lead.name}</h1>
            <p className="mt-1 truncate text-muted-foreground">{lead.company}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-2 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] [&_svg]:size-3.5"
            onClick={() => openEditDialog()}
          >
            <Pencil className="size-3.5 shrink-0" aria-hidden />
            Editar informações
          </Button>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
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
                Editar lead
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed text-zinc-500 sm:text-sm">
                Atualize os dados do contacto. As alterações refletem-se na lista e nas rotas associadas.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-6 px-6 py-6 sm:px-8 sm:py-7">
            <section className="space-y-3.5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <div className="space-y-2">
                  <Label htmlFor="edit-lead-name" className="text-xs font-medium text-zinc-500">
                    Nome completo <span className="text-red-400/90">*</span>
                  </Label>
                  <Input
                    id="edit-lead-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="Ex.: João Silva"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lead-company" className="text-xs font-medium text-zinc-500">
                    Empresa <span className="text-red-400/90">*</span>
                  </Label>
                  <Input
                    id="edit-lead-company"
                    value={editCompany}
                    onChange={(e) => setEditCompany(e.target.value)}
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
                  <Label htmlFor="edit-lead-email" className="text-xs font-medium text-zinc-500">
                    E-mail <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <Input
                    id="edit-lead-email"
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="nome@empresa.com"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lead-phone" className="text-xs font-medium text-zinc-500">
                    Telefone / WhatsApp <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <div className="relative">
                    <Phone
                      className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600"
                      aria-hidden
                    />
                    <Input
                      id="edit-lead-phone"
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(formatPhoneBr(e.target.value))}
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
                  <Label htmlFor="edit-lead-website" className="text-xs font-medium text-zinc-500">
                    Site <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <Input
                    id="edit-lead-website"
                    type="url"
                    value={editWebsiteUrl}
                    onChange={(e) => setEditWebsiteUrl(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="https://empresa.com.br"
                    autoComplete="url"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lead-instagram" className="text-xs font-medium text-zinc-500">
                    Instagram <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <Input
                    id="edit-lead-instagram"
                    value={editInstagramUrl}
                    onChange={(e) => setEditInstagramUrl(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="https://instagram.com/empresa ou @empresa"
                    autoComplete="off"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3.5">
              <div className="space-y-2">
                <Label htmlFor="edit-lead-status" className="text-xs font-medium text-zinc-500">
                  Status atual
                </Label>
                <Select value={editStatus} onValueChange={(v) => v && setEditStatus(v as LeadStatus)}>
                  <SelectTrigger
                    id="edit-lead-status"
                    className="h-10 w-full rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 focus-visible:border-brand/45 dark:hover:bg-white/[0.06]"
                  >
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent sideOffset={8}>
                    {LEAD_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} disabled={!isLeadStatusSelectable(s, hasRoute, lead.status)}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            <section className="space-y-3.5">
              <div className="space-y-2">
                <Label htmlFor="edit-lead-notes" className="text-xs font-medium text-zinc-500">
                  Observações
                </Label>
                <Textarea
                  id="edit-lead-notes"
                  rows={4}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Notas internas sobre o lead…"
                  className="min-h-[100px] rounded-md border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                />
              </div>
            </section>

            {editError ? (
              <div
                role="alert"
                className="rounded-md border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-sm font-medium leading-relaxed text-red-300"
              >
                {editError}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] bg-white/[0.02] px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-8 sm:py-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditOpen(false)}
              disabled={editSaving}
              className="h-10 rounded-md text-zinc-400 hover:bg-white/5 hover:text-zinc-200 sm:min-w-[7rem]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="cta"
              size="lg"
              onClick={() => void handleSaveLead()}
              disabled={editSaving}
              className="min-w-[10rem] gap-2"
            >
              {editSaving ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
              {editSaving ? "A guardar…" : "Salvar lead"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Informações de Contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-foreground">
              <User size={16} className="shrink-0 text-muted-foreground" />
              <span>{lead.name}</span>
            </div>
            <div className="flex items-center gap-3 text-foreground">
              <Building2 size={16} className="shrink-0 text-muted-foreground" />
              <span>{lead.company}</span>
            </div>
            <div className="flex items-center gap-3 text-foreground">
              <Mail size={16} className="shrink-0 text-muted-foreground" />
              <span>{lead.email || "—"}</span>
            </div>
            <div className="flex items-center gap-3 text-foreground">
              <Phone size={16} className="shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="min-w-0 truncate" title={phoneTrimmed || undefined}>
                  {phoneDisplay}
                </span>
                {waHref ? (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border border-[#25D366]/20 bg-[#25D366]/5 text-[#25D366]/80 transition-colors hover:border-[#25D366]/35 hover:bg-[#25D366]/10 hover:text-[#25D366] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#25D366]/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background dark:border-[#25D366]/15 dark:bg-[#25D366]/10 dark:hover:border-[#25D366]/28 dark:hover:bg-[#25D366]/12"
                    aria-label={`Abrir WhatsApp ${phoneDisplay}`}
                    title="Abrir no WhatsApp"
                  >
                    <WhatsAppIcon className="size-3" aria-hidden />
                  </a>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outros Detalhes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger
                  title="Alterar status"
                  className={cn(
                    "inline-flex h-5 min-h-5 cursor-pointer items-center gap-0.5 rounded-[min(var(--radius-md),12px)] px-1.5 text-[10px] font-semibold uppercase leading-none tracking-wide outline-none transition-all focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
                    leadStatusDropdownTriggerSurface(lead.status),
                  )}
                >
                  <span className="max-w-[8rem] truncate sm:max-w-[11rem]">{lead.status}</span>
                  <ChevronDown className="size-2 shrink-0 opacity-70" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[13.5rem] p-1.5">
                  <div className="px-2 pb-1.5 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Status do funil
                  </div>
                  {LEAD_STATUSES.map((s) => (
                    <DropdownMenuItem
                      key={s}
                      disabled={lead.status === s || !isLeadStatusSelectable(s, hasRoute, lead.status)}
                      className="gap-2.5 rounded-md py-2"
                      onClick={() => void handleStatusPick(s)}
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
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">atual</span>
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <LeadDetailFollowupTag lead={lead} />
            <div className="flex items-center gap-3 text-foreground">
              <Calendar size={16} className="shrink-0 text-muted-foreground" />
              <span>
                Criado em{" "}
                {new Date(lead.createdAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
            {lead.websiteUrl?.trim() ? (
              <div className="flex items-start gap-3 text-foreground">
                <Globe size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                <a
                  href={leadWebsiteHref(lead.websiteUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 break-all text-sm font-medium text-brand transition-colors hover:text-brand/90 hover:underline dark:text-brand dark:hover:text-brand"
                >
                  {lead.websiteUrl.trim()}
                </a>
              </div>
            ) : null}
            {lead.instagramUrl?.trim() ? (
              <div className="flex items-start gap-3 text-foreground">
                <AtSign size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                <a
                  href={leadInstagramHref(lead.instagramUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 break-all text-sm font-medium text-brand transition-colors hover:text-brand/90 hover:underline dark:text-brand dark:hover:text-brand"
                >
                  {lead.instagramUrl.trim()}
                </a>
              </div>
            ) : null}
            {lead.notes && (
              <div className="mt-2">
                <p className="mb-1 text-xs text-muted-foreground">Observações</p>
                <p className="whitespace-pre-wrap text-sm text-foreground/90">{lead.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {existingReport?.publicSlug && publicLinkOrigin ? (
        <Card
          className={cn(
            "border border-border bg-card shadow-lg dark:border-border dark:bg-card dark:shadow-xl",
            "border-l-[3px] border-l-brand/45 dark:border-l-brand/40",
            "py-6 sm:py-7",
          )}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-3 text-base text-foreground">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand/35 bg-brand/10">
                <Link2 size={18} className="text-brand" aria-hidden />
              </div>
              Página pública para o lead
            </CardTitle>
            <p className="max-w-prose text-sm font-normal leading-relaxed text-muted-foreground">
              Envie este link para o cliente ver a proposta no navegador, sem login.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 text-left text-sm text-foreground/90">
              {`${publicLinkOrigin}/r/${existingReport.publicSlug}`}
            </code>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                type="button"
                variant="cta"
                className="gap-2"
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    `${publicLinkOrigin}/r/${existingReport.publicSlug}`,
                  );
                  setPublicLinkCopied(true);
                  setTimeout(() => setPublicLinkCopied(false), 2000);
                }}
              >
                {publicLinkCopied ? <CheckCircle2 size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                {publicLinkCopied ? "Copiado" : "Copiar"}
              </Button>
              <LinkButton
                href={`${publicLinkOrigin}/r/${existingReport.publicSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                variant="outline"
                className="gap-2"
              >
                <ExternalLink size={16} aria-hidden />
                Abrir
              </LinkButton>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border border-brand/25 bg-gradient-to-br from-brand/10 to-card dark:from-brand/15 dark:to-zinc-900 dark:border-brand/35">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Compass size={20} className="text-brand dark:text-brand" />
            Rota Digital com IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {existingReport ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground/90">
                Já existe uma Rota Digital gerada para este lead em{" "}
                <span className="font-medium text-brand dark:text-brand">
                  {new Date(existingReport.createdAt).toLocaleDateString("pt-BR")}
                </span>
                .
              </p>
              <div className="flex flex-wrap gap-3">
                <LinkButton href={`/dashboard/rotas/${existingReport.id}`} className="gap-2">
                  <ExternalLink size={16} />
                  Ver Rota
                </LinkButton>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Para gerar, abra o formulário de rota, selecione este lead e preencha site, instagram, serviços e
                objetivo.
              </p>
              <QuotaGuardLink href={`/dashboard/rotas/new?leadId=${lead.id}`} quotaKind="rotas" variant="cta" size="lg" className="gap-2">
                <Compass size={16} />
                Ir para Gerar Rota
              </QuotaGuardLink>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LeadDetailFollowupTag({ lead }: { lead: Lead }) {
  const day = getLeadFollowupDay(lead);
  const capped = day > 30;
  const displayDay = capped ? "30+" : String(day);

  const usesColor = statusUsesFollowupUrgencyColor(lead.status);

  let colorClasses: string;
  if (!usesColor) {
    colorClasses =
      "border-border/80 bg-muted/60 text-muted-foreground dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400";
  } else if (day <= 2) {
    colorClasses =
      "border-emerald-700/40 bg-emerald-500/12 text-emerald-900 dark:border-emerald-400/45 dark:bg-emerald-500/18 dark:text-emerald-100";
  } else if (day <= 5) {
    colorClasses =
      "border-amber-700/40 bg-amber-500/12 text-amber-900 dark:border-amber-400/45 dark:bg-amber-500/18 dark:text-amber-100";
  } else {
    colorClasses =
      "border-red-700/40 bg-red-500/12 text-red-900 dark:border-red-400/45 dark:bg-red-500/18 dark:text-red-100";
  }

  return (
    <div className="flex items-center gap-3 text-foreground">
      <Clock size={16} className="shrink-0 text-muted-foreground" />
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Followup</span>
        <span
          className={cn(
            "inline-flex h-6 min-w-6 items-center justify-center rounded border px-1.5 text-[10px] font-bold uppercase tabular-nums tracking-wide",
            colorClasses,
          )}
          title={`Followup dia ${day}`}
        >
          D{displayDay}
        </span>
      </div>
    </div>
  );
}
