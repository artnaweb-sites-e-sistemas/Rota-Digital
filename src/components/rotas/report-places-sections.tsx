"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, ExternalLink, Globe, Loader2, Lock, MapPin, Pencil, RefreshCw, Star, Sparkles } from "lucide-react";

import { ReportRankingLocalEditDialog } from "@/components/rotas/report-ranking-local-edit-dialog";

import { buildCompetitorRanking, formatRankOrdinalPt } from "@/lib/competitor-ranking";
import { localityTierLabelPt } from "@/lib/locality-tier";
import { normalizeLeadBriefUrls } from "@/lib/gmb-website-split";
import { sanitizeCompetitorsForFirestore } from "@/lib/lead-competitor-firestore";
import { auth } from "@/lib/firebase";
import { resolveGoogleBusinessMapsUrl } from "@/lib/gmb-maps-url";
import { PLAN_FEATURES, type PlanId } from "@/lib/plan-limits";
import type { LeadCompetitorSnapshot } from "@/types/lead";
import type { RotaDigitalReport } from "@/types/report";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Casco visual alinhado a `ROTA_REPORT_SURFACE_SECTION` + `ROTA_REPORT_CARD_BOX` no relatório. */
const REPORT_SECTION_SURFACE =
  "border border-border bg-card/95 shadow-sm ring-1 ring-foreground/[0.04] print-white dark:border-border dark:bg-card dark:shadow-none dark:ring-white/[0.06]";
const REPORT_SECTION_CARD_PAD = "py-6 sm:py-7";

export type ReportPlacesSectionsProps = {
  report: RotaDigitalReport;
  isDashboard: boolean;
  plan: PlanId;
  patchReport: (patch: Partial<RotaDigitalReport>) => Promise<boolean | void>;
  /** Só o Admin Master vê e usa «Testar busca» (debug de Places). */
  showMasterPlacesSearchTest?: boolean;
  /** Abre o `PlanLimitModal` (secção GMB, plano Pro). */
  onRequestGmbUpgrade?: () => void;
  /** Abre o `PlanLimitModal` (ranking de concorrentes, plano Pro). */
  onRequestCompetitorUpgrade?: () => void;
};

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function RedesCell({
  rowName,
  instagramUrl,
  websiteUrl,
}: {
  rowName: string;
  instagramUrl?: string;
  websiteUrl?: string;
}) {
  const ig = instagramUrl?.trim();
  const site = websiteUrl?.trim();
  const inactive = "text-muted-foreground/25 pointer-events-none";

  return (
    <div className="flex items-center justify-center gap-1.5" role="group" aria-label={`Redes de ${rowName}`}>
      {ig ? (
        <a
          href={ig}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded p-0.5 text-pink-600 transition-opacity hover:opacity-85 dark:text-pink-400"
          title="Instagram"
          aria-label={`Instagram de ${rowName}`}
        >
          <InstagramGlyph className="size-4" />
        </a>
      ) : (
        <span className={cn("inline-flex rounded p-0.5", inactive)} title="Instagram não disponível" aria-hidden>
          <InstagramGlyph className="size-4" />
        </span>
      )}
      {site ? (
        <a
          href={site}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded p-0.5 text-sky-700 transition-opacity hover:opacity-85 dark:text-sky-400"
          title="Site"
          aria-label={`Site de ${rowName}`}
        >
          <Globe className="size-4" aria-hidden />
        </a>
      ) : (
        <span className={cn("inline-flex rounded p-0.5", inactive)} title="Site não disponível" aria-hidden>
          <Globe className="size-4" />
        </span>
      )}
    </div>
  );
}

function LocalityMicroTag({ tier }: { tier: 0 | 1 | 2 }) {
  const label = localityTierLabelPt(tier);
  const title =
    tier === 0
      ? "Endereço no mesmo bairro que o lead (GMB)"
      : tier === 1
        ? "Na mesma cidade do lead, fora do bairro ou bairro não coincidente no texto"
        : "Fora da cidade do lead";
  return (
    <span
      title={title}
      className="shrink-0 rounded-sm border border-border/40 bg-muted/20 px-1 py-px text-[8px] font-medium leading-none text-muted-foreground/88"
    >
      {label}
    </span>
  );
}

