"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SVGProps,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { getReport, updateReport } from "@/lib/reports";
import { getUserReportCtaSettings } from "@/lib/user-settings";
import { resolveReportCtas } from "@/lib/report-cta";
import { RotaDigitalReport, DigitalChannel, DiagnosticScore } from "@/types/report";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Download,
  Loader2,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Star,
  ArrowRight,
  Link2,
  Copy,
  ExternalLink,
  Globe,
  Pencil,
  Save,
  X,
  Bot,
  Compass,
  Palette,
  Filter,
  Lightbulb,
  MessageSquare,
  Tag,
  ClipboardList,
  Images,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/link-button";
import BorderGlow from "@/components/BorderGlow";
import { CardSpotlight } from "@/components/ui/card-spotlight";
import { cn } from "@/lib/utils";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import type { UserReportCtaSettings } from "@/types/user-settings";

const PRIORITY_COLORS: Record<string, string> = {
  Alta: "bg-red-500/25 text-red-200 border border-red-400/45",
  Média: "bg-amber-500/20 text-amber-200 border border-amber-400/40",
  Baixa: "bg-emerald-500/20 text-emerald-200 border border-emerald-400/40",
};

/** Borda do BorderGlow em repouso (antes do hover), alinhada à prioridade. */
const PRIORITY_FRAME_BORDER: Record<string, string> = {
  Alta: "border-red-500/35",
  Média: "border-yellow-500/35",
  Baixa: "border-green-500/35",
};

/** Mesmo visual da pill “WEBSITE” / “Instagram” nas evidências — rótulo em caixa alta (sutil). */
const TOPIC_PILL_CLASS =
  "inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide leading-none text-zinc-300";

/** Rótulo ao lado de ícone na pill — desce o texto para alinhar ao centro óptico do glifo. */
const TOPIC_PILL_LABEL_NEXT_TO_ICON = "translate-y-0.5";

/** Mini wrapper de ícone para cabeçalhos de seção (estilo Bento). */
function SectionHeaderIcon({
  Icon,
  tone = "neutral",
}: {
  Icon: LucideIcon;
  tone?: "neutral" | "indigo" | "yellow" | "purple";
}) {
  return (
    <div
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
        tone === "indigo" && "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
        tone === "yellow" && "border-yellow-500/35 bg-yellow-500/10 text-yellow-400",
        tone === "purple" && "border-purple-500/35 bg-purple-500/10 text-purple-400",
        tone === "neutral" && "border-zinc-700 bg-zinc-800 text-zinc-400",
      )}
    >
      <Icon size={14} />
    </div>
  );
}

/** Glifo oficial do Instagram (marca), escala com `className` (ex.: size-3.5). */
function InstagramBrandGlyph(props: SVGProps<SVGSVGElement>) {
  const { className, ...rest } = props;
  return (
    <svg viewBox="0 0 24 24" className={cn("shrink-0", className)} {...rest}>
      <path
        fill="currentColor"
        d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"
      />
    </svg>
  );
}

/**
 * Casco dos blocos principais: só padding vertical extra no Card (sem -mx / calc — isso “comia” a margem lateral).
 */
const ROTA_REPORT_CARD_BOX = "py-6 sm:py-7";

/** Linha de apoio sob o título do card (tom e escala iguais no relatório). */
const ROTA_CARD_SUBTITLE =
  "max-w-prose text-sm font-normal leading-relaxed text-zinc-400";

type RotaHeaderIconTone = "indigo" | "yellow" | "purple" | "green" | "red" | "blue";

const ROTA_HEADER_ICON_SHELL: Record<RotaHeaderIconTone, string> = {
  indigo: "border-indigo-400/35 bg-indigo-500/10",
  yellow: "border-yellow-500/35 bg-yellow-500/10",
  purple: "border-purple-500/35 bg-purple-500/10",
  green: "border-emerald-500/35 bg-emerald-500/10",
  red: "border-red-500/35 bg-red-500/10",
  blue: "border-blue-400/35 bg-blue-500/10",
};

function RotaHeaderIcon({ tone, children }: { tone: RotaHeaderIconTone; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
        ROTA_HEADER_ICON_SHELL[tone],
      )}
    >
      {children}
    </div>
  );
}

const MATURITY_CONFIG = {
  Iniciante: { color: "text-orange-400", bar: "bg-orange-500", range: "0.0-3.9" },
  Intermediário: { color: "text-yellow-400", bar: "bg-yellow-500", range: "4.0-6.9" },
  Avançado: { color: "text-green-400", bar: "bg-green-500", range: "7.0-10.0" },
};

function formatReadableParagraphs(text?: string): string {
  if (!text) return "";

  let normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  normalized = normalized
    .replace(/\s+(Para (?:chegar a 10\/10|um 10\/10|ficar 10\/10))/gi, "\n\n$1")
    .replace(/\s+(O que falta(?: para .*?)?10\/10)/gi, "\n\n$1")
    .replace(/\s+(Enquanto )/g, "\n\n$1")
    .replace(/\n{3,}/g, "\n\n");

  if (normalized.includes("\n\n")) {
    return normalized;
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentences.length >= 3) {
    return `${sentences.slice(0, 2).join(" ")}\n\n${sentences.slice(2).join(" ")}`.trim();
  }

  if (sentences.length === 2 && normalized.length > 180) {
    return `${sentences[0]}\n\n${sentences[1]}`.trim();
  }

  return normalized;
}

function withSnapshotParams(src?: string, params?: Record<string, string | number | undefined>): string | undefined {
  if (!src || !src.startsWith("/api/instagram-profile-snapshot")) return src;
  try {
    const url = new URL(src, "http://localhost");
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === "") return;
      url.searchParams.set(key, String(value));
    });
    return `${url.pathname}${url.search}`;
  } catch {
    return src;
  }
}

function extractInstagramHandleFromInput(input?: string): string | undefined {
  if (!input?.trim()) return undefined;
  const raw = input.trim();
  if (/^@?[a-zA-Z0-9._]{1,30}$/.test(raw)) {
    return raw.replace(/^@+/, "").toLowerCase();
  }
  try {
    const normalized = raw.startsWith("http://") || raw.startsWith("https://")
      ? raw
      : `https://${raw.replace(/^\/+/, "")}`;
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "instagram.com" && host !== "instagr.am") return undefined;
    const segment = parsed.pathname.split("/").map((part) => part.trim()).filter(Boolean)[0];
    if (!segment) return undefined;
    return segment.replace(/^@+/, "").toLowerCase();
  } catch {
    return undefined;
  }
}

