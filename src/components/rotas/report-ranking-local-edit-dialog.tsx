"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, MinusCircle, Plus, PlusCircle, Star, Trash2 } from "lucide-react";

import { normalizeLeadBriefUrls } from "@/lib/gmb-website-split";
import { sanitizeCompetitorSnapshotForFirestore } from "@/lib/lead-competitor-firestore";
import type { LeadCompetitorSnapshot } from "@/types/lead";
import type { ReportGmbSnapshot, RotaDigitalReport } from "@/types/report";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Cartões de concorrente: mesma identidade (dourado / brand). */
const COMPETITOR_CARD_STYLE =
  "border-l-4 border-l-brand bg-brand/[0.09] dark:border-l-brand/90 dark:bg-brand/[0.14]";

/** Nota em meios pontos (0, 0.5, …, 5). */
function starRatingFromString(s: string): number {
  const n = parseRating(s);
  return Math.round(Math.min(5, Math.max(0, n)) * 2) / 2;
}

function formatStarRatingLabel(n: number): string {
  if (n === 0) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

type StarFill = "empty" | "half" | "full";

function fillForStar(display: number, starIndex: number): StarFill {
  if (display >= starIndex) return "full";
  if (display >= starIndex - 0.5) return "half";
  return "empty";
}

const STAR_ICON_CLASS = "size-4 shrink-0";

function StarRatingField({
  id,
  label,
  value,
  onChange,
  className,
  hideLabel,
  labelId,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  className?: string;
  /** Rótulo num <Label> externo — usar com `labelId`. */
  hideLabel?: boolean;
  labelId?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;
  const labelIdResolved = hideLabel ? (labelId ?? `${id}-rating-label`) : `${id}-label`;

  return (
    <div className={cn("space-y-1.5", className)} onMouseLeave={() => setHover(null)}>
      {!hideLabel ? (
        <p id={labelIdResolved} className="text-sm font-medium leading-none text-muted-foreground">
          {label}
        </p>
      ) : null}
      <div
        role="group"
        aria-labelledby={labelIdResolved}
        title="Meia estrela: clique na metade esquerda. Estrela inteira: metade direita."
        className="flex flex-wrap items-center gap-1"
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = fillForStar(shown, star);
          return (
            <span key={star} className="relative inline-flex h-4 w-4 shrink-0 align-middle">
              <Star
                className={cn(
                  STAR_ICON_CLASS,
                  "pointer-events-none absolute inset-0 text-muted-foreground/30 dark:text-muted-foreground/40",
                  "fill-none stroke-current stroke-[1.05]",
                )}
                aria-hidden
              />
              {fill === "full" ? (
                <Star
                  className={cn(
                    STAR_ICON_CLASS,
                    "pointer-events-none absolute inset-0 text-brand",
                    "fill-brand stroke-none",
                  )}
                  aria-hidden
                />
              ) : fill === "half" ? (
                <span className="pointer-events-none absolute inset-0 w-1/2 overflow-hidden">
                  <Star className={cn(STAR_ICON_CLASS, "text-brand", "fill-brand stroke-none")} aria-hidden />
                </span>
              ) : null}
              <span className="absolute inset-0 z-10 grid grid-cols-2">
                <button
                  type="button"
                  className="h-full min-h-6 min-w-0 cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background rounded-sm"
                  onMouseEnter={() => setHover(star - 0.5)}
                  onClick={() => onChange(star - 0.5)}
                  aria-label={`Nota ${formatStarRatingLabel(star - 0.5)} de 5`}
                />
                <button
                  type="button"
                  className="h-full min-h-6 min-w-0 cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background rounded-sm"
                  onMouseEnter={() => setHover(star)}
                  onClick={() => onChange(star)}
                  aria-label={`Nota ${star} de 5`}
                />
              </span>
            </span>
          );
        })}
        {value > 0 ? (
          <button
            type="button"
            className="ml-1 text-[10px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground"
            onClick={() => onChange(0)}
          >
            Limpar
          </button>
        ) : null}
      </div>
      <p className="text-[10px] tabular-nums text-muted-foreground" aria-live="polite">
        {value === 0 ? "Sem nota" : `Nota: ${formatStarRatingLabel(value)} / 5`}
      </p>
    </div>
  );
}

