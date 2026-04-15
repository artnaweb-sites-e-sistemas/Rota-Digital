"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  FileText,
  ImagePlus,
  Loader2,
  Pencil,
  Save,
} from "lucide-react";

import type { Proposal } from "@/types/proposal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { updateProposal } from "@/lib/proposals";
import { describeManualUploadFailure, uploadUserProposalImage } from "@/lib/evidence-storage";
import { getUserCompanyAboutSettings } from "@/lib/user-settings";
import type { UserCompanyAboutSettings } from "@/types/user-settings";

type ProposalViewProps = {
  proposal: Proposal;
  variant: "dashboard" | "public";
  onProposalChange?: (proposal: Proposal) => void;
};

/** Raios menos genéricos que o kit (xl/2xl) para esta vista. */
const RR = {
  btn: "rounded-[0.9375rem]",
  stat: "rounded-[1.0625rem]",
  panel: "rounded-[1.3125rem]",
  logoMark: "rounded-[0.8125rem]",
} as const;

function getInitials(value: string): string {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "RD";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function formatDate(value: number): string {
  if (!value) return "Não definido";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function remainingValidityLabel(validUntilDate: number): string {
  if (!validUntilDate) return "Não definido";

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const end = new Date(validUntilDate);
  end.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return "Expirada";
  if (diffDays === 0) return "Vence hoje";
  if (diffDays === 1) return "1 dia";
  return `${diffDays} dias`;
}

function splitReadableParagraphs(value: string): string[] {
  const text = value.trim();
  if (!text) return [];

  const byLineBreak = text
    .split(/\n{2,}|\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (byLineBreak.length > 1) return byLineBreak;

  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((item) => item.trim()).filter(Boolean) ?? [text];
  if (sentences.length <= 2) return [text];

  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(sentences.slice(index, index + 2).join(" "));
  }
  return paragraphs;
}

function validityTone(validUntilDate: number): {
  label: string;
  className: string;
} {
  if (validUntilDate < Date.now()) {
    return {
      label: "Inválida",
      className:
        "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-500/25 dark:bg-red-500/15 dark:text-red-200",
    };
  }
  return {
    label: "Válida",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-100",
  };
}

function IdentityThumb({
  title,
  imageUrl,
  fallback,
  tone = "brand",
  busy = false,
  onPickFile,
  replaceButtonSide = "right",
}: {
  title: string;
  imageUrl?: string;
  fallback: string;
  tone?: "brand" | "muted";
  busy?: boolean;
  onPickFile?: (file: File) => void;
  replaceButtonSide?: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "p-2 ring-1 ring-white/10 dark:ring-white/10",
        tone === "brand"
          ? "rounded-full bg-gradient-to-tr from-brand/20 to-brand/35 dark:from-white/[0.08] dark:to-white/[0.04]"
          : "rounded-full bg-gradient-to-tr from-muted/90 to-background dark:from-white/[0.08] dark:to-white/[0.04]",
      )}
    >
      <div className="relative w-full">
        <div
          className={cn(
            "relative flex h-44 w-44 items-center justify-center overflow-hidden border-2 shadow-lg sm:h-48 sm:w-48 lg:h-56 lg:w-56",
            tone === "brand"
              ? "rounded-full border-brand/20 bg-gradient-to-br from-brand/20 via-brand/10 to-transparent"
              : "rounded-full border-border bg-gradient-to-br from-muted via-muted/80 to-background dark:border-white/10",
          )}
          title={title}
        >
          {imageUrl ? (
            <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
          ) : (
            <span className="text-5xl font-bold tracking-wide text-foreground sm:text-[3.25rem] lg:text-[3.5rem]">
              {getInitials(fallback)}
            </span>
          )}
        </div>

        {onPickFile ? (
          <label
            className={cn(
              "absolute z-[35] cursor-pointer",
              replaceButtonSide === "left"
                ? "top-4 left-4 sm:top-5 sm:left-5 lg:top-6 lg:left-6"
                : "top-4 right-4 sm:top-5 sm:right-5 lg:top-6 lg:right-6",
            )}
          >
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onPickFile(file);
                event.currentTarget.value = "";
              }}
            />
            <span
              className={cn(
                buttonVariants({ variant: "outline", size: "icon" }),
                "pointer-events-auto size-8 rounded-md border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-foreground dark:border-white/10 dark:bg-background/90",
              )}
              aria-label={`Substituir imagem de ${title}`}
              title={`Substituir imagem de ${title}`}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
            </span>
          </label>
        ) : null}
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  icon: Icon,
  badge,
  className,
}: {
  label: string;
  value: string;
  icon: typeof CalendarDays;
  badge?: {
    label: string;
    className: string;
  };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border border-border bg-background/80 p-4 dark:border-white/10 dark:bg-white/[0.03]",
        RR.stat,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-5 shrink-0 text-brand sm:size-4" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-widest">{label}</span>
        </div>
        {badge ? (
          <Badge
            variant="outline"
            className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold", badge.className)}
          >
            {badge.label}
          </Badge>
        ) : null}
      </div>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function ProposalView({ proposal, variant, onProposalChange }: ProposalViewProps) {
  const isDashboard = variant === "dashboard";
  const [copied, setCopied] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<"lead" | "agency" | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [companyAboutLive, setCompanyAboutLive] = useState<UserCompanyAboutSettings | null>(null);
  const [profileDraft, setProfileDraft] = useState({
    executiveSummary: proposal.companyProfile.executiveSummary,
  });

  useEffect(() => {
    setProfileDraft({
      executiveSummary: proposal.companyProfile.executiveSummary,
    });
  }, [proposal]);

  useEffect(() => {
    if (!isDashboard || !proposal.userId) {
      setCompanyAboutLive(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getUserCompanyAboutSettings(proposal.userId);
        if (!cancelled) setCompanyAboutLive(data);
      } catch {
        if (!cancelled) setCompanyAboutLive(null);
      }
    };
    void load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isDashboard, proposal.userId]);

  const publicHref = proposal.publicSlug ? `/p/${proposal.publicSlug}` : undefined;
  const status = validityTone(proposal.validUntilDate);
  const spotCount = proposal.spotPlans.length;
  const recurringCount = proposal.recurringPlans.length;

  const snapAgencyName = proposal.agencySnapshot.companyName.trim() || "Rota Digital";
  const snapAgencySummary = proposal.agencySnapshot.companySummary.trim();

  const displayAgencyName = useMemo(() => {
    if (!isDashboard) return snapAgencyName;
    const live = companyAboutLive?.companyName?.trim();
    return live || snapAgencyName;
  }, [isDashboard, companyAboutLive?.companyName, snapAgencyName]);

  const displayAgencySummary = useMemo(() => {
    if (!isDashboard) return snapAgencySummary;
    const live = companyAboutLive?.companySummary?.trim();
    return live || snapAgencySummary;
  }, [isDashboard, companyAboutLive?.companySummary, snapAgencySummary]);

  const leadImageUrl = proposal.evidences?.leadImageUrl?.trim();

  /** Ordem: override só desta proposta → imagens atuais em Configurações → snapshot da proposta. */
  const displayAgencyImage = useMemo(() => {
    const proposalOnly = proposal.evidences?.agencyImageUrl?.trim();
    if (proposalOnly) return proposalOnly;
    if (isDashboard) {
      const p = companyAboutLive?.primaryImageUrl?.trim();
      const s = companyAboutLive?.secondaryImageUrl?.trim();
      if (p) return p;
      if (s) return s;
    }
    return (
      proposal.agencySnapshot.primaryImageUrl?.trim() || proposal.agencySnapshot.secondaryImageUrl?.trim() || ""
    );
  }, [
    isDashboard,
    proposal.evidences?.agencyImageUrl,
    companyAboutLive?.primaryImageUrl,
    companyAboutLive?.secondaryImageUrl,
    proposal.agencySnapshot.primaryImageUrl,
    proposal.agencySnapshot.secondaryImageUrl,
  ]);

  /** Só logo (Configurações → primária ou snapshot); sem override da miniatura da proposta. */
  const displayAgencyLogoForBadge = useMemo(() => {
    if (isDashboard) {
      const live = companyAboutLive?.primaryImageUrl?.trim();
      if (live) return live;
    }
    return proposal.agencySnapshot.primaryImageUrl?.trim() || "";
  }, [isDashboard, companyAboutLive?.primaryImageUrl, proposal.agencySnapshot.primaryImageUrl]);

  /** Capa (secundária nas Configurações ou snapshot); só para destaque no cartão institucional. */
  const displayAgencyCoverUrl = useMemo(() => {
    if (isDashboard) {
      const live = companyAboutLive?.secondaryImageUrl?.trim();
      if (live) return live;
    }
    return proposal.agencySnapshot.secondaryImageUrl?.trim() || "";
  }, [isDashboard, companyAboutLive?.secondaryImageUrl, proposal.agencySnapshot.secondaryImageUrl]);

  const companyOverviewText =
    proposal.companyProfile.executiveSummary.trim() || proposal.companyProfile.companyProfile.trim();
  const companyOverviewParagraphs = splitReadableParagraphs(companyOverviewText);
  const agencySummaryParagraphs = splitReadableParagraphs(displayAgencySummary);

  const applyProposalPatch = async (
    patch: Partial<Omit<Proposal, "id" | "leadId" | "userId" | "createdAt">>,
  ) => {
    if (!isDashboard) return;
    await updateProposal(proposal.id, patch);
    onProposalChange?.({
      ...proposal,
      ...patch,
      companyProfile: patch.companyProfile ?? proposal.companyProfile,
      agencySnapshot: patch.agencySnapshot ?? proposal.agencySnapshot,
      evidences: patch.evidences ?? proposal.evidences,
      updatedAt: patch.updatedAt ?? proposal.updatedAt,
    });
  };

  const handleCopyLink = async () => {
    if (!publicHref || typeof window === "undefined") return;
    const url = `${window.location.origin}${publicHref}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setFieldError(null);
    try {
      const nextCompanyProfile = {
        ...proposal.companyProfile,
        source: "manual" as const,
        executiveSummary: profileDraft.executiveSummary.trim(),
      };
      await applyProposalPatch({
        companyProfile: nextCompanyProfile,
        updatedAt: Date.now(),
      });
      setEditingProfile(false);
    } catch (e) {
      console.error(e);
      setFieldError("Não foi possível salvar o perfil da empresa.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleImageReplace = async (slot: "lead" | "agency", file: File) => {
    if (!isDashboard) return;
    setUploadingSlot(slot);
    setFieldError(null);
    try {
      const result = await uploadUserProposalImage({
        file,
        userId: proposal.userId,
        leadId: proposal.leadId,
        proposalId: proposal.id,
        slotLabel: slot === "lead" ? "lead-image" : "agency-image",
      });
      if (!result.ok) {
        setFieldError(describeManualUploadFailure(result));
        return;
      }
      await applyProposalPatch({
        evidences: {
          ...(proposal.evidences || {}),
          leadImageUrl: slot === "lead" ? result.url : proposal.evidences?.leadImageUrl,
          agencyImageUrl: slot === "agency" ? result.url : proposal.evidences?.agencyImageUrl,
        },
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.error(e);
      setFieldError("Não foi possível enviar a imagem agora.");
    } finally {
      setUploadingSlot(null);
    }
  };

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-border bg-card shadow-xl dark:border-white/5 dark:bg-white/[0.02]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(190,149,83,0.18),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_34%)]" />
        <div className="relative grid gap-8 px-6 py-7 sm:px-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,30rem)] lg:items-stretch">
          <div className="flex min-h-0 flex-col space-y-5 lg:min-h-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full border-brand/20 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                Proposta comercial
              </Badge>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-brand">
                <FileText className="size-7 shrink-0 sm:size-4" aria-hidden />
                {proposal.lead.company}
              </div>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                  Proposta Comercial
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                  Uma proposta pensada exclusivamente para você.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <SummaryStat
                className="col-span-2 sm:col-span-1"
                label="Validade"
                value={formatDate(proposal.validUntilDate)}
                icon={CalendarDays}
                badge={status}
              />
              <SummaryStat
                label="Pontual"
                value={`${spotCount} plano${spotCount === 1 ? "" : "s"}`}
                icon={FileText}
              />
              <SummaryStat
                label="Recorrente"
                value={`${recurringCount} plano${recurringCount === 1 ? "" : "s"}`}
                icon={Building2}
              />
            </div>

            {fieldError ? (
              <div
                className={cn(
                  "border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200",
                  RR.stat,
                )}
              >
                {fieldError}
              </div>
            ) : null}

            {isDashboard ? (
              <div className="flex flex-wrap items-center gap-3">
                {publicHref ? (
                  <>
                    <Button
                      type="button"
                      variant="cta"
                      size="lg"
                      className={cn("gap-2", RR.btn)}
                      onClick={() => void handleCopyLink()}
                    >
                      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                      {copied ? "Link copiado" : "Copiar página pública"}
                    </Button>
                    <a
                      href={publicHref}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2 no-underline", RR.btn)}
                    >
                      <ExternalLink className="size-4" aria-hidden />
                      Abrir página
                    </a>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-col items-center justify-center lg:h-full lg:min-h-0 lg:items-center">
            <div className="flex items-center -space-x-11 py-4 sm:-space-x-[3.25rem] sm:py-5 lg:-space-x-[3.6rem] lg:py-2">
              <div className="relative z-10">
                <IdentityThumb
                  title={proposal.lead.company}
                  imageUrl={leadImageUrl}
                  fallback={proposal.lead.company}
                  tone="muted"
                  busy={uploadingSlot === "lead"}
                  replaceButtonSide="left"
                  onPickFile={
                    isDashboard ? (file) => void handleImageReplace("lead", file) : undefined
                  }
                />
              </div>
              <div className="relative z-20">
                <IdentityThumb
                  title={displayAgencyName}
                  imageUrl={displayAgencyImage}
                  fallback={displayAgencyName}
                  tone="brand"
                  busy={uploadingSlot === "agency"}
                  replaceButtonSide="right"
                  onPickFile={
                    isDashboard ? (file) => void handleImageReplace("agency", file) : undefined
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="overflow-hidden border-border bg-card shadow-xl dark:border-white/5 dark:bg-white/[0.02]">
          <CardHeader className="border-b border-border pb-5 dark:border-white/5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-bold text-foreground">Perfil da empresa</CardTitle>
                <CardDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Um resumo para contextualizar esta proposta.
                </CardDescription>
              </div>
              {isDashboard ? (
                <Button type="button" variant="outline" className="gap-2" onClick={() => setEditingProfile((prev) => !prev)}>
                  <Pencil className="size-4" aria-hidden />
                  {editingProfile ? "Fechar edição" : "Editar"}
                </Button>
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-6">
            {editingProfile && isDashboard ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="proposal-executive-summary">Resumo da empresa para o cliente</Label>
                  <Textarea
                    id="proposal-executive-summary"
                    value={profileDraft.executiveSummary}
                    onChange={(e) => setProfileDraft((prev) => ({ ...prev, executiveSummary: e.target.value }))}
                    className="min-h-32"
                    placeholder="Escreva um resumo curto, claro e personalizado para o lead."
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="cta" className="gap-2" onClick={() => void handleSaveProfile()} disabled={savingProfile}>
                    {savingProfile ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
                    {savingProfile ? "Salvando…" : "Salvar perfil"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <div
                    className={cn(
                      "border border-border bg-muted/35 p-4 text-sm leading-relaxed text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]",
                      RR.stat,
                    )}
                  >
                    {companyOverviewParagraphs.length ? (
                      <div className="space-y-3">
                        {companyOverviewParagraphs.map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                      </div>
                    ) : (
                      <p>Nenhum resumo foi definido ainda para este lead.</p>
                    )}
                  </div>
                </div>

              </>
            )}
          </CardContent>
        </Card>

        <Card
          className={cn(
            "overflow-hidden border-border bg-card shadow-xl dark:border-white/5 dark:bg-white/[0.02]",
            displayAgencyCoverUrl ? "gap-0 pt-0" : null,
          )}
        >
          {displayAgencyCoverUrl ? (
            <div className="relative aspect-[2.1/1] w-full min-h-[6.5rem] max-h-[11rem] sm:min-h-[7.5rem] sm:max-h-[12rem]">
              <Image
                src={displayAgencyCoverUrl}
                alt={`Capa institucional — ${displayAgencyName}`}
                fill
                className="object-cover"
                sizes="(max-width: 1280px) 100vw, 520px"
              />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card/90 via-card/20 to-transparent"
                aria-hidden
              />
            </div>
          ) : null}
          <CardHeader
            className={cn(
              "border-b border-border pb-5 dark:border-white/5",
              displayAgencyCoverUrl ? "pt-5" : null,
            )}
          >
            <CardTitle className="text-xl font-bold text-foreground">Sobre a {displayAgencyName}</CardTitle>
            <CardDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Conheca, em poucas linhas, quem conduz este projeto ao seu lado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "relative inline-flex h-12 w-12 shrink-0 overflow-hidden border border-brand/20 bg-brand/10 text-brand",
                  RR.logoMark,
                  displayAgencyLogoForBadge ? "p-1.5" : "items-center justify-center",
                )}
              >
                {displayAgencyLogoForBadge ? (
                  <Image
                    src={displayAgencyLogoForBadge}
                    alt={`Logo ${displayAgencyName}`}
                    fill
                    className="object-contain"
                    sizes="48px"
                  />
                ) : (
                  <Building2 className="size-5 shrink-0" aria-hidden />
                )}
              </div>
              <div>
                <p className="text-base font-bold text-foreground">{displayAgencyName}</p>
                <p className="text-sm text-muted-foreground">Apresentação institucional</p>
              </div>
            </div>

            <div
              className={cn(
                "border border-border bg-muted/35 p-5 text-sm leading-relaxed text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]",
                RR.panel,
              )}
            >
              {agencySummaryParagraphs.length ? (
                <div className="space-y-3">
                  {agencySummaryParagraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              ) : (
                "Em breve, este espaco trara uma apresentacao institucional da agencia."
              )}
            </div>

            <div
              className={cn(
                "border border-border bg-background/80 p-4 dark:border-white/10 dark:bg-white/[0.03]",
                RR.panel,
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Proposta para:
              </p>
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4">
                  <span>Cliente</span>
                  <span className="min-w-0 font-medium leading-5 text-foreground">{proposal.lead.name}</span>
                </div>
                <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4">
                  <span>Empresa</span>
                  <span className="min-w-0 font-medium leading-5 text-foreground">{proposal.lead.company}</span>
                </div>
                <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4">
                  <span>Validade</span>
                  <span className="min-w-0 font-medium leading-5 text-foreground">{remainingValidityLabel(proposal.validUntilDate)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