function hrefForBriefWebsite(url?: string): string | undefined {
  const t = url?.trim();
  if (!t) return undefined;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

function hrefForBriefInstagram(input?: string): string | undefined {
  const t = input?.trim();
  if (!t) return undefined;
  if (/^https?:\/\//i.test(t)) return t;
  const handle = extractInstagramHandleFromInput(t);
  if (handle) return `https://www.instagram.com/${handle}/`;
  return `https://${t.replace(/^\/+/, "")}`;
}

function buildInstagramEvidenceSrc(report: RotaDigitalReport): string | undefined {
  const stored = report.evidences?.instagramSnapshotUrl;
  if (stored) return stored;

  const diagnosticFallback = report.diagnosticScores?.find((item) => {
    const topic = item.topic.toLowerCase();
    return (
      Boolean(item.evidenceImageUrl) &&
      (topic.includes("instagram") || topic.includes("rede") || topic.includes("consist"))
    );
  })?.evidenceImageUrl;
  if (diagnosticFallback) return diagnosticFallback;

  const handle = extractInstagramHandleFromInput(report.brief?.instagramUrl);
  if (handle) {
    return `/api/instagram-profile-snapshot?handle=${encodeURIComponent(handle)}`;
  }

  return report.evidences?.instagramProfileImageUrl;
}

/** Capturas de página (Microlink etc.): cabem inteiras no quadro com object-contain, sem “scroll” no hover. */
function isLikelySitePageSnapshot(src?: string): boolean {
  if (!src) return false;
  const lower = src.toLowerCase();
  if (lower.includes("instagram-profile-snapshot")) return false;
  if (lower.includes("cdninstagram.com") || lower.includes("fbcdn.net")) return false;
  return lower.includes("microlink.io");
}

function MaturityGauge({ score, level }: { score: number; level: string }) {
  const config = MATURITY_CONFIG[level as keyof typeof MATURITY_CONFIG] || MATURITY_CONFIG["Iniciante"];
  const normalized = Math.max(0, Math.min(10, score));
  return (
    <div className="space-y-2.5">
      <div className="flex items-end justify-between gap-2">
        <span className={`text-4xl font-bold tabular-nums ${config.color}`}>
          {normalized.toFixed(1)}
        </span>
        <span className="pb-1 text-sm text-zinc-500">/10</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${config.bar}`}
          style={{ width: `${normalized * 10}%` }}
        />
      </div>
      <Badge
        className={`w-fit border ${config.color} bg-transparent ${config.bar.replace("bg-", "border-")}/30`}
      >
        {level}
      </Badge>
    </div>
  );
}

function getScoreBadgeClass(score: number): string {
  if (score < 4) return "bg-red-500/20 text-red-300 border-red-400/40";
  if (score < 7) return "bg-yellow-500/20 text-yellow-300 border-yellow-400/40";
  return "bg-green-500/20 text-green-300 border-green-400/40";
}

/** BorderGlow do tópico: mesmas faixas do badge (< 4 vermelho, < 7 amarelo, senão verde). */
function getDiagnosticTopicGlow(score: number): {
  glowColor: string;
  colors: string[];
  frameClass: string;
} {
  if (score < 4) {
    return {
      glowColor: "0 72 58",
      colors: ["#f87171", "#fb7185", "#fca5a5"],
      frameClass: "border-red-500/35",
    };
  }
  if (score < 7) {
    return {
      glowColor: "48 92 60",
      colors: ["#facc15", "#f59e0b", "#fde68a"],
      frameClass: "border-yellow-500/35",
    };
  }
  return {
    glowColor: "142 55 52",
    colors: ["#4ade80", "#34d399", "#86efac"],
    frameClass: "border-green-500/35",
  };
}

/** Remove trechos como "(nota 3.5/10)" na linha gerada pela pesquisa automática. */
function stripResearchNoteScoreParen(line: string): string {
  return line
    .replace(/\s*\(nota\s*[\d.,]+\s*\/\s*10\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Remove rótulo repetido no corpo (o card já tem o cabeçalho WEBSITE / INSTAGRAM). */
function stripResearchNoteChannelPrefix(line: string, kind: "website" | "instagram"): string {
  const trimmed = line.trim();
  if (!trimmed) return trimmed;
  if (kind === "website") {
    return trimmed.replace(/^(website|site)\s*:\s*/i, "").trim();
  }
  return trimmed.replace(/^instagram\s*:\s*/i, "").trim();
}

function parseResearchNotes(text?: string): {
  website: string;
  instagram: string;
  general: string[];
} {
  if (!text) {
    return { website: "", instagram: "", general: [] };
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let website = "";
  let instagram = "";
  const general: string[] = [];

  for (const line of lines) {
    const normalizedLine = line
      .replace(/\*\*/g, "")
      .replace(/^#+\s*/, "")
      .replace(/^Validação automática:?$/i, "")
      .trim();
    if (!normalizedLine) continue;
    const lower = normalizedLine.toLowerCase();
    if (lower.startsWith("website") || lower.startsWith("site")) {
      website = normalizedLine;
      continue;
    }
    if (lower.startsWith("instagram")) {
      instagram = normalizedLine;
      continue;
    }
    general.push(normalizedLine);
  }

  return {
    website: stripResearchNoteChannelPrefix(
      stripResearchNoteScoreParen(website),
      "website"
    ),
    instagram: stripResearchNoteChannelPrefix(
      stripResearchNoteScoreParen(instagram),
      "instagram"
    ),
    general,
  };
}

function parseInstagramMetricFromText(text: string, type: "followers" | "following" | "posts"): number | undefined {
  const pattern =
    type === "followers"
      ? /([\d.,]+)\s*seguidores?/i
      : type === "following"
        ? /([\d.,]+)\s*seguindo/i
        : /([\d.,]+)\s*(?:posts?|publicações)/i;
  const match = text.match(pattern)?.[1];
  if (!match) return undefined;
  const numeric = Number(match.replace(/[.,]/g, ""));
  return Number.isFinite(numeric) ? numeric : undefined;
}

function alignInstagramNoteForDisplay(
  note: string,
  report: RotaDigitalReport
): string {
  let result = note || "";
  const sources = [
    report.evidences?.instagramBioExcerpt || "",
    report.evidences?.researchNotes || "",
  ].filter(Boolean);
  const combined = sources.join(" ");
  const followers = parseInstagramMetricFromText(combined, "followers");
  const following = parseInstagramMetricFromText(combined, "following");
  const posts = parseInstagramMetricFromText(combined, "posts");

  if (typeof followers === "number" && followers > 0) {
    result = result.replace(/[\d.,]+\s*seguidores?/gi, `${followers.toLocaleString("pt-BR")} seguidores`);
    result = result.replace(/['"]?0\s*seguidores['"]?/gi, `${followers.toLocaleString("pt-BR")} seguidores`);
  }
  if (typeof following === "number" && following > 0) {
    result = result.replace(/[\d.,]+\s*seguindo/gi, `${following.toLocaleString("pt-BR")} seguindo`);
    result = result.replace(/['"]?0\s*seguindo['"]?/gi, `${following.toLocaleString("pt-BR")} seguindo`);
  }
  if (typeof posts === "number" && posts > 0) {
    result = result.replace(/[\d.,]+\s*(posts|publicações)/gi, `${posts.toLocaleString("pt-BR")} posts`);
    result = result.replace(/['"]?0\s*(posts|publicações)['"]?/gi, `${posts.toLocaleString("pt-BR")} posts`);
  }
  const finalLink = report.evidences?.instagramBioLinkResolvedUrl || report.evidences?.instagramBioLinkUrl;
  if (finalLink) {
    result = result
      .replace(/link na bio não foi verificado[^.]*\./gi, `O link da bio foi verificado e leva para ${finalLink}.`)
      .replace(/não foi verificado para o destino final[^.]*\./gi, `O link da bio foi verificado e leva para ${finalLink}.`);
  }
  if ((followers ?? 0) > 0 || (posts ?? 0) > 0) {
    result = result
      .replace(/perfil[^.]*vazio[^.]*\./gi, "")
      .replace(/sem conteúdo ativo[^.]*\./gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return result;
}

function EvidenceImage({
  src,
  alt,
  className,
  frameClassName,
  hoverScroll = false,
  initialOffsetRatio = 0,
  fitContain = false,
  fitContainMode = "width",
}: {
  src?: string;
  alt: string;
  className?: string;
  frameClassName?: string;
  hoverScroll?: boolean;
  /** Deslocamento inicial em repouso (0–1 do overflow). Preferir 0 para não cortar o topo da captura. */
  initialOffsetRatio?: number;
  /** Encolhe a captura inteira dentro do quadro (site/Microlink), sem crop tipo zoom. */
  fitContain?: boolean;
  /** `contain`: imagem inteira visível; `cover`: preenche a box (pode cortar bordas). */
  fitContainMode?: "width" | "height" | "cover";
}) {
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [restOffset, setRestOffset] = useState(0);
  const [transitionMs, setTransitionMs] = useState(2200);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const resolvedSrc = (() => {
    if (!src) return src;
    try {
      const parsed = new URL(src);
      const host = parsed.hostname.toLowerCase();
      const isInstagramAsset =
        host === "cdninstagram.com" ||
        host.endsWith(".cdninstagram.com") ||
        host === "fbcdn.net" ||
        host.endsWith(".fbcdn.net");
      return isInstagramAsset
        ? `/api/image-proxy?url=${encodeURIComponent(src)}`
        : src;
    } catch {
      return src;
    }
  })();

  const recalcScroll = useCallback(() => {
    const container = containerRef.current;
    const image = imageRef.current;
    if (!container || !image) return;

    const ch = container.offsetHeight;
    if (ch <= 0) return;

    const ih = image.offsetHeight;
    const overflow = Math.max(0, ih - ch);
    setScrollOffset(overflow);
    setRestOffset(Math.min(overflow, Math.max(0, overflow * initialOffsetRatio)));
    setTransitionMs(Math.min(7000, Math.max(2200, overflow * 8)));
  }, [initialOffsetRatio]);

  /** Scroll no hover: modo scroll “clássico” ou `fitContain` só em `cover` (box preenchida + pan vertical). */
  const scrollMeasureActive =
    hoverScroll && (!fitContain || (fitContain && fitContainMode === "cover"));

  useEffect(() => {
    setFailed(false);
    setHovered(false);
    setScrollOffset(0);
    setRestOffset(0);
  }, [resolvedSrc, initialOffsetRatio]);

  useLayoutEffect(() => {
    if (!scrollMeasureActive) return;
    const img = imageRef.current;
    if (img?.complete && img.naturalHeight > 0) {
      recalcScroll();
    }
  }, [scrollMeasureActive, resolvedSrc, recalcScroll]);

  useEffect(() => {
    if (!scrollMeasureActive) return;
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => recalcScroll());
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollMeasureActive, recalcScroll]);

  if (!resolvedSrc || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-zinc-700 bg-zinc-950/40 px-3 text-center text-xs text-zinc-500">
        Sem imagem disponível
      </div>
    );
  }

  if (fitContain) {
    if (fitContainMode === "cover") {
      if (hoverScroll) {
        return (
          <div
            ref={containerRef}
            className={`${frameClassName || ""} group relative min-h-0 overflow-hidden`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <img
              key={`${resolvedSrc || "img"}-cover-scroll`}
              ref={imageRef}
              src={resolvedSrc}
              alt={alt}
              className={`absolute left-0 right-0 top-0 block h-auto min-h-full w-full object-cover object-top ${className || ""}`}
              onError={() => setFailed(true)}
              onLoad={recalcScroll}
              style={{
                objectFit: "cover",
                objectPosition: "top center",
                transform: `translateY(-${
                  hovered && scrollOffset > 0
                    ? (restOffset > 0 ? 0 : scrollOffset)
                    : restOffset
                }px)`,
                transition: `transform ${transitionMs}ms ease-in-out`,
                willChange: "transform",
              }}
            />
            {scrollOffset > 0 ? (
              <>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-zinc-950/65 to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-30" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-zinc-950/80 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-20" />
              </>
            ) : null}
          </div>
        );
      }

      return (
        <div className={`${frameClassName || ""} relative min-h-0 overflow-hidden`}>
          <img
            key={`${resolvedSrc || "img"}-cover`}
            src={resolvedSrc}
            alt={alt}
            className={`absolute inset-0 h-full w-full object-cover object-top ${className || ""}`}
            onError={() => setFailed(true)}
            style={{
              minHeight: "auto",
              objectFit: "cover",
              objectPosition: "top center",
            }}
          />
        </div>
      );
    }

    const containClass =
      fitContainMode === "height"
        ? "h-full w-full object-contain object-top"
        : "h-auto w-full max-w-full object-contain object-top";

    return (
      <div
        className={`${frameClassName || ""} relative flex min-h-0 items-start justify-center overflow-hidden`}
      >
        <img
          key={`${resolvedSrc || "img"}-contain`}
          src={resolvedSrc}
          alt={alt}
          className={`${containClass} ${className || ""}`}
          onError={() => setFailed(true)}
          style={{
            minHeight: "auto",
            objectFit: "contain",
            objectPosition: "top center",
          }}
        />
      </div>
    );
  }

  if (!hoverScroll) {
    return (
      <img
        src={resolvedSrc}
        alt={alt}
        className={className}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={`${frameClassName || ""} group relative overflow-hidden`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        key={`${resolvedSrc || "img"}-scroll`}
        ref={imageRef}
        src={resolvedSrc}
        alt={alt}
        className={`block h-auto w-full max-w-full align-top ${className || ""}`}
        onError={() => setFailed(true)}
        onLoad={recalcScroll}
        style={{
          minHeight: "auto",
          objectFit: "unset",
          objectPosition: "unset",
          transform: `translateY(-${
            hovered && scrollOffset > 0
              ? (restOffset > 0 ? 0 : scrollOffset)
              : restOffset
          }px)`,
          transition: `transform ${transitionMs}ms ease-in-out`,
          willChange: "transform",
        }}
      />
      {scrollOffset > 0 ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-zinc-950/65 to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-30" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-zinc-950/80 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-20" />
        </>
      ) : null}
    </div>
  );
}

function normalizeTopicKey(topic: string): string {
  return topic
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isFunilOrCtaDiagnosticTopic(topicLower: string): boolean {
  return (
    topicLower.includes("funil") ||
    topicLower.includes("cta") ||
    topicLower.includes("call to action")
  );
}

function isPresencaDigitalGeralTopic(topic: string): boolean {
  return normalizeTopicKey(topic).includes("presenca digital geral");
}

function isConsistenciaComunicacaoTopic(topic: string): boolean {
  const k = normalizeTopicKey(topic);
  return k.includes("consistencia") && k.includes("comunicacao");
}

function getDiagnosticTopicPillVisual(topic: string): {
  Icon: LucideIcon;
  iconClass: string;
} {
  const k = normalizeTopicKey(topic);

  if (k.includes("posicionamento")) {
    return { Icon: Compass, iconClass: "text-violet-400" };
  }
  if (k.includes("identidade") && k.includes("visual")) {
    return { Icon: Palette, iconClass: "text-pink-400" };
  }
  if (isFunilOrCtaDiagnosticTopic(k)) {
    return { Icon: Filter, iconClass: "text-orange-400" };
  }
  if (k.includes("presenca") && k.includes("digital")) {
    return { Icon: Globe, iconClass: "text-sky-400" };
  }
  if (k.includes("clareza") && k.includes("proposta")) {
    return { Icon: Lightbulb, iconClass: "text-amber-400" };
  }
  if (k.includes("consistencia") && k.includes("comunicacao")) {
    return { Icon: MessageSquare, iconClass: "text-emerald-400" };
  }

  if (k.includes("identidade")) {
    return { Icon: Palette, iconClass: "text-pink-400" };
  }
  if (k.includes("clareza")) {
    return { Icon: Lightbulb, iconClass: "text-amber-400" };
  }
  if (k.includes("consistencia")) {
    return { Icon: MessageSquare, iconClass: "text-emerald-400" };
  }
  if (k.includes("presenca")) {
    return { Icon: Globe, iconClass: "text-sky-400" };
  }

  return { Icon: Tag, iconClass: "text-zinc-400" };
}

function DiagnosticTopicPill({ topic }: { topic: string }) {
  const { Icon, iconClass } = getDiagnosticTopicPillVisual(topic);
  return (
    <div className={TOPIC_PILL_CLASS}>
      <Icon className={cn("size-3.5 shrink-0 stroke-[1.75]", iconClass)} aria-hidden />
      <span className={TOPIC_PILL_LABEL_NEXT_TO_ICON}>{topic}</span>
    </div>
  );
}

function TopicEvidence({
  item,
  report,
}: {
  item: DiagnosticScore;
  report: RotaDigitalReport;
}) {
  const topic = item.topic.toLowerCase();
  const siteFooterFocus = isFunilOrCtaDiagnosticTopic(topic);
  const siteSrc = report.evidences?.siteHeroSnapshotUrl;
  const instagramSrc = buildInstagramEvidenceSrc(report);
  const isCombinedTopic =
    (topic.includes("posicionamento") || topic.includes("clareza da proposta")) &&
    Boolean(siteSrc) &&
    Boolean(instagramSrc);

  if (isCombinedTopic) {
    return (
      <div className="grid h-56 w-full grid-cols-2 gap-2">
        <EvidenceImage
          src={siteSrc}
          alt={`Site em ${item.topic}`}
          fitContain
          fitContainMode="cover"
          hoverScroll
          initialOffsetRatio={0}
          frameClassName="h-56 w-full rounded-md border border-zinc-800 bg-zinc-950/60"
          className="h-auto"
        />
        <EvidenceImage
          src={withSnapshotParams(instagramSrc, {
            variant: topic.includes("clareza da proposta") ? "profile" : "feed",
            start: topic.includes("clareza da proposta") ? 1 : 6,
          })}
          alt={`Instagram em ${item.topic}`}
          fitContain
          fitContainMode="cover"
          hoverScroll
          frameClassName="h-56 w-full rounded-md border border-zinc-800 bg-zinc-950/60"
          className="h-auto"
        />
      </div>
    );
  }

  const evidenceSrc = (() => {
    if (topic.includes("identidade visual")) {
      return withSnapshotParams(instagramSrc || item.evidenceImageUrl, {
        variant: "feed",
        start: 6,
      });
    }
    if (topic.includes("consist")) {
      return withSnapshotParams(instagramSrc || item.evidenceImageUrl, {
        variant: "profile",
        start: 1,
      });
    }
    return item.evidenceImageUrl;
  })();

  const siteHeroUrl = report.evidences?.siteHeroSnapshotUrl;
  const useFitContain =
    isLikelySitePageSnapshot(evidenceSrc) ||
    Boolean(siteHeroUrl && evidenceSrc === siteHeroUrl);

  if (!evidenceSrc) {
    return <div className="h-56 w-full rounded-md border border-dashed border-zinc-700 bg-zinc-950/40" />;
  }

  const evidenceScrollInitialRatio = (() => {
    if (useFitContain) {
      if (siteFooterFocus) return 0.88;
      if (isPresencaDigitalGeralTopic(item.topic)) return 0.5;
      return 0;
    }
    if (isConsistenciaComunicacaoTopic(item.topic)) return 0.75;
    return 0;
  })();

  return (
    <EvidenceImage
      src={evidenceSrc}
      alt={`Evidência de ${item.topic}`}
      fitContain={useFitContain}
      fitContainMode={useFitContain ? "cover" : "width"}
      hoverScroll
      initialOffsetRatio={evidenceScrollInitialRatio}
      frameClassName="h-56 w-full rounded-md border border-zinc-800 bg-zinc-950/60"
      className="h-auto"
    />
  );
}

function ChannelCard({ channel }: { channel: DigitalChannel }) {
  const glowByPriority: Record<string, { glowColor: string; colors: string[] }> = {
    Alta: {
      glowColor: "0 72 58",
      colors: ["#f87171", "#fb7185", "#fca5a5"],
    },
    Média: {
      glowColor: "48 92 60",
      colors: ["#facc15", "#f59e0b", "#fde68a"],
    },
    Baixa: {
      glowColor: "142 55 52",
      colors: ["#4ade80", "#34d399", "#86efac"],
    },
  };
  const glow = glowByPriority[channel.priority] || glowByPriority.Média;
  const idleBorder =
    PRIORITY_FRAME_BORDER[channel.priority] || PRIORITY_FRAME_BORDER.Média;
  return (
    <BorderGlow
      edgeSensitivity={30}
      glowColor={glow.glowColor}
      backgroundColor="#18181b"
      borderRadius={10}
      glowRadius={28}
      glowIntensity={0.8}
      coneSpread={25}
      animated={false}
      colors={glow.colors}
      fillOpacity={0.35}
      contentInset={0}
      className={`overflow-hidden rounded-lg ${idleBorder}`}
    >
      <div className="rounded-lg bg-zinc-900/40 space-y-3 px-5 py-5 sm:px-7 sm:py-5">
        <div className="flex items-start justify-between gap-2">
          <h4 className="m-0 min-w-0 flex-1 font-normal leading-none" title={channel.name}>
            <span className={TOPIC_PILL_CLASS}>
              <span className="truncate">{channel.name}</span>
            </span>
          </h4>
          <Badge className={`text-xs shrink-0 ${PRIORITY_COLORS[channel.priority] || PRIORITY_COLORS.Média}`}>
            {channel.priority}
          </Badge>
        </div>
        <p className="text-[13.5px] leading-relaxed text-zinc-100 whitespace-pre-line">
          {formatReadableParagraphs(channel.description)}
        </p>
        {channel.actions.length > 0 && (
          <ul className="space-y-2">
            {channel.actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-zinc-300">
                <ArrowRight size={14} className="mt-1 shrink-0 text-white" />
                {action}
              </li>
            ))}
          </ul>
        )}
      </div>
    </BorderGlow>
  );
}

export default function ReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const router = useRouter();
  const [report, setReport] = useState<RotaDigitalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState("");
  const [editCompanyProfile, setEditCompanyProfile] = useState("");
  const [editServices, setEditServices] = useState("");
  const [editObjective, setEditObjective] = useState("");
  const [reanalyzeOpen, setReanalyzeOpen] = useState(false);
  const [reanalyzeNotes, setReanalyzeNotes] = useState("");
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  const [ctaSettings, setCtaSettings] = useState<UserReportCtaSettings | null>(null);

  const reportCta = useMemo(
    () => resolveReportCtas(ctaSettings, process.env.NEXT_PUBLIC_ROTA_REPORT_CTA_URL),
    [ctaSettings]
  );

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  useEffect(() => {
    if (!report?.userId) return;
    let cancelled = false;
    void getUserReportCtaSettings(report.userId)
      .then((s) => {
        if (!cancelled) setCtaSettings(s);
      })
      .catch(() => {
        if (!cancelled) setCtaSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [report?.userId]);

  useEffect(() => {
    const fetchReport = async () => {
      if (!reportId) return;
      try {
        const data = await getReport(reportId as string);
        console.info("[IG_DEBUG][client][report-page-loaded]", {
          reportId: reportId as string,
          hasReport: Boolean(data),
          instagramBioExcerpt: data?.evidences?.instagramBioExcerpt || null,
          instagramSnapshotUrl: data?.evidences?.instagramSnapshotUrl || null,
          instagramProfileImageUrl: data?.evidences?.instagramProfileImageUrl || null,
          researchNotes: data?.evidences?.researchNotes || null,
        });
        setReport(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [reportId]);

  const handlePrint = () => {
    window.print();
  };

  const startEdit = () => {
    if (!report) return;
    setIsEditing(true);
    setEditError(null);
    setEditSummary(report.executiveSummary || "");
    setEditCompanyProfile(report.companyProfile || "");
    setEditServices(report.brief?.servicesOffered || "");
    setEditObjective(report.brief?.objective || "");
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!report) return;
    setIsSavingEdit(true);
    setEditError(null);
    try {
      await updateReport(report.id, {
        executiveSummary: editSummary,
        companyProfile: editCompanyProfile,
        brief: {
          ...(report.brief || {}),
          servicesOffered: editServices,
          objective: editObjective,
        },
      });

      setReport((prev) =>
        prev
          ? {
              ...prev,
              executiveSummary: editSummary,
              companyProfile: editCompanyProfile,
              brief: {
                ...(prev.brief || {}),
                servicesOffered: editServices,
                objective: editObjective,
              },
            }
          : prev
      );
      setIsEditing(false);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Erro ao salvar edição.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleReanalyze = async () => {
    if (!report) return;
    if (!reanalyzeNotes.trim()) {
      setReanalyzeError("Descreva o que deve ser ajustado.");
      return;
    }

    setReanalyzing(true);
    setReanalyzeError(null);
    try {
      const res = await fetch("/api/reanalyze-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report,
          observation: reanalyzeNotes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha na reanálise.");

      const updatedReport = {
        ...report,
        ...data.report,
      } as RotaDigitalReport;

      await updateReport(report.id, data.report);
      setReport(updatedReport);
      setReanalyzeOpen(false);
      setReanalyzeNotes("");
    } catch (err: unknown) {
      setReanalyzeError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setReanalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-zinc-400" size={32} />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-zinc-400">Relatório não encontrado.</p>
        <Button variant="outline" onClick={() => router.back()}>
          Voltar
        </Button>
      </div>
    );
  }

  const sortedChannels = [...report.recommendedChannels].sort(
    (a, b) =>
      ["Alta", "Média", "Baixa"].indexOf(a.priority) -
      ["Alta", "Média", "Baixa"].indexOf(b.priority)
  );
  const sortedDiagnosticScores = [...(report.diagnosticScores || [])].sort(
    (a, b) => a.score - b.score
  );
  const notes = parseResearchNotes(report.evidences?.researchNotes);
  const instagramEvidenceSrc = buildInstagramEvidenceSrc(report);
  const brandImageSrc =
    report.evidences?.logoImageUrl ||
    report.evidences?.instagramProfileImageUrl ||
    withSnapshotParams(instagramEvidenceSrc, {
      variant: "profile",
      start: 1,
    });
  const hasBrandImage = Boolean(brandImageSrc);
  const isWebsiteLogo = Boolean(report.evidences?.logoImageUrl);
  const normalizedInstagramNote = alignInstagramNoteForDisplay((
    notes.instagram ||
    "Instagram: não foi possível validar conteúdo suficiente; tratar como presença parcial até revisão manual."
  ).replace(
    /o perfil @.*?foi identificado, mas o Instagram limitou a leitura pública automática de métricas \(bloqueio de login\/anti-robô\)\.?/i,
    "Certifique-se que está logado no Instagram, para que o sistema consiga acessar o perfil."
  ).replace(
    /\s*Bio:\s*"[\s\S]*?"\.\s*/i,
    " A bio reforça o posicionamento principal do perfil. "
  ), report);
  const briefWebsiteHref = hrefForBriefWebsite(report.brief?.websiteUrl);
  const briefInstagramHref = hrefForBriefInstagram(report.brief?.instagramUrl);

  return (
    <div
      className={cn(
        "w-full max-w-full space-y-7 overflow-x-hidden print:max-w-none lg:space-y-8",
        /* Alinha respiro horizontal ao py-6/sm:py-7 do casco do card (default do Card é px-4). */
        "[&_[data-slot=card-header]]:!px-5 [&_[data-slot=card-header]]:sm:!px-7",
        "[&_[data-slot=card-content]]:!px-5 [&_[data-slot=card-content]]:sm:!px-7",
        "[&_[data-slot=card-footer]]:!px-5 [&_[data-slot=card-footer]]:sm:!px-7",
      )}
    >
      {/* Print styles */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .print-white { background: white !important; color: black !important; border-color: #e5e7eb !important; }
        }
      `}</style>

      {/* Header */}
      <div className="no-print flex items-start justify-between gap-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/dashboard/leads/${report.leadId}`)}
            className="text-zinc-400 hover:text-white"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">Rota Digital</h1>
            <p className="text-zinc-400 text-sm">
              Gerado para{" "}
              <Link
                href={`/dashboard/leads/${report.leadId}`}
                className="text-indigo-400 hover:underline"
              >
                {report.leadCompany}
              </Link>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            onClick={() => {
              setReanalyzeOpen(true);
              setReanalyzeError(null);
            }}
            className="relative overflow-hidden gap-2 border-none bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-500 bg-[length:200%_100%] animate-[gradient-move_3s_ease_infinite] text-white shadow-lg transition hover:brightness-110 no-print"
          >
            <Bot size={16} />
            Reanalise
          </Button>
          {isEditing ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={cancelEdit}
                className="gap-2 border-zinc-700 text-zinc-300 hover:text-white no-print"
              >
                <X size={16} />
                Cancelar
              </Button>
              <Button
                type="button"
                variant="cta"
                onClick={saveEdit}
                disabled={isSavingEdit}
                className="gap-2 no-print"
              >
                {isSavingEdit ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Salvar alterações
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={startEdit}
              className="gap-2 border-zinc-700 text-zinc-300 hover:text-white no-print"
            >
              <Pencil size={16} />
              Editar
            </Button>
          )}
          <Button
            onClick={handlePrint}
            variant="outline"
            className="gap-2 border-zinc-700 text-zinc-300 hover:text-white no-print"
          >
            <Download size={16} />
            Exportar / Imprimir
          </Button>
        </div>
      </div>

      <Dialog open={reanalyzeOpen} onOpenChange={setReanalyzeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reanalisar com IA</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Escreva o que deseja ajustar. A IA vai usar este relatório como contexto.
            </p>
            <Textarea
              value={reanalyzeNotes}
              onChange={(e) => setReanalyzeNotes(e.target.value)}
              className="min-h-[120px]"
              placeholder="Ex.: não recomendar e-mail marketing; foque em Instagram e WhatsApp."
            />
            {reanalyzeError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                {reanalyzeError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReanalyzeOpen(false)} disabled={reanalyzing}>
              Cancelar
            </Button>
            <Button variant="cta" onClick={handleReanalyze} disabled={reanalyzing} className="gap-2">
              {reanalyzing ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />}
              {reanalyzing ? "Reanalisando..." : "Reanalisar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {report.publicSlug && origin ? (
        <Card className={cn("no-print border-indigo-800/50 bg-indigo-950/30", ROTA_REPORT_CARD_BOX)}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-3 text-base text-white">
              <RotaHeaderIcon tone="indigo">
                <Link2 size={18} className="text-indigo-400" />
              </RotaHeaderIcon>
              Página pública para o lead
            </CardTitle>
            <p className={ROTA_CARD_SUBTITLE}>
              Envie este link para o cliente ver a proposta no navegador, sem login.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-md bg-zinc-950 px-3 py-2 text-left text-sm text-zinc-300">
              {`${origin}/r/${report.publicSlug}`}
            </code>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                type="button"
                variant="cta"
                className="gap-2"
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    `${origin}/r/${report.publicSlug}`
                  );
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
              <LinkButton
                href={`/r/${report.publicSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                variant="outline"
                className="gap-2 border-zinc-600 bg-zinc-900/80 text-zinc-100 hover:bg-zinc-800"
              >
                <ExternalLink size={16} />
                Abrir
              </LinkButton>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isEditing ? (
        <Card className={cn("no-print border-border bg-card", ROTA_REPORT_CARD_BOX)}>
          <CardHeader>
            <CardTitle className="text-base">Editar rota gerada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Resumo executivo</label>
              <Textarea
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                className="min-h-[110px]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Perfil da empresa</label>
              <Textarea
                value={editCompanyProfile}
                onChange={(e) => setEditCompanyProfile(e.target.value)}
                className="min-h-[110px]"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Serviços oferecidos</label>
                <Textarea
                  value={editServices}
                  onChange={(e) => setEditServices(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Objetivo</label>
                <Textarea
                  value={editObjective}
                  onChange={(e) => setEditObjective(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
            </div>
            {editError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {editError}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Print Header (only on print) */}
      <div className="hidden print:block mb-8">
        <h1 className="text-3xl font-bold">Rota Digital — {report.leadCompany}</h1>
        <p className="text-gray-500 mt-1">
          Relatório gerado em{" "}
          {new Date(report.createdAt).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Executive Summary */}
      <Card
        className={cn(
          "border-indigo-500/20 bg-gradient-to-b from-indigo-500/[0.03] to-transparent print-white",
          ROTA_REPORT_CARD_BOX,
        )}
      >
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2.5">
            <SectionHeaderIcon Icon={Sparkles} tone="indigo" />
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Resumo Executivo
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div
            className={`grid gap-6 ${hasBrandImage ? "md:grid-cols-[140px_minmax(0,1fr)] md:items-start" : ""}`}
          >
            {hasBrandImage ? (
              <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900/60 p-4 shadow-inner">
                <EvidenceImage
                  src={brandImageSrc}
                  alt={isWebsiteLogo ? "Logo" : "Foto de perfil do Instagram"}
                  className={
                    isWebsiteLogo
                      ? "h-24 w-24 rounded-md bg-white p-2.5 object-contain"
                      : "h-24 w-24 rounded-full border border-zinc-600 object-cover shadow-lg"
                  }
                />
              </div>
            ) : null}
            <div className="space-y-4">
              <p className="text-[15px] leading-relaxed text-zinc-100 antialiased whitespace-pre-line">
                {formatReadableParagraphs(
                  [report.executiveSummary, report.companyProfile].filter(Boolean).join("\n\n"),
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs: Layout Bento com hierarquia e profundidade */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
        {/* Maturidade Digital - Destaque */}
        <Card
          className={cn(
            "relative flex flex-col overflow-hidden border-indigo-500/20 bg-gradient-to-b from-indigo-500/[0.03] to-transparent md:col-span-5",
            ROTA_REPORT_CARD_BOX,
          )}
        >
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-md border border-indigo-500/30 bg-indigo-500/10">
                <Target size={14} className="text-indigo-400" />
              </div>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Maturidade Digital
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-6">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold tracking-tight tabular-nums text-white">
                {report.digitalMaturityScore.toFixed(1)}
              </span>
              <span className="text-lg font-medium text-zinc-600">/10</span>
            </div>
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800/50">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-1000",
                    MATURITY_CONFIG[report.digitalMaturityLevel]?.bar || "bg-indigo-500",
                  )}
                  style={{ width: `${report.digitalMaturityScore * 10}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <Badge
                  className={cn(
                    "border-none px-0 text-sm font-semibold bg-transparent",
                    MATURITY_CONFIG[report.digitalMaturityLevel]?.color || "text-indigo-400",
                  )}
                >
                  Nível {report.digitalMaturityLevel}
                </Badge>
                <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">
                  Score consolidado
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Prazo estimado — fundo em destaque + CTA para apoio / especialista */}
        <Card
          className={cn(
            "relative flex flex-col overflow-hidden border-blue-500/20 bg-gradient-to-b from-blue-500/[0.06] to-transparent md:col-span-3 print-white",
            ROTA_REPORT_CARD_BOX,
          )}
        >
          <div
            className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-blue-500/[0.14] blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-12 -left-10 h-28 w-28 rounded-full bg-sky-400/10 blur-2xl"
            aria-hidden
          />
          <CardHeader className="relative pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-blue-500/30 bg-blue-500/10">
                <Calendar size={14} className="text-blue-400" aria-hidden />
              </div>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400 print:text-zinc-700">
                Prazo estimado
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="relative flex flex-1 flex-col justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-5xl font-bold tracking-tight tabular-nums text-blue-400">
                  {report.estimatedTimelineMonths}
                </span>
                <span className="text-lg font-medium text-zinc-500 print:text-zinc-600">meses</span>
              </div>
              <p className="border-l-2 border-blue-400/40 pl-2.5 text-[11px] leading-snug text-zinc-300 antialiased print:border-l-blue-900/40 print:text-zinc-800">
                Tempo previsto para{" "}
                <span className="font-semibold text-blue-100 print:text-blue-900">
                  colocar este plano em prática
                </span>
                {" "}no seu negócio, em{" "}
                <span className="font-semibold text-blue-100 print:text-blue-900">meses corridos</span>.
                <span className="text-zinc-400 print:text-zinc-600">
                  {" "}Serve para você entender o caminho, planejar o investimento e avançar com mais segurança.
                </span>
              </p>
            </div>
            <a
              href={reportCta.top.href}
              {...(reportCta.top.openInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              title={
                reportCta.top.useWhatsAppIcon
                  ? "Falar com especialista (abre o WhatsApp)"
                  : "Marque uma conversa com um especialista para executar este plano"
              }
              aria-label={
                reportCta.top.useWhatsAppIcon
                  ? "Falar com especialista pelo WhatsApp"
                  : "Falar com um especialista da Rota Digital para colocar o plano do relatório em prática"
              }
              className={cn(
                buttonVariants({ variant: "cta", size: "sm" }),
                "no-print w-full justify-center gap-1.5 px-2 text-center leading-tight shadow-md",
              )}
            >
              {reportCta.top.useWhatsAppIcon ? (
                <WhatsAppIcon className="size-3.5 shrink-0" />
              ) : (
                <MessageSquare className="size-3.5 shrink-0" aria-hidden />
              )}
              {reportCta.top.label}
            </a>
          </CardContent>
        </Card>

        {/* Canais Recomendados - Lista Compacta */}
        <Card
          className={cn(
            "flex flex-col border-zinc-800 bg-zinc-900/50 md:col-span-4",
            ROTA_REPORT_CARD_BOX,
          )}
        >
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800">
                <Sparkles size={14} className="text-indigo-400" />
              </div>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Canais Recomendados
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight tabular-nums text-white">
                {report.recommendedChannels.length}
              </span>
              <span className="text-sm font-medium text-zinc-400">canais</span>
            </div>
            <div className="space-y-2">
              {sortedChannels.slice(0, 3).map((ch, i) => (
                <div
                  key={ch.name}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-600/50 bg-zinc-900/90 p-2.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
                >
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                    <div className="flex min-w-0 items-center gap-2">
                      {i === 0 ? (
                        <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.75)]" />
                      ) : (
                        <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />
                      )}
                      <span className="truncate text-[12px] font-semibold text-zinc-100">
                        {ch.name}
                      </span>
                    </div>
                    {i === 0 ? (
                      <span className="inline-flex shrink-0 items-center rounded-full border border-indigo-400/45 bg-indigo-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-200 print:border-indigo-900/40 print:bg-indigo-100 print:text-indigo-950">
                        Prioridade
                      </span>
                    ) : null}
                  </div>
                  <Badge
                    className={cn(
                      "h-5 shrink-0 border px-2 py-0 text-[10px] font-bold uppercase tracking-tight",
                      PRIORITY_COLORS[ch.priority] || PRIORITY_COLORS.Média,
                    )}
                  >
                    {ch.priority}
                  </Badge>
                </div>
              ))}
              {sortedChannels.length > 3 && (
                <p className="text-center text-[10px] font-medium text-zinc-600">
                  + {sortedChannels.length - 3} outros canais detalhados abaixo
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {(report.brief?.servicesOffered || report.brief?.objective) ? (
        <Card className={cn("bg-zinc-900 border-zinc-800 print-white", ROTA_REPORT_CARD_BOX)}>
          <CardHeader>
            <CardTitle className="text-white">Briefing informado</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs text-zinc-500 mb-1">Serviços oferecidos</p>
              <p className="text-sm leading-7 text-zinc-300 whitespace-pre-line">{report.brief?.servicesOffered || "—"}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-zinc-500 mb-1">Objetivo</p>
              <p className="text-sm leading-7 text-zinc-300 whitespace-pre-line">{report.brief?.objective || "—"}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {sortedDiagnosticScores.length > 0 ? (
        <Card className={cn("border-zinc-800 bg-zinc-900/50 print-white", ROTA_REPORT_CARD_BOX)}>
          <CardHeader className="space-y-3 pb-4">
            <div className="flex items-center gap-2.5">
              <SectionHeaderIcon Icon={ClipboardList} tone="indigo" />
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Diagnóstico por tópico
              </CardTitle>
            </div>
            <p className={ROTA_CARD_SUBTITLE}>
              Priorize os itens com menor nota para gerar impacto mais rápido.
            </p>
          </CardHeader>
          <CardContent className="space-y-5 lg:space-y-6">
            {sortedDiagnosticScores.map((item, idx) => {
              const topicGlow = getDiagnosticTopicGlow(item.score);
              return (
              <BorderGlow
                key={`${item.topic}-${idx}`}
                edgeSensitivity={30}
                glowColor={topicGlow.glowColor}
                backgroundColor="#18181b"
                borderRadius={12}
                glowRadius={28}
                glowIntensity={0.8}
                coneSpread={25}
                animated={false}
                colors={topicGlow.colors}
                fillOpacity={0.35}
                contentInset={2}
                className={cn(
                  "overflow-hidden rounded-xl print-white",
                  topicGlow.frameClass,
                )}
              >
                <div className="rounded-[10px] bg-zinc-900 p-6 sm:p-7">
                  <div className="grid gap-5 md:grid-cols-[360px_minmax(0,1fr)] md:items-start md:gap-6">
                    <TopicEvidence item={item} report={report} />
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="space-y-1.5">
                          <DiagnosticTopicPill topic={item.topic} />
                        </div>
                        <Badge className={cn("text-xs font-bold px-2.5 py-0.5", getScoreBadgeClass(item.score))}>
                          {item.score}/10
                        </Badge>
                      </div>
                      <p className="text-[14.5px] leading-relaxed text-zinc-100 whitespace-pre-line">
                        {formatReadableParagraphs(item.comment)}
                      </p>
                    </div>
                  </div>
                </div>
              </BorderGlow>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {report.evidences ? (
        <Card className={cn("border-zinc-800 bg-zinc-900/50 print-white", ROTA_REPORT_CARD_BOX)}>
          <CardHeader className="space-y-3 pb-4">
            <div className="flex items-center gap-2.5">
              <SectionHeaderIcon Icon={Images} tone="indigo" />
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Evidências coletadas
              </CardTitle>
            </div>
            <p className={ROTA_CARD_SUBTITLE}>
              Base visual e textual usada para compor este diagnóstico.
            </p>
          </CardHeader>
          <CardContent
            className={`grid gap-5 ${
              report.evidences.instagramBioLinkSnapshotUrl ? "md:grid-cols-4" : "md:grid-cols-3"
            }`}
          >
            <div className="flex h-full min-h-0 flex-col gap-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Bio do Instagram</p>
              <div className="shrink-0 rounded-xl border border-zinc-700 bg-zinc-900 p-5">
                <p className="text-[14px] leading-relaxed text-zinc-100 whitespace-pre-line">
                  {report.evidences.instagramBioExcerpt ||
                    "Bio não disponível na coleta automática."}
                </p>
              </div>
              {briefWebsiteHref || briefInstagramHref ? (
                <div className="mt-auto flex flex-col gap-2.5 border-t border-zinc-800 pt-4">
                  <div className="flex flex-col gap-2">
                    {briefWebsiteHref ? (
                      <a
                        href={briefWebsiteHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={briefWebsiteHref}
                        className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm font-medium text-sky-400 transition-colors hover:border-zinc-600 hover:bg-zinc-700 hover:text-sky-300"
                      >
                        <ExternalLink size={14} className="shrink-0 opacity-90" />
                        <span className="min-w-0 truncate">Website</span>
                      </a>
                    ) : null}
                    {briefInstagramHref ? (
                      <a
                        href={briefInstagramHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={briefInstagramHref}
                        className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm font-medium text-pink-400 transition-colors hover:border-zinc-600 hover:bg-zinc-700 hover:text-pink-300"
                      >
                        <InstagramBrandGlyph className="size-3.5 shrink-0 opacity-90" />
                        <span className="min-w-0 truncate text-zinc-100">Instagram</span>
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Imagem do Instagram</p>
              <EvidenceImage
                src={withSnapshotParams(instagramEvidenceSrc, {
                  variant: "profile",
                  start: 1,
                })}
                alt="Imagem do Instagram"
                hoverScroll
                frameClassName="h-64 w-full rounded-md border border-zinc-700 bg-zinc-950"
                className="h-auto"
              />
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Página completa do site</p>
              <EvidenceImage
                src={report.evidences.siteHeroSnapshotUrl}
                alt="Página completa do site"
                fitContain
                fitContainMode="cover"
                hoverScroll
                initialOffsetRatio={0}
                frameClassName="h-64 w-full rounded-md border border-zinc-700 bg-zinc-950"
                className="h-auto"
              />
            </div>

            {report.evidences.instagramBioLinkSnapshotUrl ? (
              <div className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Destino do link da bio</p>
                <EvidenceImage
                  src={report.evidences.instagramBioLinkSnapshotUrl}
                  alt="Destino do link da bio"
                  fitContain
                  frameClassName="h-48 w-full rounded-md border border-zinc-700 bg-zinc-950"
                  className="h-auto"
                />
              </div>
            ) : null}

            {report.evidences.researchNotes ? (
              <div className={report.evidences.instagramBioLinkSnapshotUrl ? "md:col-span-4" : "md:col-span-3"}>
                <div className="space-y-4">
                  <BorderGlow
                    edgeSensitivity={30}
                    glowColor="210 78 58"
                    backgroundColor="#18181b"
                    borderRadius={10}
                    glowRadius={26}
                    glowIntensity={0.8}
                    coneSpread={25}
                    animated={false}
                    colors={["#38bdf8", "#6366f1", "#7dd3fc"]}
                    fillOpacity={0.35}
                    contentInset={2}
                    className={cn("overflow-hidden rounded-lg border-0 print-white")}
                  >
                    <div className="rounded-[8px] bg-zinc-900 p-5 sm:p-6">
                      <div className={cn("mb-3", TOPIC_PILL_CLASS)}>
                        <Globe className="size-3.5 shrink-0 stroke-[1.75] text-sky-400" aria-hidden />
                        <span className={TOPIC_PILL_LABEL_NEXT_TO_ICON}>Website</span>
                      </div>
                      <p className="text-[14px] leading-relaxed text-zinc-100 break-words whitespace-pre-line">
                        {formatReadableParagraphs(
                          notes.website ||
                            "Website: não foi possível validar conteúdo relevante; tratar como presença fraca ou inexistente até revisão manual."
                        )}
                      </p>
                    </div>
                  </BorderGlow>
                  <BorderGlow
                    edgeSensitivity={30}
                    glowColor="318 72 58"
                    backgroundColor="#18181b"
                    borderRadius={10}
                    glowRadius={26}
                    glowIntensity={0.8}
                    coneSpread={25}
                    animated={false}
                    colors={["#f472b6", "#c084fc", "#fb7185"]}
                    fillOpacity={0.35}
                    contentInset={2}
                    className={cn("overflow-hidden rounded-lg border-0 print-white")}
                  >
                    <div className="rounded-[8px] bg-zinc-900 p-5 sm:p-6">
                      <div className={cn("mb-3", TOPIC_PILL_CLASS)}>
                        <InstagramBrandGlyph className="size-3.5 text-[#f472b6]" aria-hidden />
                        <span className={TOPIC_PILL_LABEL_NEXT_TO_ICON}>Instagram</span>
                      </div>
                      <p className="text-[14px] leading-relaxed text-zinc-100 break-words whitespace-pre-line">
                        {formatReadableParagraphs(normalizedInstagramNote)}
                      </p>
                    </div>
                  </BorderGlow>
                  {notes.general.length > 0 ? (
                    <div className="space-y-3">
                      {notes.general.map((paragraph, i) => (
                        <p key={i} className="text-sm text-zinc-300 leading-relaxed break-words whitespace-pre-line">
                          {formatReadableParagraphs(paragraph)}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* SWOT */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <BorderGlow
          edgeSensitivity={30}
          glowColor="142 55 52"
          backgroundColor="#18181b"
          borderRadius={12}
          glowRadius={32}
          glowIntensity={0.9}
          coneSpread={25}
          animated={false}
          colors={["#4ade80", "#34d399", "#86efac"]}
          fillOpacity={0.45}
          className="rounded-xl print-white"
        >
          <Card className={cn("border-0 bg-transparent shadow-none ring-0 print-white", ROTA_REPORT_CARD_BOX)}>
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
              <TrendingUp size={16} className="text-green-400" />
              <CardTitle className="text-sm font-medium text-green-400">Forças</CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              <ul className="divide-y divide-zinc-500/50">
                {report.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5 py-3 text-sm leading-6 text-zinc-300 first:pt-0 last:pb-0">
                    <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </BorderGlow>

        <BorderGlow
          edgeSensitivity={30}
          glowColor="0 72 58"
          backgroundColor="#18181b"
          borderRadius={12}
          glowRadius={32}
          glowIntensity={0.9}
          coneSpread={25}
          animated={false}
          colors={["#f87171", "#fb7185", "#fca5a5"]}
          fillOpacity={0.45}
          className="rounded-xl print-white"
        >
          <Card className={cn("border-0 bg-transparent shadow-none ring-0 print-white", ROTA_REPORT_CARD_BOX)}>
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
              <TrendingDown size={16} className="text-red-400" />
              <CardTitle className="text-sm font-medium text-red-400">Fraquezas</CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              <ul className="divide-y divide-zinc-500/50">
                {report.weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-2.5 py-3 text-sm leading-6 text-zinc-300 first:pt-0 last:pb-0">
                    <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </BorderGlow>

        <BorderGlow
          edgeSensitivity={30}
          glowColor="217 90 62"
          backgroundColor="#18181b"
          borderRadius={12}
          glowRadius={32}
          glowIntensity={0.9}
          coneSpread={25}
          animated={false}
          colors={["#c084fc", "#f472b6", "#38bdf8"]}
          fillOpacity={0.45}
          className="rounded-xl print-white"
        >
          <Card className={cn("border-0 bg-transparent shadow-none ring-0 print-white", ROTA_REPORT_CARD_BOX)}>
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
              <Target size={16} className="text-blue-400" />
              <CardTitle className="text-sm font-medium text-blue-400">Oportunidades</CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              <ul className="divide-y divide-zinc-500/50">
                {report.opportunities.map((o, i) => (
                  <li key={i} className="flex items-start gap-2.5 py-3 text-sm leading-6 text-zinc-300 first:pt-0 last:pb-0">
                    <Star size={14} className="text-blue-400 mt-0.5 shrink-0" />
                    {o}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </BorderGlow>
      </div>

      {/* Recommended Channels */}
      <Card className={cn("border-zinc-800 bg-zinc-900/50 print-white", ROTA_REPORT_CARD_BOX)}>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2.5">
            <SectionHeaderIcon Icon={Sparkles} tone="indigo" />
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Canais Digitais Recomendados
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {sortedChannels.map((channel, i) => (
              <ChannelCard key={i} channel={channel} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Wins & Long Term */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <BorderGlow
          edgeSensitivity={30}
          glowColor="48 92 60"
          backgroundColor="#18181b"
          borderRadius={12}
          glowRadius={30}
          glowIntensity={0.85}
          coneSpread={25}
          animated={false}
          colors={["#facc15", "#f59e0b", "#fde68a"]}
          fillOpacity={0.35}
          className="rounded-xl print-white"
        >
          <Card className={cn("border-0 bg-transparent shadow-none ring-0 print-white", ROTA_REPORT_CARD_BOX)}>
            <CardHeader className="space-y-3 pb-4">
              <div className="flex items-center gap-2.5">
                <SectionHeaderIcon Icon={Zap} tone="yellow" />
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Quick Wins
                </CardTitle>
              </div>
              <p className={ROTA_CARD_SUBTITLE}>
                Ações de alto impacto a implementar imediatamente.
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3.5">
                {report.quickWins.map((win, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm leading-6 text-zinc-300">
                    <span className="w-5 h-5 rounded-full bg-yellow-500/20 text-yellow-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {win}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </BorderGlow>

        <BorderGlow
          edgeSensitivity={30}
          glowColor="270 70 68"
          backgroundColor="#18181b"
          borderRadius={12}
          glowRadius={30}
          glowIntensity={0.85}
          coneSpread={25}
          animated={false}
          colors={["#c084fc", "#f472b6", "#38bdf8"]}
          fillOpacity={0.35}
          className="rounded-xl print-white"
        >
          <Card className={cn("border-0 bg-transparent shadow-none ring-0 print-white", ROTA_REPORT_CARD_BOX)}>
            <CardHeader className="space-y-3 pb-4">
              <div className="flex items-center gap-2.5">
                <SectionHeaderIcon Icon={Target} tone="purple" />
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Ações de Longo Prazo
                </CardTitle>
              </div>
              <p className={ROTA_CARD_SUBTITLE}>
                Estratégias para construção de presença digital sustentável.
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3.5">
                {report.longTermActions.map((action, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm leading-6 text-zinc-300">
                    <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {action}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </BorderGlow>
      </div>

      {/* Próximos passos — spotlight ao hover */}
      <CardSpotlight className={cn("scroll-mt-6 w-full print:border-zinc-200 print:bg-white", ROTA_REPORT_CARD_BOX)}>
        <Card
          id="report-proximos-passos"
          className={cn(
            "border-0 !bg-transparent shadow-none ring-0 print-white",
            "py-0 gap-0",
          )}
        >
          <CardHeader className="space-y-3 px-4 pb-4 pt-0 sm:px-7 sm:pt-0">
            <div className="flex items-center gap-2.5">
              <SectionHeaderIcon Icon={ArrowRight} tone="indigo" />
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Próximos Passos
              </CardTitle>
            </div>
            <p className={ROTA_CARD_SUBTITLE}>
              Esta é a etapa mais importante para transformar o diagnóstico em plano de ação.
            </p>
          </CardHeader>
          <CardContent className="px-4 sm:px-7">
            <div className="space-y-3">
              {report.nextSteps.map((step, i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 rounded-xl border border-zinc-700/90 bg-zinc-900/75 p-4 transition-colors hover:border-indigo-500/40"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-indigo-500/40 bg-indigo-500/10">
                    <span className="text-[11px] font-bold text-indigo-300">{i + 1}</span>
                  </div>
                  <p className="text-[14.5px] leading-relaxed text-zinc-100">{step}</p>
                </div>
              ))}
            </div>
            <div id="report-chamada-acao" className="scroll-mt-6 mt-6 flex justify-stretch sm:justify-start">
              <a
                href={reportCta.bottom.href}
                {...(reportCta.bottom.openInNewTab ?
                  { target: "_blank", rel: "noopener noreferrer" }
                : {})}
                title={
                  reportCta.bottom.useWhatsAppIcon
                    ? "Agendar reunião estratégica (abre o WhatsApp)"
                    : "Agendar reunião estratégica com a Rota Digital"
                }
                aria-label={
                  reportCta.bottom.useWhatsAppIcon
                    ? "Agendar reunião estratégica pelo WhatsApp"
                    : "Agendar reunião estratégica para validar prioridades e cronograma"
                }
                className={cn(
                  buttonVariants({ variant: "cta", size: "default" }),
                  "no-print w-full justify-center gap-2 shadow-md sm:w-auto",
                )}
              >
                {reportCta.bottom.useWhatsAppIcon ? (
                  <WhatsAppIcon className="size-4 shrink-0" />
                ) : (
                  <Calendar className="size-4 shrink-0" aria-hidden />
                )}
                {reportCta.bottom.label}
              </a>
            </div>
          </CardContent>
        </Card>
      </CardSpotlight>

      {/* Footer */}
      <div className="text-center text-zinc-600 text-xs py-4 no-print">
        Rota Digital gerada com IA em{" "}
        {new Date(report.createdAt).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}