type CompetitorDraft = {
  key: string;
  placeId: string;
  name: string;
  address: string;
  ratingStr: string;
  reviewsStr: string;
  website: string;
  instagram: string;
  competitorType: "direct" | "indirect";
  localityTier: "unset" | "0" | "1" | "2";
};

function newManualPlaceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `manual-${crypto.randomUUID()}`;
  }
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyCompetitorDraft(): CompetitorDraft {
  const id = newManualPlaceId();
  return {
    key: id,
    placeId: id,
    name: "",
    address: "—",
    ratingStr: "0",
    reviewsStr: "0",
    website: "",
    instagram: "",
    competitorType: "direct",
    localityTier: "unset",
  };
}

function snapshotToDraft(c: LeadCompetitorSnapshot): CompetitorDraft {
  const tier =
    c.localityTier === 0 || c.localityTier === 1 || c.localityTier === 2
      ? String(c.localityTier) as "0" | "1" | "2"
      : "unset";
  return {
    key: c.placeId || newManualPlaceId(),
    placeId: c.placeId || newManualPlaceId(),
    name: c.name ?? "",
    address: (c.address ?? "").trim() || "—",
    ratingStr:
      typeof c.rating === "number" && Number.isFinite(c.rating)
        ? String(Math.round(Math.min(5, Math.max(0, c.rating)) * 2) / 2)
        : "0",
    reviewsStr:
      typeof c.reviewCount === "number" && Number.isFinite(c.reviewCount) ? String(c.reviewCount) : "0",
    website: typeof c.website === "string" ? c.website : "",
    instagram: typeof c.instagram === "string" ? c.instagram : "",
    competitorType: c.competitorType === "indirect" ? "indirect" : "direct",
    localityTier: tier,
  };
}

function parseRating(s: string): number {
  const n = Number(String(s).replace(",", ".").trim());
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, n));
}