function StarRow({ value }: { value: number | undefined }) {
  const v = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(5, value)) : null;
  if (v == null) return <span className="text-muted-foreground">—</span>;
  const full = Math.floor(v);
  const half = v - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={`${v.toFixed(1)} estrelas`}>
      {Array.from({ length: full }, (_, i) => (
        <Star key={`f-${i}`} className="size-3.5 fill-current" aria-hidden />
      ))}
      {half ? <Star className="size-3.5 fill-current opacity-60" aria-hidden /> : null}
      {Array.from({ length: empty }, (_, i) => (
        <Star key={`e-${i}`} className="size-3.5 text-muted-foreground/35" aria-hidden />
      ))}
      <span className="ml-1 tabular-nums text-xs font-medium text-foreground">{v.toFixed(1)}</span>
    </span>
  );
}

function ScrollHintWrapper({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);
  const hintActiveRef = useRef(true);
  const [showEdgeHint, setShowEdgeHint] = useState(true);
  const rafRef = useRef<number | null>(null);
  const timeoutIdsRef = useRef<number[]>([]);
  const programmaticScrollRef = useRef(false);

  const dismissHint = useCallback(() => {
    if (!hintActiveRef.current) return;
    hintActiveRef.current = false;
    setShowEdgeHint(false);
    timeoutIdsRef.current.forEach((id) => clearTimeout(id));
    timeoutIdsRef.current = [];
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const syncCanScroll = () => {
      setCanScroll(el.scrollWidth > el.clientWidth + 4);
    };

    syncCanScroll();
    const ro = new ResizeObserver(syncCanScroll);
    ro.observe(el);

    const onUserGesture = () => dismissHint();
    el.addEventListener("touchstart", onUserGesture, { passive: true });
    el.addEventListener("pointerdown", onUserGesture);
    el.addEventListener("wheel", onUserGesture, { passive: true });

    const onScroll = () => {
      if (programmaticScrollRef.current) return;
      if (el.scrollLeft > 8) dismissHint();
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      ro.disconnect();
      el.removeEventListener("touchstart", onUserGesture);
      el.removeEventListener("pointerdown", onUserGesture);
      el.removeEventListener("wheel", onUserGesture);
      el.removeEventListener("scroll", onScroll);
    };
  }, [dismissHint]);

  useEffect(() => {
    if (!canScroll || !hintActiveRef.current) return;
    const el = scrollRef.current;
    if (!el) return;

    const mq = window.matchMedia("(max-width: 639.9px)");
    if (!mq.matches) return;

    let cancelled = false;

    const onMqChange = () => {
      if (!mq.matches) dismissHint();
    };
    mq.addEventListener("change", onMqChange);

    const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

    const animateScrollLeft = (from: number, to: number, durationMs: number) =>
      new Promise<void>((resolve) => {
        const start = performance.now();
        const step = (now: number) => {
          if (cancelled || !hintActiveRef.current) {
            programmaticScrollRef.current = false;
            resolve();
            return;
          }
          const t = Math.min(1, (now - start) / durationMs);
          programmaticScrollRef.current = true;
          el.scrollLeft = from + (to - from) * easeInOutQuad(t);
          if (t < 1) {
            rafRef.current = requestAnimationFrame(step);
          } else {
            programmaticScrollRef.current = false;
            rafRef.current = null;
            resolve();
          }
        };
        rafRef.current = requestAnimationFrame(step);
      });

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = window.setTimeout(() => {
          timeoutIdsRef.current = timeoutIdsRef.current.filter((x) => x !== id);
          resolve();
        }, ms);
        timeoutIdsRef.current.push(id);
      });

    void (async () => {
      while (!cancelled && hintActiveRef.current && mq.matches) {
        await sleep(1800);
        if (cancelled || !hintActiveRef.current || !mq.matches) break;

        const maxScroll = el.scrollWidth - el.clientWidth;
        if (maxScroll <= 6) break;

        const distance = Math.min(52, Math.max(28, maxScroll * 0.14));
        const from = el.scrollLeft;
        await animateScrollLeft(from, from + distance, 480);
        if (cancelled || !hintActiveRef.current) break;

        await sleep(320);
        if (cancelled || !hintActiveRef.current) break;

        await animateScrollLeft(el.scrollLeft, 0, 520);
        if (cancelled || !hintActiveRef.current) break;

        await sleep(1400);
      }
    })();

    return () => {
      cancelled = true;
      mq.removeEventListener("change", onMqChange);
      programmaticScrollRef.current = false;
      timeoutIdsRef.current.forEach((id) => clearTimeout(id));
      timeoutIdsRef.current = [];
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [canScroll, dismissHint]);

  return (
    <div className="relative">
      <div ref={scrollRef} className="overflow-x-auto rounded-lg border border-border/60 dark:border-white/10">
        {children}
      </div>
      {canScroll && showEdgeHint ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-[2] flex w-10 items-center justify-center bg-gradient-to-l from-card via-card/80 to-transparent sm:hidden">
          <ChevronRight className="size-4 animate-pulse text-muted-foreground" aria-hidden />
        </div>
      ) : null}
    </div>
  );
}