function parseReviews(s: string): number {
  const n = parseInt(String(s).replace(/\D/g, "") || "0", 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

function draftToSnapshot(d: CompetitorDraft): LeadCompetitorSnapshot {
  const localityTier =
    d.localityTier === "0" || d.localityTier === "1" || d.localityTier === "2"
      ? (Number(d.localityTier) as 0 | 1 | 2)
      : undefined;
  const base: LeadCompetitorSnapshot = {
    name: d.name.trim() || "Concorrente",
    rating: parseRating(d.ratingStr),
    reviewCount: parseReviews(d.reviewsStr),
    address: d.address.trim() || "—",
    placeId: d.placeId.trim() || newManualPlaceId(),
    competitorType: d.competitorType,
    ...(localityTier !== undefined ? { localityTier } : {}),
    ...(d.website.trim() ? { website: d.website.trim() } : {}),
    ...(d.instagram.trim() ? { instagram: d.instagram.trim() } : {}),
  };
  return sanitizeCompetitorSnapshotForFirestore(base);
}

export type ReportRankingLocalEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: RotaDigitalReport;
  patchReport: (patch: Partial<RotaDigitalReport>) => Promise<boolean | void>;
};

export function ReportRankingLocalEditDialog({
  open,
  onOpenChange,
  report,
  patchReport,
}: ReportRankingLocalEditDialogProps) {
  const prevOpen = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [leadName, setLeadName] = useState("");
  const [leadRatingStr, setLeadRatingStr] = useState("");
  const [leadReviewsStr, setLeadReviewsStr] = useState("");
  const [leadWebsite, setLeadWebsite] = useState("");
  const [leadInstagram, setLeadInstagram] = useState("");
  const [competitors, setCompetitors] = useState<CompetitorDraft[]>([]);
  /** Concorrente expandido por `key`; ao abrir, expande todos se ≤3, senão recolhidos (só cabeçalho). */
  const [expandedCompetitor, setExpandedCompetitor] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open && !prevOpen.current) {
      setError(null);
      const gmb = report.gmbSnapshot;
      const briefUrls = normalizeLeadBriefUrls({
        websiteUrl: report.brief?.websiteUrl,
        instagramUrl: report.brief?.instagramUrl,
      });
      setLeadName(report.leadCompany?.trim() || "");
      setLeadRatingStr(
        typeof gmb?.gmbRating === "number" && Number.isFinite(gmb.gmbRating) ? String(gmb.gmbRating) : "",
      );
      setLeadReviewsStr(
        typeof gmb?.gmbReviewCount === "number" && Number.isFinite(gmb.gmbReviewCount)
          ? String(gmb.gmbReviewCount)
          : "",
      );
      setLeadWebsite((briefUrls.websiteUrl ?? gmb?.gmbListingWebsiteUrl ?? "").trim());
      setLeadInstagram((briefUrls.instagramUrl ?? gmb?.gmbListingInstagramUrl ?? "").trim());
      const list = report.competitorsSnapshot ?? [];
      const drafts = list.length > 0 ? list.map(snapshotToDraft) : [];
      setCompetitors(drafts);
      const expand: Record<string, boolean> = {};
      for (const d of drafts) {
        expand[d.key] = drafts.length <= 3;
      }
      setExpandedCompetitor(expand);
    }
    prevOpen.current = open;
  }, [open, report]);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const gmbBase = report.gmbSnapshot ?? ({} as ReportGmbSnapshot);
      const rating = parseRating(leadRatingStr);
      const reviews = parseReviews(leadReviewsStr);
      const wSite = leadWebsite.trim();
      const wIg = leadInstagram.trim();

      const fullGmb: ReportGmbSnapshot = {
        ...gmbBase,
        gmbRating: rating,
        gmbReviewCount: reviews,
        gmbListingWebsiteUrl: wSite,
        gmbListingInstagramUrl: wIg,
      };

      const snapshots = competitors.map(draftToSnapshot);

      const briefPatch = {
        websiteUrl: wSite || undefined,
        instagramUrl: wIg || undefined,
      };

      const ok = await patchReport({
        leadCompany: leadName.trim() || report.leadCompany,
        competitorsSnapshot: snapshots,
        gmbSnapshot: fullGmb,
        brief: briefPatch,
      });
      if (ok === false) {
        setError("Não foi possível guardar.");
        return;
      }
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  };

  const expandAllCompetitors = () => {
    setExpandedCompetitor((prev) => {
      const next = { ...prev };
      for (const c of competitors) next[c.key] = true;
      return next;
    });
  };

  const collapseAllCompetitors = () => {
    setExpandedCompetitor((prev) => {
      const next = { ...prev };
      for (const c of competitors) next[c.key] = false;
      return next;
    });
  };

  const toggleCompetitor = (key: string) => {
    setExpandedCompetitor((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[min(92vh,760px)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <div className="shrink-0 border-b border-border/50 bg-muted/20 px-5 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6 dark:border-white/10 dark:bg-white/[0.04]">
          <DialogHeader className="gap-2 space-y-0 p-0 pr-8 text-left">
            <DialogTitle className="text-lg">Editar ranking local</DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed">
              Ajuste o lead e os concorrentes. Ao guardar, as posições são recalculadas automaticamente (primeiro por
              número de avaliações, depois por nota). “Tem site” segue o URL de site próprio.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          <div className="space-y-4 rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.08] via-transparent to-transparent p-5 shadow-sm dark:border-emerald-500/20 dark:from-emerald-500/15">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)] dark:bg-emerald-400"
                aria-hidden
              />
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-900/90 dark:text-emerald-100/90">
                Lead (relatório)
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="rank-edit-lead-name">Nome exibido no ranking</Label>
                <Input
                  id="rank-edit-lead-name"
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  placeholder="Nome da empresa"
                  autoComplete="off"
                  className="bg-background/80 dark:bg-background/50"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-5">
                  <Label htmlFor="rank-edit-lead-reviews" className="text-muted-foreground">
                    Avaliações
                  </Label>
                  <Label id="rank-edit-lead-rating-label" className="text-muted-foreground">
                    Nota (estrelas)
                  </Label>
                </div>
                <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-5">
                  <Input
                    id="rank-edit-lead-reviews"
                    value={leadReviewsStr}
                    onChange={(e) => setLeadReviewsStr(e.target.value)}
                    inputMode="numeric"
                    placeholder="0"
                    className="bg-background/80 dark:bg-background/50"
                  />
                  <StarRatingField
                    id="rank-edit-lead-rating"
                    label="Nota (estrelas)"
                    hideLabel
                    labelId="rank-edit-lead-rating-label"
                    value={starRatingFromString(leadRatingStr)}
                    onChange={(n) => setLeadRatingStr(String(n))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rank-edit-lead-site">Site (URL)</Label>
                <Input
                  id="rank-edit-lead-site"
                  value={leadWebsite}
                  onChange={(e) => setLeadWebsite(e.target.value)}
                  placeholder="https://…"
                  autoComplete="off"
                  className="bg-background/80 dark:bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rank-edit-lead-ig">Instagram (URL)</Label>
                <Input
                  id="rank-edit-lead-ig"
                  value={leadInstagram}
                  onChange={(e) => setLeadInstagram(e.target.value)}
                  placeholder="https://instagram.com/…"
                  autoComplete="off"
                  className="bg-background/80 dark:bg-background/50"
                />
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-brand ring-2 ring-brand/25" aria-hidden />
                <p className="text-xs font-semibold uppercase tracking-wider text-foreground/80">Concorrentes</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {competitors.length > 0 ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={expandAllCompetitors}
                    >
                      <PlusCircle className="size-3.5 opacity-80" aria-hidden />
                      Expandir todos
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={collapseAllCompetitors}
                    >
                      <MinusCircle className="size-3.5 opacity-80" aria-hidden />
                      Recolher todos
                    </Button>
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    const next = emptyCompetitorDraft();
                    setCompetitors((prev) => [...prev, next]);
                    setExpandedCompetitor((e) => ({ ...e, [next.key]: true }));
                  }}
                >
                  <Plus className="size-3.5" aria-hidden />
                  Adicionar
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {competitors.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-5 py-8 text-center text-sm leading-relaxed text-muted-foreground dark:border-white/15 dark:bg-white/[0.03]">
                  Nenhum concorrente neste ranking. Use{" "}
                  <strong className="font-medium text-foreground/90">Adicionar</strong> para incluir negócios
                  manualmente.
                </p>
              ) : null}
              {competitors.map((row, idx) => {
                const isOpen = expandedCompetitor[row.key] === true;
                const summaryName = row.name.trim() || "Sem nome";
                const stars = starRatingFromString(row.ratingStr);
                const summaryBits = [
                  row.competitorType === "indirect" ? "Indireto" : "Direto",
                  parseReviews(row.reviewsStr) > 0 ? `${parseReviews(row.reviewsStr)} aval.` : null,
                  stars > 0 ? `${formatStarRatingLabel(stars)}★` : null,
                ].filter(Boolean);

                return (
                  <div
                    key={row.key}
                    className={cn(
                      "overflow-hidden rounded-xl border border-border/60 shadow-sm dark:border-white/10",
                      COMPETITOR_CARD_STYLE,
                    )}
                  >
                    <div className="flex items-stretch gap-0 bg-background/40 dark:bg-background/20">
                      <button
                        type="button"
                        onClick={() => toggleCompetitor(row.key)}
                        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-background/60 dark:hover:bg-white/[0.06]"
                        aria-expanded={isOpen}
                      >
                        <ChevronDown
                          className={cn(
                            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                            isOpen ? "rotate-0" : "-rotate-90",
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Concorrente {idx + 1}
                          </p>
                          <p className="truncate font-medium text-foreground">{summaryName}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{summaryBits.join(" · ")}</p>
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center border-l border-border/50 pr-2 dark:border-white/10">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            setCompetitors((prev) => prev.filter((_, i) => i !== idx));
                            setExpandedCompetitor((prev) => {
                              const next = { ...prev };
                              delete next[row.key];
                              return next;
                            });
                          }}
                          aria-label={`Remover concorrente ${idx + 1}`}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    </div>

                    {isOpen ? (
                      <div className="border-t border-border/50 bg-background/50 px-4 py-4 dark:border-white/10 dark:bg-background/30 sm:px-5 sm:py-5">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor={`rank-c-${row.key}-name`}>Nome</Label>
                            <Input
                              id={`rank-c-${row.key}-name`}
                              value={row.name}
                              onChange={(e) =>
                                setCompetitors((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)),
                                )
                              }
                              className="bg-background dark:bg-background/80"
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor={`rank-c-${row.key}-addr`}>Endereço (opcional)</Label>
                            <Input
                              id={`rank-c-${row.key}-addr`}
                              value={row.address}
                              onChange={(e) =>
                                setCompetitors((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, address: e.target.value } : r)),
                                )
                              }
                              className="bg-background dark:bg-background/80"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`rank-c-${row.key}-type`}>Tipo</Label>
                            <Select
                              value={row.competitorType}
                              onValueChange={(v) =>
                                setCompetitors((prev) =>
                                  prev.map((r, i) =>
                                    i === idx ? { ...r, competitorType: v as "direct" | "indirect" } : r,
                                  ),
                                )
                              }
                            >
                              <SelectTrigger id={`rank-c-${row.key}-type`} className="w-full min-w-0" size="sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="direct">Direto</SelectItem>
                                <SelectItem value="indirect">Indireto</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`rank-c-${row.key}-tier`}>Local (etiqueta)</Label>
                            <Select
                              value={row.localityTier}
                              onValueChange={(v) =>
                                setCompetitors((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? { ...r, localityTier: v as CompetitorDraft["localityTier"] }
                                      : r,
                                  ),
                                )
                              }
                            >
                              <SelectTrigger id={`rank-c-${row.key}-tier`} className="w-full min-w-0" size="sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unset">Automático / sem etiqueta</SelectItem>
                                <SelectItem value="0">Bairro</SelectItem>
                                <SelectItem value="1">Cidade</SelectItem>
                                <SelectItem value="2">Fora</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-5">
                              <Label htmlFor={`rank-c-${row.key}-reviews`} className="text-muted-foreground">
                                Avaliações
                              </Label>
                              <Label id={`rank-c-${row.key}-rating-label`} className="text-muted-foreground">
                                Nota (estrelas)
                              </Label>
                            </div>
                            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-5">
                              <Input
                                id={`rank-c-${row.key}-reviews`}
                                value={row.reviewsStr}
                                onChange={(e) =>
                                  setCompetitors((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, reviewsStr: e.target.value } : r)),
                                  )
                                }
                                inputMode="numeric"
                                className="bg-background dark:bg-background/80"
                              />
                              <StarRatingField
                                id={`rank-c-${row.key}-rating`}
                                label="Nota (estrelas)"
                                hideLabel
                                labelId={`rank-c-${row.key}-rating-label`}
                                value={starRatingFromString(row.ratingStr)}
                                onChange={(n) =>
                                  setCompetitors((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, ratingStr: String(n) } : r)),
                                  )
                                }
                              />
                            </div>
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor={`rank-c-${row.key}-site`}>Site (URL)</Label>
                            <Input
                              id={`rank-c-${row.key}-site`}
                              value={row.website}
                              onChange={(e) =>
                                setCompetitors((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, website: e.target.value } : r)),
                                )
                              }
                              placeholder="https://…"
                              className="bg-background dark:bg-background/80"
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor={`rank-c-${row.key}-ig`}>Instagram (URL)</Label>
                            <Input
                              id={`rank-c-${row.key}-ig`}
                              value={row.instagram}
                              onChange={(e) =>
                                setCompetitors((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, instagram: e.target.value } : r)),
                                )
                              }
                              placeholder="https://instagram.com/…"
                              className="bg-background dark:bg-background/80"
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="shrink-0 space-y-3 border-t border-border/60 bg-muted/15 px-5 py-4 sm:px-6 dark:border-white/10 dark:bg-white/[0.04]">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="w-full gap-2 sm:w-auto"
              onClick={() => void onSave()}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  A guardar…
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