function LockedSectionOverlay({
  title,
  description,
  onPlanClick,
  children,
}: {
  title: string;
  description?: string;
  onPlanClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative select-none overflow-hidden rounded-md print-white", REPORT_SECTION_SURFACE)}>
      <div
        className="pointer-events-none opacity-30 blur-[2px] saturate-50 dark:opacity-25"
        aria-hidden
        tabIndex={-1}
      >
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/60 px-5 py-6 backdrop-blur-[2px] dark:bg-background/55">
        <div className="flex size-10 items-center justify-center rounded-full border border-border/60 bg-muted/80 shadow-sm dark:border-white/15 dark:bg-muted/50">
          <Lock className="size-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="max-w-md text-center">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {onPlanClick ? (
          <Button
            type="button"
            variant="cta"
            size="lg"
            onClick={onPlanClick}
            className="min-w-[12.5rem] gap-2 shadow-md dark:shadow-sm"
          >
            <Sparkles className="size-4" aria-hidden />
            Ver planos Pro
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ReportPlacesSections({
  report,
  plan,
  isDashboard,
  patchReport,
  showMasterPlacesSearchTest = false,
  onRequestGmbUpgrade,
  onRequestCompetitorUpgrade,
}: ReportPlacesSectionsProps) {
  const features = PLAN_FEATURES[plan];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rankingEditOpen, setRankingEditOpen] = useState(false);

  const gmb = report.gmbSnapshot;
  const competitors = report.competitorsSnapshot ?? [];

  const onTestSearch = useCallback(async () => {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      const user = auth?.currentUser;
      if (!user) {
        setErr("Inicie sessão para testar a busca.");
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/lead-places-analysis", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: report.leadId, includeCompetitors: true }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        gmb?: Record<string, unknown>;
        competitors?: RotaDigitalReport["competitorsSnapshot"];
        competitorsFetchedAt?: number;
      };
      if (!res.ok) {
        setErr(typeof body.error === "string" ? body.error : "Não foi possível testar a busca.");
        return;
      }
      const rawCompetitors = (Array.isArray(body.competitors) ? body.competitors : []) as LeadCompetitorSnapshot[];
      await patchReport({
        competitorsSnapshot: sanitizeCompetitorsForFirestore(rawCompetitors),
        competitorsFetchedAt:
          typeof body.competitorsFetchedAt === "number" ? body.competitorsFetchedAt : undefined,
        gmbSnapshot: {
          gmbFetchedAt:
            typeof body.gmb?.gmbFetchedAt === "number" ? body.gmb.gmbFetchedAt : gmb?.gmbFetchedAt,
          gmbRating: typeof body.gmb?.gmbRating === "number" ? body.gmb.gmbRating : gmb?.gmbRating,
          gmbReviewCount:
            typeof body.gmb?.gmbReviewCount === "number" ? body.gmb.gmbReviewCount : gmb?.gmbReviewCount,
          gmbHasListing:
            typeof body.gmb?.gmbHasListing === "boolean" ? body.gmb.gmbHasListing : gmb?.gmbHasListing,
          gmbPhotoCount:
            typeof body.gmb?.gmbPhotoCount === "number" ? body.gmb.gmbPhotoCount : gmb?.gmbPhotoCount,
          gmbBusinessStatus:
            typeof body.gmb?.gmbBusinessStatus === "string"
              ? body.gmb.gmbBusinessStatus
              : gmb?.gmbBusinessStatus,
          gmbOpenNow: typeof body.gmb?.gmbOpenNow === "boolean" ? body.gmb.gmbOpenNow : gmb?.gmbOpenNow,
          gmbGoogleMapsUri:
            typeof body.gmb?.gmbGoogleMapsUri === "string"
              ? body.gmb.gmbGoogleMapsUri
              : gmb?.gmbGoogleMapsUri,
          gmbPlaceId:
            typeof body.gmb?.gmbPlaceId === "string" ? body.gmb.gmbPlaceId : gmb?.gmbPlaceId,
          gmbFormattedAddress:
            typeof body.gmb?.gmbFormattedAddress === "string"
              ? body.gmb.gmbFormattedAddress
              : gmb?.gmbFormattedAddress,
          gmbCity: typeof body.gmb?.gmbCity === "string" ? body.gmb.gmbCity : gmb?.gmbCity,
          gmbSubLocality:
            typeof body.gmb?.gmbSubLocality === "string" ? body.gmb.gmbSubLocality : gmb?.gmbSubLocality,
          gmbListingWebsiteUrl:
            typeof body.gmb?.gmbListingWebsiteUrl === "string"
              ? body.gmb.gmbListingWebsiteUrl
              : gmb?.gmbListingWebsiteUrl,
          gmbListingInstagramUrl:
            typeof body.gmb?.gmbListingInstagramUrl === "string"
              ? body.gmb.gmbListingInstagramUrl
              : gmb?.gmbListingInstagramUrl,
        },
      });
    } catch {
      setErr("Erro de rede ao testar a busca.");
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    report.leadId,
    patchReport,
    gmb?.gmbFetchedAt,
    gmb?.gmbRating,
    gmb?.gmbReviewCount,
    gmb?.gmbHasListing,
    gmb?.gmbPhotoCount,
    gmb?.gmbBusinessStatus,
    gmb?.gmbOpenNow,
    gmb?.gmbGoogleMapsUri,
    gmb?.gmbPlaceId,
    gmb?.gmbFormattedAddress,
    gmb?.gmbCity,
    gmb?.gmbSubLocality,
    gmb?.gmbListingWebsiteUrl,
    gmb?.gmbListingInstagramUrl,
  ]);

  const gmbMapsUrl = useMemo(
    () =>
      resolveGoogleBusinessMapsUrl({
        googleMapsUri: gmb?.gmbGoogleMapsUri,
        placeResourceOrId: gmb?.gmbPlaceId,
      }),
    [gmb?.gmbGoogleMapsUri, gmb?.gmbPlaceId],
  );

  const ranking = useMemo(() => {
    const briefUrls = normalizeLeadBriefUrls({
      websiteUrl: report.brief?.websiteUrl,
      instagramUrl: report.brief?.instagramUrl,
    });
    /** Brief tem prioridade; GMB preenche site/Instagram quando o cadastro veio só do Maps (ex.: Instagram no campo “site”). */
    const leadUrls = {
      websiteUrl: briefUrls.websiteUrl ?? gmb?.gmbListingWebsiteUrl,
      instagramUrl: briefUrls.instagramUrl ?? gmb?.gmbListingInstagramUrl,
    };
    return buildCompetitorRanking({
      leadName: report.leadCompany,
      leadRating: gmb?.gmbRating,
      leadReviewCount: gmb?.gmbReviewCount,
      leadFormattedAddress: gmb?.gmbFormattedAddress,
      leadCity: gmb?.gmbCity,
      leadSubLocality: gmb?.gmbSubLocality,
      leadWebsiteUrl: leadUrls.websiteUrl,
      leadInstagramUrl: leadUrls.instagramUrl,
      competitors,
    });
  }, [
    report.leadCompany,
    report.brief?.websiteUrl,
    report.brief?.instagramUrl,
    gmb?.gmbListingWebsiteUrl,
    gmb?.gmbListingInstagramUrl,
    gmb?.gmbRating,
    gmb?.gmbReviewCount,
    gmb?.gmbFormattedAddress,
    gmb?.gmbCity,
    gmb?.gmbSubLocality,
    competitors,
  ]);

  const leadRank = ranking.find((r) => r.isLead);

  return (
    <div className="space-y-6">
      {report.placesAnalysisWarning ? (
        <p className="text-center text-xs text-muted-foreground">{report.placesAnalysisWarning}</p>
      ) : null}

      {!features.gmbAnalysis ? (
        isDashboard ? (
          <LockedSectionOverlay title="Google Meu Negócio" onPlanClick={onRequestGmbUpgrade}>
            <Card className="border-0 bg-transparent py-4 shadow-none ring-0 sm:py-5">
              <CardHeader className="space-y-0 pb-0">
                <div className="flex items-start justify-between gap-3 pb-4">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <MapPin className="size-4 shrink-0 text-brand" aria-hidden />
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground">
                      Google Meu Negócio
                    </CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 pb-1">
                <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5 lg:gap-6">
                  <div className="flex min-h-[4.5rem] flex-col justify-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.04]">
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground">
                      Nota
                    </span>
                    <StarRow value={4.2} />
                  </div>
                  <div className="flex min-h-[4.5rem] flex-col justify-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.04]">
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground">
                      Avaliações
                    </span>
                    <span className="text-base font-semibold tabular-nums tracking-tight text-foreground">87</span>
                  </div>
                  <div className="flex min-h-[4.5rem] flex-col justify-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.04]">
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground">
                      Fotos
                    </span>
                    <span className="text-base font-semibold tabular-nums tracking-tight text-foreground">12 fotos</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </LockedSectionOverlay>
        ) : null
      ) : (
        <Card className={cn(REPORT_SECTION_SURFACE, REPORT_SECTION_CARD_PAD, "print-white")}>
          <CardHeader className="space-y-0 pb-0">
            <div className="flex flex-wrap items-start justify-between gap-3 pb-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <MapPin className="size-4 shrink-0 text-brand" aria-hidden />
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground print:text-foreground">
                  Google Meu Negócio
                </CardTitle>
              </div>
              {gmbMapsUrl && gmb?.gmbHasListing !== false ? (
                <a
                  href={gmbMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "gap-1.5 self-center sm:self-auto sm:shrink-0 no-underline",
                  )}
                >
                  Acessar
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-0 pb-1">
            {gmb?.gmbHasListing === false ? (
              <div
                className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-200"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Este negócio não possui perfil no Google Meu Negócio — oportunidade crítica para captar pedidos
                  locais.
                </span>
              </div>
            ) : null}
            <div
              className={cn(
                "grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5 lg:gap-6",
                gmb?.gmbHasListing === false ? "opacity-60" : "",
              )}
            >
              <div className="flex min-h-[4.5rem] flex-col justify-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.04]">
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground print:text-foreground">
                  Nota
                </span>
                <StarRow value={gmb?.gmbRating} />
              </div>
              <div className="flex min-h-[4.5rem] flex-col justify-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.04]">
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground print:text-foreground">
                  Avaliações
                </span>
                <span className="text-base font-semibold tabular-nums tracking-tight text-foreground">
                  {typeof gmb?.gmbReviewCount === "number" ? gmb.gmbReviewCount.toLocaleString("pt-BR") : "—"}
                </span>
              </div>
              <div className="flex min-h-[4.5rem] flex-col justify-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.04]">
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground print:text-foreground">
                  Fotos
                </span>
                <span className="text-base font-semibold tabular-nums tracking-tight text-foreground">
                  {typeof gmb?.gmbPhotoCount === "number" ? `${gmb.gmbPhotoCount} fotos` : "—"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!features.competitorAnalysis ? (
        isDashboard ? (
          <LockedSectionOverlay
            title="Ranking dos concorrentes"
            onPlanClick={onRequestCompetitorUpgrade}
          >
            <Card className="border-0 bg-transparent py-4 shadow-none ring-0 sm:py-5">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-brand" aria-hidden />
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground">
                    Ranking dos concorrentes
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pb-1">
                <div className="overflow-hidden rounded-lg border border-border/60 dark:border-white/10">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-transparent dark:bg-white/[0.04]">
                        <TableHead className="w-12 text-[10px] font-bold uppercase tracking-wider">#</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-wider">Nome</TableHead>
                        <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider">Nota</TableHead>
                        <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider">Avaliações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { pos: 1, name: "Empresa Exemplo A", rating: 4.8, reviews: 210 },
                        { pos: 2, name: "Empresa Exemplo B", rating: 4.5, reviews: 142 },
                        { pos: 3, name: "Seu negócio", rating: 4.2, reviews: 87, isLead: true },
                        { pos: 4, name: "Empresa Exemplo C", rating: 3.9, reviews: 65 },
                      ].map((r) => (
                        <TableRow
                          key={r.pos}
                          className={cn(
                            "dark:border-white/5",
                            r.isLead
                              ? "border-brand/50 bg-brand/10 font-medium dark:border-brand/40 dark:bg-brand/15"
                              : "",
                          )}
                        >
                          <TableCell className="text-[11px] font-bold tabular-nums text-foreground/80">{r.pos}º</TableCell>
                          <TableCell className="text-foreground">{r.name}</TableCell>
                          <TableCell className="text-right">
                            <StarRow value={r.rating} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.reviews}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </LockedSectionOverlay>
        ) : null
      ) : (
        <Card className={cn("relative", REPORT_SECTION_SURFACE, REPORT_SECTION_CARD_PAD, "print-white")}>
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-brand" aria-hidden />
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground print:text-foreground">
                  Ranking dos concorrentes
                </CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {leadRank && competitors.length > 0 ? (
                  <Badge
                    variant="secondary"
                    className="border border-brand/40 bg-brand/10 text-[11px] font-semibold text-foreground dark:border-brand/35 dark:bg-brand/15"
                    title="Ordenação: quantidade de avaliações primeiro, depois nota média — não é a posição na pesquisa do Google Maps."
                  >
                    {formatRankOrdinalPt(leadRank.position)} de {ranking.length} neste comparativo
                  </Badge>
                ) : null}
                {isDashboard && showMasterPlacesSearchTest ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={busy}
                    onClick={() => void onTestSearch()}
                    title="Só Admin Master: reexecutar a busca no Google Places"
                  >
                    {busy ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <RefreshCw className="size-3.5" aria-hidden />
                    )}
                    Testar busca
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pb-12 pt-0 sm:pb-14">
            {err ? <p className="text-xs text-destructive">{err}</p> : null}
            <ScrollHintWrapper>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-transparent dark:bg-white/[0.04]">
                    <TableHead className="w-12 text-[10px] font-bold uppercase tracking-wider">#</TableHead>
                    <TableHead className="min-w-[10rem] text-[10px] font-bold uppercase tracking-wider">Nome</TableHead>
                    <TableHead className="w-[5.5rem] text-center text-[10px] font-bold uppercase tracking-wider">
                      Concorrente
                    </TableHead>
                    <TableHead className="w-[4.5rem] text-center text-[10px] font-bold uppercase tracking-wider">
                      Redes
                    </TableHead>
                    <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider">Nota</TableHead>
                    <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider">Avaliações</TableHead>
                    <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider">Tem Site</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.map((row) => (
                    <TableRow
                      key={row.isLead ? `lead-${row.position}` : row.placeId ?? `pos-${row.position}`}
                      className={cn(
                        "h-12 dark:border-white/5 sm:h-auto",
                        row.isLead
                          ? "border-brand/50 bg-brand/10 font-medium dark:border-brand/40 dark:bg-brand/15"
                          : "",
                      )}
                    >
                      <TableCell className="py-3 text-[11px] font-bold tabular-nums text-foreground/80 sm:py-2">
                        {formatRankOrdinalPt(row.position)}
                      </TableCell>
                      <TableCell className="max-w-[18rem] py-3 text-foreground sm:py-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span className="min-w-0 truncate">{row.name}</span>
                          {row.localityTier === 0 || row.localityTier === 1 || row.localityTier === 2 ? (
                            <LocalityMicroTag tier={row.localityTier} />
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="p-2 py-3 text-center align-middle sm:py-2">
                        {row.isLead ? (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        ) : row.competitorType === "direct" ? (
                          <Badge
                            variant="secondary"
                            className="border border-emerald-500/35 bg-emerald-500/10 text-[9px] font-semibold text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200"
                            title="Mesmo nicho (nome ou tipo Google alinhado ao lead)"
                          >
                            Direto
                          </Badge>
                        ) : row.competitorType === "indirect" ? (
                          <Badge
                            variant="secondary"
                            className="border border-amber-500/35 bg-amber-500/10 text-[9px] font-semibold text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100"
                            title="Nicho relacionado (ex.: academia no comparativo de pilates)"
                          >
                            Indireto
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground" title="Dado não disponível neste relatório">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="p-2 py-3 align-middle sm:py-2">
                        <RedesCell
                          rowName={row.name}
                          instagramUrl={row.instagramUrl}
                          websiteUrl={row.websiteUrl}
                        />
                      </TableCell>
                      <TableCell className="py-3 text-right sm:py-2">
                        <StarRow value={row.rating} />
                      </TableCell>
                      <TableCell className="py-3 text-right tabular-nums sm:py-2">
                        {typeof row.reviewCount === "number" ? row.reviewCount.toLocaleString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell className="py-3 text-right sm:py-2">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] font-medium",
                            row.hasWebsite
                              ? "border border-emerald-600/45 bg-emerald-600/12 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200"
                              : "border border-red-600/45 bg-red-600/12 text-red-900 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200",
                          )}
                        >
                          {row.hasWebsite ? "sim" : "não"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollHintWrapper>
            {competitors.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sem concorrentes encontrados para este lead. Isso pode acontecer quando o lead não tem GMB com
                localização ou quando a busca do Google Places não retornou resultados na área.
              </p>
            ) : null}
          </CardContent>
          {isDashboard ? (
            <>
              <ReportRankingLocalEditDialog
                open={rankingEditOpen}
                onOpenChange={setRankingEditOpen}
                report={report}
                patchReport={patchReport}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="no-print absolute bottom-3 right-3 z-[6] size-8 rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-foreground sm:bottom-4 sm:right-4"
                aria-label="Editar ranking dos concorrentes (lead e concorrentes)"
                onClick={() => setRankingEditOpen(true)}
              >
                <Pencil className="size-3.5" aria-hidden />
              </Button>
            </>
          ) : null}
        </Card>
      )}
    </div>
  );
}
