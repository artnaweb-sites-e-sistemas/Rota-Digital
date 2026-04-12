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
import { useRouter } from "next/navigation";
import { updateReport } from "@/lib/reports";
import { getUserReportCtaSettings } from "@/lib/user-settings";
import { resolveReportCtas } from "@/lib/report-cta";
import { PublicReportFloatingCta } from "@/components/rotas/public-report-floating-cta";
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
  FileText,
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
import { PublicThemeToggle } from "@/components/public-theme-toggle";

const PRIORITY_COLORS: Record<string, string> = {
  Alta:
    "border border-[color:var(--rota-sev-a-border)]/35 bg-[color:var(--rota-sev-a-bar)]/15 text-[color:var(--rota-sev-a-fg)] dark:bg-[color:var(--rota-sev-a-bar)]/22 dark:text-[color:var(--rota-sev-a-fg-dark)] dark:border-[color:var(--rota-sev-a-border)]/45",
  Média:
    "border border-[color:var(--rota-sev-b-border)]/35 bg-[color:var(--rota-sev-b-bar)]/12 text-[color:var(--rota-sev-b-fg)] dark:bg-[color:var(--rota-sev-b-bar)]/18 dark:text-[color:var(--rota-sev-b-fg-dark)] dark:border-[color:var(--rota-sev-b-border)]/42",
  Baixa:
    "border border-[color:var(--rota-sev-c-border)]/35 bg-[color:var(--rota-sev-c-bar)]/12 text-[color:var(--rota-sev-c-fg)] dark:bg-[color:var(--rota-sev-c-bar)]/18 dark:text-[color:var(--rota-sev-c-fg-dark)] dark:border-[color:var(--rota-sev-c-border)]/42",
};

/** Fundo opaco da aba de prioridade (fora da moldura BorderGlow) — todos os breakpoints. */
const CHANNEL_PRIORITY_TAB_SURFACE: Record<string, string> = {
  Alta:
    "!bg-[oklch(0.22_0.045_38_/_0.96)] dark:!bg-[oklch(0.2_0.04_38_/_0.94)] !text-[color:var(--rota-sev-a-fg-dark)] dark:!text-[color:var(--rota-sev-a-fg-dark)]",
  Média:
    "!bg-[oklch(0.24_0.035_78_/_0.95)] dark:!bg-[oklch(0.22_0.03_78_/_0.92)] !text-[color:var(--rota-sev-b-fg)] dark:!text-[color:var(--rota-sev-b-fg-dark)]",
  Baixa:
    "!bg-[oklch(0.22_0.04_152_/_0.95)] dark:!bg-[oklch(0.2_0.035_152_/_0.92)] !text-[color:var(--rota-sev-c-fg)] dark:!text-[color:var(--rota-sev-c-fg-dark)]",
};

/** Borda 1px do BorderGlow em repouso (inline — evita conflito com `border-border` do componente). */
const PRIORITY_RESTING_BORDER: Record<string, string> = {
  Alta: "color-mix(in oklch, var(--rota-sev-a-border) 58%, transparent)",
  Média: "color-mix(in oklch, var(--rota-sev-b-border) 58%, transparent)",
  Baixa: "color-mix(in oklch, var(--rota-sev-c-border) 58%, transparent)",
};

/** Rótulo do badge de prioridade nos cards de canal. */
function channelPriorityBadgeLabel(priority: string): string {
  if (priority === "Alta") return "Prioridade alta";
  if (priority === "Média") return "Prioridade média";
  if (priority === "Baixa") return "Prioridade baixa";
  return `Prioridade ${priority}`;
}

/** Caixa do ícone nas ações do card de canal — harmoniza com a prioridade. */
const CHANNEL_ACTION_ICON_SHELL: Record<string, string> = {
  Alta:
    "border-[color:var(--rota-sev-a-border)]/35 bg-[color:var(--rota-sev-a-bar)]/10 text-[color:var(--rota-sev-a-fg)] ring-[color:var(--rota-sev-a-border)]/25 dark:text-[color:var(--rota-sev-a-fg-dark)] dark:ring-[color:var(--rota-sev-a-border)]/20",
  Média:
    "border-[color:var(--rota-sev-b-border)]/35 bg-[color:var(--rota-sev-b-bar)]/12 text-[color:var(--rota-sev-b-fg)] ring-[color:var(--rota-sev-b-border)]/25 dark:text-[color:var(--rota-sev-b-fg-dark)] dark:ring-[color:var(--rota-sev-b-border)]/20",
  Baixa:
    "border-[color:var(--rota-sev-c-border)]/35 bg-[color:var(--rota-sev-c-bar)]/10 text-[color:var(--rota-sev-c-fg)] ring-[color:var(--rota-sev-c-border)]/25 dark:text-[color:var(--rota-sev-c-fg-dark)] dark:ring-[color:var(--rota-sev-c-border)]/20",
};

/** Pill genérica (diagnóstico / canais sem estilo próprio). */
const TOPIC_PILL_BRAND =
  "inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand/35 bg-brand/[0.11] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide leading-none text-brand dark:border-brand/45 dark:bg-brand/15 dark:text-brand";

/** Pill “Website” — lavagem azul muito suave + borda discreta (evidências). */
const TOPIC_PILL_WEBSITE =
  "inline-flex max-w-full items-center gap-1.5 rounded-full border border-sky-300/50 bg-gradient-to-r from-sky-500/[0.08] via-blue-500/[0.07] to-indigo-500/[0.08] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide leading-none text-foreground dark:border-sky-500/30 dark:from-sky-400/[0.12] dark:via-blue-500/[0.10] dark:to-indigo-500/[0.11]";

/** Pill “Instagram” — lavagem rosa/roxo suave + borda discreta (evidências). */
const TOPIC_PILL_INSTAGRAM =
  "inline-flex max-w-full items-center gap-1.5 rounded-full border border-pink-300/45 bg-gradient-to-r from-fuchsia-500/[0.07] via-rose-500/[0.08] to-amber-500/[0.07] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide leading-none text-foreground dark:border-pink-500/28 dark:from-fuchsia-500/[0.11] dark:via-rose-500/[0.10] dark:to-amber-500/[0.09]";

function channelCardPillClass(channelName: string): string {
  const n = channelName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("instagram")) return TOPIC_PILL_INSTAGRAM;
  if (n.includes("website") || n === "site" || n.startsWith("site ")) return TOPIC_PILL_WEBSITE;
  return TOPIC_PILL_BRAND;
}

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
        tone === "indigo" && "border-brand/30 bg-brand/10 text-brand dark:text-brand",
        tone === "yellow" &&
          "border-[color:var(--rota-sev-b-border)]/35 bg-[color:var(--rota-sev-b-bar)]/10 text-[color:var(--rota-sev-b-fg)] dark:text-[color:var(--rota-sev-b-fg-dark)]",
        tone === "purple" && "border-purple-500/35 bg-purple-500/10 text-purple-800 dark:text-purple-400",
        tone === "neutral" && "border-border bg-muted text-muted-foreground",
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

/** Casco vertical quando o topo do card é “colado” ao primeiro bloco (ex.: faixa de cabeçalho interna). */
const ROTA_REPORT_CARD_BOX_FLUSH_TOP = "pb-6 pt-0 sm:pb-7 sm:pt-0";

/**
 * Superfície das secções do relatório (dashboard): no escuro alinha ao zinc da página + painel `white/[0.02]`.
 */
const ROTA_REPORT_SURFACE_SECTION =
  "border border-border bg-card/95 shadow-sm ring-1 ring-foreground/[0.04] print-white dark:border-border dark:bg-card dark:shadow-none dark:ring-white/[0.06]";

/** Blocos encaixados (linhas da lista de canais, caixas de texto). */
const ROTA_REPORT_SURFACE_INSET =
  "border border-border/60 bg-card shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] dark:border-border dark:bg-background dark:shadow-[inset_0_1px_0_0_oklch(1_0_0/5%)]";

/** Conteúdo dentro de BorderGlow (diagnóstico, evidências): levemente mais escuro que o card = leitura em camadas sem tom acinzentado frio. */
const ROTA_REPORT_SURFACE_GLOW_INNER = "bg-card dark:bg-background";

/** SWOT (3 colunas): menos padding vertical + fundo sólido alinhado ao `card` do tema. */
const ROTA_SWOT_CARD_BOX = "gap-2 py-4 sm:gap-3 sm:py-5";

/** Faixa superior dentro dos cards “O que fazer primeiro” / “Longo prazo” (corpo da lista fica mais claro). */
const ROTA_ACTIONLIST_INNER_HEADER =
  "border-b border-border/65 bg-gradient-to-b from-muted/55 via-muted/38 to-muted/18 px-5 py-4 dark:border-white/[0.08] dark:from-zinc-800/95 dark:via-zinc-900/88 dark:to-zinc-950/90 sm:px-7 sm:py-5 print:border-zinc-200 print:from-zinc-100 print:via-zinc-50 print:to-white";

/**
 * Capturas full-page no quadro: em repouso mostra o **topo** da página (início do screenshot).
 * Com `hoverScroll`: no desktop o pan segue o rato; no touch, um toque alterna o pan (sobe/desce).
 */
const FULL_PAGE_SNAPSHOT_IDLE_FROM_TOP_RATIO = 0;

/** Só no card Posicionamento (grid site + Instagram): repouso no meio do pan vertical. Clareza da proposta = topo. */
const POSICIONAMENTO_COMBINED_SNAPSHOT_IDLE_CENTER_RATIO = 0.5;

type RotaHeaderIconTone = "indigo" | "yellow" | "purple" | "green" | "red" | "blue";

const ROTA_HEADER_ICON_SHELL: Record<RotaHeaderIconTone, string> = {
  indigo: "border-brand/35 bg-brand/10",
  yellow: "border-[color:var(--rota-sev-b-border)]/35 bg-[color:var(--rota-sev-b-bar)]/10",
  purple: "border-purple-500/35 bg-purple-500/10",
  green: "border-[color:var(--rota-sev-c-border)]/35 bg-[color:var(--rota-sev-c-bar)]/10",
  red: "border-[color:var(--rota-sev-a-border)]/35 bg-[color:var(--rota-sev-a-bar)]/10",
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
  Iniciante: {
    scoreText: "text-[color:var(--rota-sev-a-fg)] dark:text-[color:var(--rota-sev-a-fg-dark)]",
    bar: "bg-[color:var(--rota-sev-a-bar)]",
    badgeBorder: "border-[color:var(--rota-sev-a-border)]/35",
    range: "0.0-3.9",
  },
  Intermediário: {
    scoreText: "text-[color:var(--rota-sev-b-fg)] dark:text-[color:var(--rota-sev-b-fg-dark)]",
    bar: "bg-[color:var(--rota-sev-b-bar)]",
    badgeBorder: "border-[color:var(--rota-sev-b-border)]/35",
    range: "4.0-6.9",
  },
  Avançado: {
    scoreText: "text-[color:var(--rota-sev-c-fg)] dark:text-[color:var(--rota-sev-c-fg-dark)]",
    bar: "bg-[color:var(--rota-sev-c-bar)]",
    badgeBorder: "border-[color:var(--rota-sev-c-border)]/35",
    range: "7.0-10.0",
  },
};

/** Quebras “manuais” antes de frases que costumam ser recomendações (melhor escaneabilidade). */
function applyReadingHeuristics(text: string): string {
  return text
    /* Evitar quebra forçada antes de "Para chegar a 10…" — o prompt já pede uma única abertura; duplicar parágrafos ficava redundante. */
    .replace(/\s+(O que falta(?: para .*?)?10\/10)/gi, "\n\n$1")
    .replace(/\s+(Enquanto )/g, "\n\n$1");
}

function splitIntoSentences(paragraph: string): string[] {
  const t = paragraph.replace(/\s+/g, " ").trim();
  if (!t) return [];
  return t
    .split(/(?<=[.!?])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * A IA às vezes coloca `\\n\\n` no meio de uma frase (ex.: "Contudo," sozinho + continuação).
 * Junta esses fragmentos ao parágrafo seguinte para não aparecer uma linha isolada.
 */
const CONJUNCTION_ORPHAN_ONLY =
  /^(contudo|porém|entretanto|no entanto|todavia|assim|portanto|dessa forma|desse modo)\s*,?\s*$/i;

function mergeOrphanExplicitParagraphs(parts: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const cur = parts[i];
    const t = cur.trim();
    const next = parts[i + 1];
    const shortIncomplete =
      Boolean(next) &&
      t.length > 0 &&
      t.length <= 55 &&
      !/[.!?]$/.test(t) &&
      (t.endsWith(",") || CONJUNCTION_ORPHAN_ONLY.test(t));
    if (shortIncomplete) {
      out.push(`${t} ${parts[i + 1]!.trim()}`);
      i += 2;
      continue;
    }
    out.push(cur);
    i += 1;
  }
  return out;
}

/** Um único parágrafo corrido (ex.: resumo executivo), sem vários `<p>` por frase. */
function collapseProseToSingleParagraph(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  let normalized = raw.replace(/\r\n/g, "\n").trim();
  normalized = applyReadingHeuristics(normalized);
  const explicitParts = mergeOrphanExplicitParagraphs(
    normalized
      .split(/\n{2,}/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean),
  );
  return explicitParts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Divide texto longo da IA em blocos curtos (1–2 frases) para leitura mais fluida.
 * Respeita parágrafos explícitos (`\\n\\n`) vindos do modelo.
 */
function splitIntoReadableBlocks(
  raw: string | undefined,
  sentencesPerBlock: 1 | 2 = 2,
): string[] {
  if (!raw?.trim()) return [];
  let normalized = raw.replace(/\r\n/g, "\n").trim();
  normalized = applyReadingHeuristics(normalized);
  normalized = normalized.replace(/\n{3,}/g, "\n\n");
  const explicitParts = mergeOrphanExplicitParagraphs(
    normalized
      .split(/\n{2,}/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean),
  );
  const blocks: string[] = [];
  for (const part of explicitParts) {
    const sentences = splitIntoSentences(part);
    if (sentences.length === 0) continue;
    for (let i = 0; i < sentences.length; i += sentencesPerBlock) {
      blocks.push(sentences.slice(i, i + sentencesPerBlock).join(" "));
    }
  }
  return blocks;
}

/** Blocos de texto com respiro entre frases — uso nos cards do relatório. */
function ReportProseBlocks({
  text,
  sentencesPerBlock = 2,
  size = "md",
  firstProminent = true,
  collapseToOneParagraph = false,
  collapseToTwoParagraphs = false,
}: {
  text?: string;
  sentencesPerBlock?: 1 | 2;
  size?: "sm" | "md" | "lg";
  /** Se true, o primeiro bloco fica com contraste cheio; os seguintes levemente suavizados. */
  firstProminent?: boolean;
  /** Um único `<p>` (ex.: resumo executivo), sem partir uma frase por parágrafo. */
  collapseToOneParagraph?: boolean;
  /** Dois `<p>`: respeita `\\n\\n` da IA (1º e resto); senão, divide frases ao meio. Ignora `collapseToOneParagraph`. */
  collapseToTwoParagraphs?: boolean;
}) {
  const sizeClass =
    size === "lg"
      ? "text-[15px] leading-[1.72]"
      : size === "sm"
        ? "text-[13.5px] leading-[1.68]"
        : "text-[14px] sm:text-[14.5px] leading-[1.7]";

  const pClass = cn(
    sizeClass,
    "text-pretty antialiased [overflow-wrap:anywhere]",
  );

  if (collapseToTwoParagraphs) {
    if (!text?.trim()) return null;
    let normalized = text.replace(/\r\n/g, "\n").trim();
    normalized = applyReadingHeuristics(normalized);
    const explicitParts = mergeOrphanExplicitParagraphs(
      normalized
        .split(/\n{2,}/)
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    );
    if (explicitParts.length === 0) return null;

    let first: string;
    let second: string;

    if (explicitParts.length >= 2) {
      first = explicitParts[0]!;
      second = explicitParts.slice(1).join(" ");
    } else {
      const single = explicitParts[0]!;
      const sentences = splitIntoSentences(single);
      if (sentences.length <= 1) {
        return (
          <div className="space-y-3.5">
            <p className={cn(pClass, "text-foreground")}>{single}</p>
          </div>
        );
      }
      const mid = Math.ceil(sentences.length / 2);
      first = sentences.slice(0, mid).join(" ");
      second = sentences.slice(mid).join(" ");
    }

    if (!second.trim()) {
      return (
        <div className="space-y-3.5">
          <p className={cn(pClass, "text-foreground")}>{first}</p>
        </div>
      );
    }

    return (
      <div className="space-y-3.5">
        <p className={cn(pClass, "text-foreground")}>{first}</p>
        <p
          className={cn(
            pClass,
            firstProminent
              ? "text-foreground/90 dark:text-foreground/85"
              : "text-foreground",
          )}
        >
          {second}
        </p>
      </div>
    );
  }

  if (collapseToOneParagraph) {
    const single = collapseProseToSingleParagraph(text);
    if (!single) return null;
    return (
      <div className="space-y-3.5">
        <p className={cn(pClass, "text-foreground")}>{single}</p>
      </div>
    );
  }

  const blocks = splitIntoReadableBlocks(text, sentencesPerBlock);
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-3.5">
      {blocks.map((block, i) => (
        <p
          key={i}
          className={cn(
            sizeClass,
            "text-pretty antialiased [overflow-wrap:anywhere]",
            firstProminent && i > 0
              ? "text-foreground/90 dark:text-foreground/85"
              : "text-foreground",
          )}
        >
          {block}
        </p>
      ))}
    </div>
  );
}

/** Notas Website/Instagram nas evidências: dois `<p>` (respeita `\\n\\n` ou divide frases). */
function EvidenceResearchNoteProse({
  text,
  size = "md",
}: {
  text?: string;
  size?: "sm" | "md";
}) {
  return <ReportProseBlocks text={text} size={size} collapseToTwoParagraphs />;
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
        <span className={cn("text-4xl font-bold tabular-nums", config.scoreText)}>
          {normalized.toFixed(1)}
        </span>
        <span className="pb-1 text-sm text-muted-foreground">/10</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-1000", config.bar)}
          style={{ width: `${normalized * 10}%` }}
        />
      </div>
      <Badge className={cn("w-fit border bg-transparent text-sm font-semibold", config.scoreText, config.badgeBorder)}>
        {level}
      </Badge>
    </div>
  );
}

function getScoreBadgeClass(score: number): string {
  if (score < 4) {
    return "border-[color:var(--rota-sev-a-border)]/40 bg-[color:var(--rota-sev-a-bar)]/12 text-[color:var(--rota-sev-a-fg)] dark:bg-[color:var(--rota-sev-a-bar)]/18 dark:text-[color:var(--rota-sev-a-fg-dark)] dark:border-[color:var(--rota-sev-a-border)]/45";
  }
  if (score < 7) {
    return "border-[color:var(--rota-sev-b-border)]/40 bg-[color:var(--rota-sev-b-bar)]/12 text-[color:var(--rota-sev-b-fg)] dark:bg-[color:var(--rota-sev-b-bar)]/18 dark:text-[color:var(--rota-sev-b-fg-dark)] dark:border-[color:var(--rota-sev-b-border)]/45";
  }
  return "border-[color:var(--rota-sev-c-border)]/40 bg-[color:var(--rota-sev-c-bar)]/12 text-[color:var(--rota-sev-c-fg)] dark:bg-[color:var(--rota-sev-c-bar)]/18 dark:text-[color:var(--rota-sev-c-fg-dark)] dark:border-[color:var(--rota-sev-c-border)]/45";
}

/** BorderGlow do tópico: mesmas faixas do badge (< 4 terracota, < 7 ouro-oliva, senão floresta). */
function getDiagnosticTopicGlow(score: number): {
  glowColor: string;
  colors: string[];
  restingBorderColor: string;
} {
  if (score < 4) {
    return {
      /** H S L para `buildBoxShadow` — matiz terracota (~24°) */
      glowColor: "24 58 48",
      colors: ["#b85c52", "#9e4a42", "#d48072"],
      restingBorderColor: "color-mix(in oklch, var(--rota-sev-a-border) 58%, transparent)",
    };
  }
  if (score < 7) {
    return {
      glowColor: "72 52 52",
      colors: ["#c4a85a", "#a88f4a", "#e0cc88"],
      restingBorderColor: "color-mix(in oklch, var(--rota-sev-b-border) 58%, transparent)",
    };
  }
  return {
    glowColor: "148 42 44",
    colors: ["#5a7a64", "#4d6856", "#7a9a84"],
    restingBorderColor: "color-mix(in oklch, var(--rota-sev-c-border) 58%, transparent)",
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

  const cleaned = text
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\r\n/g, "\n")
    .trim();

  const general: string[] = [];

  const channelSplit = cleaned.match(
    /^(?:Website|Site)\s*\([^)]*\):\s*([\s\S]*?)\n+Instagram\s*\([^)]*\):\s*([\s\S]*)$/i,
  );

  if (channelSplit) {
    const website = channelSplit[1].trim();
    const instagram = channelSplit[2].trim();
    return {
      website: stripResearchNoteChannelPrefix(
        stripResearchNoteScoreParen(website),
        "website",
      ),
      instagram: stripResearchNoteChannelPrefix(
        stripResearchNoteScoreParen(instagram),
        "instagram",
      ),
      general,
    };
  }

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let website = "";
  let instagram = "";

  for (const line of lines) {
    const normalizedLine = line
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
      "website",
    ),
    instagram: stripResearchNoteChannelPrefix(
      stripResearchNoteScoreParen(instagram),
      "instagram",
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
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
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
  /** Desktop: pan ao passar o rato. Touch: toque alterna o pan (sem capturar scroll da página). */
  const [finePointerHover, setFinePointerHover] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setFinePointerHover(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const panInteractive = hoverScroll;
  const drivePanWithHover = finePointerHover;

  const panPointerHandlers = drivePanWithHover
    ? {
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
      }
    : {
        onClick: () => setHovered((h) => !h),
      };
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
    panInteractive && (!fitContain || (fitContain && fitContainMode === "cover"));

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
      <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/45 px-3 text-center text-xs text-muted-foreground">
        Sem imagem disponível
      </div>
    );
  }

  /** Com hover: do topo ou do meio → desce até o fim; se o repouso já está no rodapé (funil/CTA) → sobe para o topo. */
  const hoverPanTranslateY =
    hovered && scrollOffset > 0
      ? restOffset >= scrollOffset * 0.72
        ? 0
        : scrollOffset
      : restOffset;

  if (fitContain) {
    if (fitContainMode === "cover") {
      if (panInteractive) {
        return (
          <div
            ref={containerRef}
            className={cn(
              frameClassName,
              "group relative min-h-0 overflow-hidden",
              !drivePanWithHover && scrollOffset > 0 && "cursor-pointer",
            )}
            data-pan-active={hovered ? "true" : undefined}
            {...panPointerHandlers}
          >
            <img
              key={`${resolvedSrc || "img"}-cover-scroll`}
              ref={imageRef}
              src={resolvedSrc}
              alt={alt}
              className={`absolute left-0 right-0 top-0 block h-auto min-h-full w-full object-cover ${className || ""}`}
              onError={() => setFailed(true)}
              onLoad={recalcScroll}
              style={{
                objectFit: "cover",
                objectPosition: "center top",
                transform: `translateY(-${hoverPanTranslateY}px)`,
                // Pan longo só com o mouse em cima; em repouso não “anima” sozinho.
                transition: hovered ? `transform ${transitionMs}ms ease-in-out` : "none",
                willChange: hovered ? "transform" : "auto",
              }}
            />
            {scrollOffset > 0 ? (
              <>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-background/75 dark:from-zinc-950/65 to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-30 group-data-[pan-active=true]:opacity-30" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background/85 dark:from-zinc-950/80 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-20 group-data-[pan-active=true]:opacity-20" />
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
              objectPosition: "center top",
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

  if (!panInteractive) {
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
      className={cn(
        frameClassName,
        "group relative overflow-hidden",
        !drivePanWithHover && scrollOffset > 0 && "cursor-pointer",
      )}
      data-pan-active={hovered ? "true" : undefined}
      {...panPointerHandlers}
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
          transform: `translateY(-${hoverPanTranslateY}px)`,
          transition: hovered ? `transform ${transitionMs}ms ease-in-out` : "none",
          willChange: hovered ? "transform" : "auto",
        }}
      />
      {scrollOffset > 0 ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-background/75 dark:from-zinc-950/65 to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-30 group-data-[pan-active=true]:opacity-30" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background/85 dark:from-zinc-950/80 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-20 group-data-[pan-active=true]:opacity-20" />
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
    return { Icon: Compass, iconClass: "text-brand dark:text-brand" };
  }
  if (k.includes("identidade") && k.includes("visual")) {
    return { Icon: Palette, iconClass: "text-pink-700 dark:text-pink-400" };
  }
  if (isFunilOrCtaDiagnosticTopic(k)) {
    return { Icon: Filter, iconClass: "text-orange-700 dark:text-orange-400" };
  }
  if (k.includes("presenca") && k.includes("digital")) {
    return { Icon: Globe, iconClass: "text-sky-800 dark:text-sky-400" };
  }
  if (k.includes("clareza") && k.includes("proposta")) {
    return { Icon: Lightbulb, iconClass: "text-[color:var(--rota-sev-b-fg)] dark:text-[color:var(--rota-sev-b-fg-dark)]" };
  }
  if (k.includes("consistencia") && k.includes("comunicacao")) {
    return { Icon: MessageSquare, iconClass: "text-[color:var(--rota-sev-c-fg)] dark:text-[color:var(--rota-sev-c-fg-dark)]" };
  }

  if (k.includes("identidade")) {
    return { Icon: Palette, iconClass: "text-pink-700 dark:text-pink-400" };
  }
  if (k.includes("clareza")) {
    return { Icon: Lightbulb, iconClass: "text-[color:var(--rota-sev-b-fg)] dark:text-[color:var(--rota-sev-b-fg-dark)]" };
  }
  if (k.includes("consistencia")) {
    return { Icon: MessageSquare, iconClass: "text-[color:var(--rota-sev-c-fg)] dark:text-[color:var(--rota-sev-c-fg-dark)]" };
  }
  if (k.includes("presenca")) {
    return { Icon: Globe, iconClass: "text-sky-800 dark:text-sky-400" };
  }

  return { Icon: Tag, iconClass: "text-muted-foreground" };
}

/** Texto da pill no UI: remove sufixo redundante " geral" (ex.: "Presença digital geral"). */
function formatDiagnosticTopicPillLabel(topic: string): string {
  const normalized = topic
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalized.includes("consistencia da comunicacao")) {
    return "Comunicação";
  }

  return topic.replace(/\s+geral\s*$/i, "").trim();
}

function DiagnosticTopicPill({ topic }: { topic: string }) {
  const { Icon, iconClass } = getDiagnosticTopicPillVisual(topic);
  return (
    <div className={TOPIC_PILL_BRAND}>
      <Icon className={cn("size-3.5 shrink-0 stroke-[1.75]", iconClass)} aria-hidden />
      <span className={TOPIC_PILL_LABEL_NEXT_TO_ICON}>{formatDiagnosticTopicPillLabel(topic)}</span>
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
    const combinedGridIdleRatio = topic.includes("clareza da proposta")
      ? FULL_PAGE_SNAPSHOT_IDLE_FROM_TOP_RATIO
      : POSICIONAMENTO_COMBINED_SNAPSHOT_IDLE_CENTER_RATIO;

    return (
      <div className="grid h-56 w-full grid-cols-2 gap-2">
        <EvidenceImage
          src={siteSrc}
          alt={`Site em ${item.topic}`}
          fitContain
          fitContainMode="cover"
          hoverScroll
          initialOffsetRatio={combinedGridIdleRatio}
          frameClassName="h-56 w-full rounded-md border border-border bg-muted/55"
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
          initialOffsetRatio={combinedGridIdleRatio}
          frameClassName="h-56 w-full rounded-md border border-border bg-muted/55"
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
    return <div className="h-56 w-full rounded-md border border-dashed border-border bg-muted/45" />;
  }

  const evidenceScrollInitialRatio = (() => {
    if (useFitContain) {
      if (siteFooterFocus) return 0.88;
      return FULL_PAGE_SNAPSHOT_IDLE_FROM_TOP_RATIO;
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
      frameClassName="h-56 w-full rounded-md border border-border bg-muted/55"
      className="h-auto"
    />
  );
}

function ChannelCard({ channel }: { channel: DigitalChannel }) {
  const glowByPriority: Record<string, { glowColor: string; colors: string[] }> = {
    Alta: {
      glowColor: "24 58 48",
      colors: ["#b85c52", "#9e4a42", "#d48072"],
    },
    Média: {
      glowColor: "72 52 52",
      colors: ["#c4a85a", "#a88f4a", "#e0cc88"],
    },
    Baixa: {
      glowColor: "148 42 44",
      colors: ["#5a7a64", "#4d6856", "#7a9a84"],
    },
  };
  const glow = glowByPriority[channel.priority] || glowByPriority.Média;
  const restingBorder =
    PRIORITY_RESTING_BORDER[channel.priority] || PRIORITY_RESTING_BORDER.Média;
  const priorityBadgeCls = PRIORITY_COLORS[channel.priority] || PRIORITY_COLORS.Média;
  const priorityTabSurface =
    CHANNEL_PRIORITY_TAB_SURFACE[channel.priority] || CHANNEL_PRIORITY_TAB_SURFACE.Média;
  const priorityBadgeLabelText = channelPriorityBadgeLabel(channel.priority);
  return (
    <div className="relative flex h-full min-h-0 flex-col pt-1 md:self-stretch">
      {/*
        Aba fora do BorderGlow (z-0): o glow pinta por cima da borda do frame — o selo fica
        “por trás” da moldura, igual visual mobile/desktop.
      */}
      <Badge
        className={cn(
          "pointer-events-none absolute right-5 top-0 z-0 inline-flex h-auto min-h-7 -translate-y-[calc(100%-8px)] shrink-0 items-center justify-center gap-1 rounded-t-md rounded-b-none border-x border-t border-b-0 px-2.5 pb-2 pt-1.5 text-[11px] font-medium leading-snug whitespace-nowrap sm:right-7",
          priorityBadgeCls,
          priorityTabSurface,
        )}
      >
        {priorityBadgeLabelText}
      </Badge>
      <BorderGlow
        edgeSensitivity={30}
        glowColor={glow.glowColor}
        backgroundColor="var(--card)"
        borderRadius={10}
        glowRadius={28}
        glowIntensity={0.8}
        coneSpread={25}
        animated={false}
        colors={glow.colors}
        fillOpacity={0.35}
        contentInset={2}
        restingBorderColor={restingBorder}
        className={cn(
          "relative z-10 min-h-0 flex-1 rounded-lg md:overflow-hidden max-md:overflow-visible md:h-full md:min-h-0",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-visible space-y-3 rounded-lg px-5 py-5 sm:px-7 sm:py-5",
            ROTA_REPORT_SURFACE_GLOW_INNER,
          )}
        >
          <div className="flex items-start gap-2 pb-1">
            <h4 className="m-0 min-w-0 flex-1 font-normal leading-none" title={channel.name}>
              <span className={channelCardPillClass(channel.name)}>
                <span className="truncate">{channel.name}</span>
              </span>
            </h4>
          </div>
          <ReportProseBlocks text={channel.description} size="sm" collapseToTwoParagraphs />
          {channel.actions.length > 0 && (
            <ul className="space-y-2.5">
              {channel.actions.map((action, i) => (
                <li key={i} className="flex items-center gap-3 text-[13px] leading-relaxed">
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ring-1",
                      CHANNEL_ACTION_ICON_SHELL[channel.priority] || CHANNEL_ACTION_ICON_SHELL.Média,
                    )}
                    aria-hidden
                  >
                    <ArrowRight size={13} className="shrink-0 opacity-95" strokeWidth={2.25} />
                  </div>
                  <span className="min-w-0 flex-1 text-muted-foreground dark:text-zinc-300">
                    {action}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </BorderGlow>
    </div>
  );
}

export type RotaDigitalReportViewVariant = "dashboard" | "public";

export type RotaDigitalReportViewProps = {
  report: RotaDigitalReport;
  variant: RotaDigitalReportViewVariant;
  /** Atualiza o relatório no pai após salvar edição ou reanálise (só dashboard). */
  onReportChange?: (next: RotaDigitalReport) => void;
  /**
   * CTAs já resolvidos no servidor (página pública). O cliente anônimo não lê `userSettings`.
   */
  initialCtaSettings?: UserReportCtaSettings | null;
};

export function RotaDigitalReportView({
  report: initialReport,
  variant,
  onReportChange,
  initialCtaSettings,
}: RotaDigitalReportViewProps) {
  const router = useRouter();
  const isDashboard = variant === "dashboard";
  const [report, setReport] = useState<RotaDigitalReport>(initialReport);
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
  const [ctaSettings, setCtaSettings] = useState<UserReportCtaSettings | null>(
    () => initialCtaSettings ?? null
  );

  const reportCta = useMemo(
    () => resolveReportCtas(ctaSettings, process.env.NEXT_PUBLIC_ROTA_REPORT_CTA_URL),
    [ctaSettings]
  );

  useEffect(() => {
    setReport(initialReport);
  }, [initialReport]);

  useEffect(() => {
    if (variant !== "public") return;
    setCtaSettings(initialCtaSettings ?? null);
  }, [variant, initialCtaSettings]);

  useEffect(() => {
    if (variant === "public") return;
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
  }, [report?.userId, variant]);

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

      setReport((prev) => {
        const next = {
          ...prev,
          executiveSummary: editSummary,
          companyProfile: editCompanyProfile,
          brief: {
            ...(prev.brief || {}),
            servicesOffered: editServices,
            objective: editObjective,
          },
        };
        onReportChange?.(next);
        return next;
      });
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
      onReportChange?.(updatedReport);
      setReanalyzeOpen(false);
      setReanalyzeNotes("");
    } catch (err: unknown) {
      setReanalyzeError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setReanalyzing(false);
    }
  };

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
  const reportCreatedAtLine2 = (() => {
    const d = new Date(report.createdAt);
    const datePart = d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const timePart = d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${datePart} às ${timePart}`;
  })();

  return (
    <div
      className={cn(
        "w-full min-w-0 max-w-full space-y-7 print:max-w-none lg:space-y-8",
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
      <div
        className={cn(
          "no-print justify-between gap-4 sm:gap-6",
          isDashboard
            ? "flex flex-col items-start sm:flex-row sm:items-start"
            : "flex flex-row items-start justify-between gap-3 sm:items-center",
        )}
      >
        <div className={cn("flex items-center gap-3", !isDashboard && "min-w-0 flex-1")}>
          {isDashboard ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(`/dashboard/leads/${report.leadId}`)}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={20} />
            </Button>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground">Rota Digital</h1>
            {isDashboard ? (
              <p className="text-sm text-muted-foreground">
                Gerado para{" "}
                <Link
                  href={`/dashboard/leads/${report.leadId}`}
                  className="text-brand hover:underline"
                >
                  {report.leadCompany}
                </Link>
              </p>
            ) : (
              <p className="mt-1 text-sm leading-snug text-muted-foreground sm:hidden">
                Gerado para{" "}
                <span className="font-medium text-foreground">{report.leadCompany}</span>
              </p>
            )}
          </div>
        </div>
        {isDashboard ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              variant="ctaMotion"
              onClick={() => {
                setReanalyzeOpen(true);
                setReanalyzeError(null);
              }}
              className="gap-2 no-print"
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
                  className="gap-2 no-print"
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
                className="gap-2 no-print"
              >
                <Pencil size={16} />
                Editar
              </Button>
            )}
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <PublicThemeToggle className="no-print" />
            <p className="hidden max-w-[min(100%,28rem)] text-right text-sm leading-snug text-muted-foreground sm:block">
              Gerado para{" "}
              <span className="font-medium text-foreground">{report.leadCompany}</span>
            </p>
          </div>
        )}
      </div>

      {isDashboard ? (
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
      ) : null}

      {isDashboard && isEditing ? (
        <Card className={cn("no-print", ROTA_REPORT_SURFACE_SECTION, ROTA_REPORT_CARD_BOX)}>
          <CardHeader>
            <CardTitle className="text-base">Editar rota gerada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Resumo</label>
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
      <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-12">
        <Card
          className={cn(
            "min-w-0 overflow-visible border-border bg-gradient-to-b from-muted/40 to-transparent print-white md:col-span-8 dark:border-white/[0.06] dark:from-zinc-900/80 dark:to-transparent",
            ROTA_REPORT_CARD_BOX,
          )}
        >
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2.5">
              <SectionHeaderIcon Icon={Sparkles} tone="indigo" />
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground">
                Resumo
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ReportProseBlocks
              text={report.executiveSummary}
              size="lg"
              collapseToTwoParagraphs
            />
          </CardContent>
        </Card>

        <Card
          className={cn(
            "flex min-w-0 flex-col items-center justify-center overflow-visible border-border bg-muted/50 md:col-span-4 dark:border-border dark:bg-card/80",
            ROTA_REPORT_CARD_BOX,
          )}
        >
          <CardContent className="flex flex-col items-center gap-4 text-center">
            {hasBrandImage ? (
              <div
                className={
                  isWebsiteLogo
                    ? "rounded-2xl bg-gradient-to-tr from-brand/20 to-brand/35 p-1.5 ring-1 ring-white/10 dark:from-white/[0.08] dark:to-white/[0.04] dark:ring-white/10"
                    : "rounded-full bg-gradient-to-tr from-brand/20 to-brand/35 p-1.5 ring-1 ring-white/10 dark:from-white/[0.08] dark:to-white/[0.04] dark:ring-white/10"
                }
              >
                <EvidenceImage
                  src={brandImageSrc}
                  alt={isWebsiteLogo ? "Logo" : "Foto de perfil do Instagram"}
                  className={
                    isWebsiteLogo
                      ? "h-28 w-28 rounded-xl bg-white p-3 object-contain shadow-lg"
                      : "h-28 w-28 rounded-full border-2 border-border object-cover shadow-lg"
                  }
                />
              </div>
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-dashed border-border bg-card/95 dark:border-border dark:bg-muted/30">
                <Globe className="size-10 text-muted-foreground" />
              </div>
            )}
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-foreground">{report.leadCompany}</h3>
              <p className="text-sm font-medium leading-snug text-muted-foreground">
                Análise de presença digital
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPIs: Layout Bento com hierarquia e profundidade */}
      <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-12">
        {/* Maturidade Digital - Destaque */}
        <Card
          className={cn(
            "relative flex flex-col overflow-hidden border-border bg-gradient-to-b from-muted/40 to-transparent md:col-span-5 dark:border-white/[0.06] dark:from-zinc-900/80 dark:to-transparent",
            ROTA_REPORT_CARD_BOX,
          )}
        >
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-md border border-brand/30 bg-brand/10">
                <Target size={14} className="text-brand dark:text-brand" />
              </div>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground">
                Maturidade Digital
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-6">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold tracking-tight tabular-nums text-foreground">
                {report.digitalMaturityScore.toFixed(1)}
              </span>
              <span className="text-lg font-medium text-muted-foreground">/10</span>
            </div>
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-1000",
                    MATURITY_CONFIG[report.digitalMaturityLevel]?.bar || "bg-brand",
                  )}
                  style={{ width: `${report.digitalMaturityScore * 10}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <Badge
                  className={cn(
                    "border-none px-0 text-sm font-semibold bg-transparent",
                    MATURITY_CONFIG[report.digitalMaturityLevel]?.scoreText || "text-brand dark:text-brand",
                  )}
                >
                  Nível {report.digitalMaturityLevel}
                </Badge>
                <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Score
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Prazo estimado — fundo em destaque + CTA para apoio / especialista */}
        <Card
          className={cn(
            "relative flex flex-col overflow-hidden border-border bg-gradient-to-b from-muted/45 to-transparent md:col-span-3 print-white dark:border-white/[0.06] dark:from-zinc-900/85 dark:to-transparent",
            ROTA_REPORT_CARD_BOX,
          )}
        >
          <div
            className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-brand/[0.14] blur-3xl dark:bg-brand/15"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-12 -left-10 h-28 w-28 rounded-full bg-brand/10 blur-2xl dark:bg-brand/12"
            aria-hidden
          />
          <CardHeader className="relative pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-brand/35 bg-brand/10">
                <Calendar size={14} className="text-brand dark:text-brand" aria-hidden />
              </div>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground print:text-foreground">
                Prazo estimado
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="relative flex flex-1 flex-col justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-5xl font-bold tracking-tight tabular-nums text-brand dark:text-brand">
                  {report.estimatedTimelineMonths}
                </span>
                <span className="text-lg font-medium text-muted-foreground print:text-muted-foreground">meses</span>
              </div>
              <p className="border-l-2 border-brand/45 pl-2.5 text-[11px] leading-snug text-foreground/90 antialiased print:border-l-brand/50 print:text-zinc-800 dark:border-brand/40">
                Tempo previsto para{" "}
                <span className="font-semibold text-brand dark:text-brand print:text-zinc-900">
                  colocar este plano em prática
                </span>
                {" "}no seu negócio, em{" "}
                <span className="font-semibold text-brand dark:text-brand print:text-zinc-900">meses corridos</span>.
                <span className="text-muted-foreground print:text-muted-foreground">
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
                buttonVariants({ variant: "ctaMotionGreen", size: "lg" }),
                "no-print relative h-10 min-h-10 w-full justify-center gap-2 overflow-hidden px-4 text-center text-sm leading-snug sm:px-5",
              )}
            >
              {reportCta.top.useWhatsAppIcon ? (
                <WhatsAppIcon className="size-4 shrink-0" />
              ) : (
                <MessageSquare className="size-4 shrink-0" aria-hidden />
              )}
              {reportCta.top.label}
            </a>
          </CardContent>
        </Card>

        {/* Canais Recomendados - Lista Compacta */}
        <Card
          className={cn(
            "flex flex-col overflow-visible md:col-span-4",
            ROTA_REPORT_SURFACE_SECTION,
            ROTA_REPORT_CARD_BOX,
          )}
        >
          <CardHeader className="pb-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-muted dark:border-border dark:bg-muted">
                <Sparkles size={14} className="text-brand dark:text-brand" />
              </div>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground">
                Canais Recomendados
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3 overflow-visible">
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight tabular-nums text-foreground">
                {report.recommendedChannels.length}
              </span>
              <span className="text-sm font-medium text-muted-foreground">canais</span>
            </div>
            <div className="space-y-2 overflow-visible">
              {sortedChannels.slice(0, 3).map((ch, i) => (
                <div
                  key={ch.name}
                  className={cn("relative overflow-visible", i === 0 && "mt-1.5")}
                >
                  <div
                    className={cn(
                      "relative z-10 flex items-center justify-between gap-3 rounded-lg p-2.5",
                      ROTA_REPORT_SURFACE_INSET,
                    )}
                  >
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                      <div className="flex min-w-0 items-center gap-2">
                        {i === 0 ? (
                          <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand shadow-[0_0_10px_rgba(142,125,77,0.65)]" />
                        ) : (
                          <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                        )}
                        <span className="truncate text-[12px] font-semibold text-foreground">
                          {ch.name}
                        </span>
                      </div>
                    </div>
                    <Badge
                      className={cn(
                        "h-5 max-w-[min(100%,11rem)] shrink-0 border px-2 py-0 text-[10px] font-semibold leading-tight tracking-tight",
                        PRIORITY_COLORS[ch.priority] || PRIORITY_COLORS.Média,
                      )}
                    >
                      {channelPriorityBadgeLabel(ch.priority)}
                    </Badge>
                  </div>
                  {i === 0 ? (
                    <span
                      className="absolute right-4 top-0 z-0 inline-flex -translate-y-[calc(100%-6px)] shrink-0 items-center rounded-t-md rounded-b-none border-x border-t border-border/70 border-b-0 bg-transparent px-2 pb-2 pt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground dark:border-white/12 dark:bg-transparent dark:text-zinc-400 print:border-border print:bg-transparent print:text-foreground"
                      aria-hidden
                    >
                      Principal
                    </span>
                  ) : null}
                </div>
              ))}
              {sortedChannels.length > 3 && (
                <p className="text-center text-[10px] font-medium text-muted-foreground">
                  + {sortedChannels.length - 3} outros canais detalhados abaixo
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {isDashboard && (report.brief?.servicesOffered || report.brief?.objective) ? (
        <Card className={cn(ROTA_REPORT_SURFACE_SECTION, "print-white", ROTA_REPORT_CARD_BOX)}>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2.5">
              <SectionHeaderIcon Icon={FileText} tone="indigo" />
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground">
                Briefing informado
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-1">Serviços oferecidos</p>
              <ReportProseBlocks
                text={report.brief?.servicesOffered?.trim() ? report.brief.servicesOffered : "—"}
                size="sm"
                collapseToTwoParagraphs
                firstProminent={false}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-1">Objetivo</p>
              <ReportProseBlocks
                text={report.brief?.objective?.trim() ? report.brief.objective : "—"}
                size="sm"
                collapseToTwoParagraphs
                firstProminent={false}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {sortedDiagnosticScores.length > 0 ? (
        <Card
          id="report-section-diagnostico-topicos"
          className={cn(ROTA_REPORT_SURFACE_SECTION, "print-white", ROTA_REPORT_CARD_BOX)}
        >
          <CardHeader className="pb-6">
            <div className="flex items-center gap-2.5">
              <SectionHeaderIcon Icon={ClipboardList} tone="indigo" />
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground">
                Diagnóstico por tópico
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 lg:space-y-6">
            {sortedDiagnosticScores.map((item, idx) => {
              const topicGlow = getDiagnosticTopicGlow(item.score);
              return (
              <BorderGlow
                key={`${item.topic}-${idx}`}
                edgeSensitivity={30}
                glowColor={topicGlow.glowColor}
                backgroundColor="var(--card)"
                borderRadius={12}
                glowRadius={28}
                glowIntensity={0.8}
                coneSpread={25}
                animated={false}
                colors={topicGlow.colors}
                fillOpacity={0.35}
                contentInset={2}
                restingBorderColor={topicGlow.restingBorderColor}
                className="overflow-hidden rounded-xl print-white ring-1 ring-foreground/10"
              >
                <div className={cn("rounded-[10px] p-6 sm:p-7", ROTA_REPORT_SURFACE_GLOW_INNER)}>
                  <div className="grid gap-5 md:grid-cols-[360px_minmax(0,1fr)] md:items-start md:gap-6">
                    <TopicEvidence item={item} report={report} />
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2 pb-2">
                        <div className="space-y-1.5">
                          <DiagnosticTopicPill topic={item.topic} />
                        </div>
                        <Badge className={cn("text-xs font-bold px-2.5 py-0.5", getScoreBadgeClass(item.score))}>
                          {item.score}/10
                        </Badge>
                      </div>
                      <ReportProseBlocks text={item.comment} size="md" collapseToTwoParagraphs />
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
        <Card className={cn(ROTA_REPORT_SURFACE_SECTION, "print-white", ROTA_REPORT_CARD_BOX)}>
          <CardHeader className="space-y-3 pb-6">
            <div className="flex items-center gap-2.5">
              <SectionHeaderIcon Icon={Images} tone="indigo" />
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground">
                Evidências coletadas
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent
            className={`grid gap-5 ${
              report.evidences.instagramBioLinkSnapshotUrl ? "md:grid-cols-4" : "md:grid-cols-3"
            }`}
          >
            <div className="flex h-full min-h-0 flex-col gap-3">
              {/* Mobile: bio em texto duplica a captura do perfil — só mostrar a partir de md. */}
              <div className="flex flex-col gap-3 max-md:hidden">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Bio do Instagram</p>
                <div
                  className={cn(
                    "shrink-0 rounded-xl p-5",
                    ROTA_REPORT_SURFACE_INSET,
                    "shadow-none",
                  )}
                >
                  {/* Bio: manter quebras de linha como no Instagram (`\\n` na coleta), sem normalizar em frases. */}
                  <p className="text-[14px] leading-relaxed text-foreground whitespace-pre-line break-words [overflow-wrap:anywhere]">
                    {report.evidences.instagramBioExcerpt?.trim()
                      ? report.evidences.instagramBioExcerpt
                      : report.evidences.instagramSnapshotUrl
                        ? "A bio não foi extraída em texto na coleta automática — confira a captura do perfil ao lado para ler a bio e as métricas na imagem."
                        : "Bio não disponível na coleta automática."}
                  </p>
                </div>
              </div>
              {briefWebsiteHref || briefInstagramHref ? (
                <div className="flex flex-col gap-2.5 max-md:mt-0 max-md:pt-0 max-md:pb-6 md:mt-auto md:pt-4 md:pb-0">
                  <div className="flex flex-col gap-2">
                    {briefWebsiteHref ? (
                      <a
                        href={briefWebsiteHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={briefWebsiteHref}
                        className="inline-flex items-center gap-2 rounded-lg border border-brand/25 bg-brand/[0.07] px-3 py-2.5 text-sm font-medium text-brand shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition-colors hover:border-brand/40 hover:bg-brand/[0.12] hover:text-brand dark:border-brand/30 dark:bg-brand/[0.1] dark:shadow-none dark:hover:border-brand/45 dark:hover:bg-brand/[0.16]"
                      >
                        <ExternalLink size={14} className="shrink-0 opacity-90" aria-hidden />
                        <span className="min-w-0 truncate">Website</span>
                      </a>
                    ) : null}
                    {briefInstagramHref ? (
                      <a
                        href={briefInstagramHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={briefInstagramHref}
                        className="inline-flex items-center gap-2 rounded-lg border border-brand/25 bg-brand/[0.07] px-3 py-2.5 text-sm font-medium text-brand shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition-colors hover:border-brand/40 hover:bg-brand/[0.12] hover:text-brand dark:border-brand/30 dark:bg-brand/[0.1] dark:shadow-none dark:hover:border-brand/45 dark:hover:bg-brand/[0.16]"
                      >
                        <InstagramBrandGlyph className="size-3.5 shrink-0 opacity-90" aria-hidden />
                        <span className="min-w-0 truncate">Instagram</span>
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Imagem do Instagram</p>
              <EvidenceImage
                src={withSnapshotParams(instagramEvidenceSrc, {
                  variant: "profile",
                  start: 1,
                })}
                alt="Imagem do Instagram"
                hoverScroll
                frameClassName="h-64 w-full rounded-md border border-border bg-muted"
                className="h-auto"
              />
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Página completa do site</p>
              <EvidenceImage
                src={report.evidences.siteHeroSnapshotUrl}
                alt="Página completa do site"
                fitContain
                fitContainMode="cover"
                hoverScroll
                initialOffsetRatio={FULL_PAGE_SNAPSHOT_IDLE_FROM_TOP_RATIO}
                frameClassName="h-64 w-full rounded-md border border-border bg-muted"
                className="h-auto"
              />
            </div>

            {report.evidences.instagramBioLinkSnapshotUrl ? (
              <div className="max-md:hidden space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Destino do link da bio</p>
                <EvidenceImage
                  src={report.evidences.instagramBioLinkSnapshotUrl}
                  alt="Destino do link da bio"
                  fitContain
                  fitContainMode="cover"
                  hoverScroll
                  initialOffsetRatio={FULL_PAGE_SNAPSHOT_IDLE_FROM_TOP_RATIO}
                  frameClassName="h-64 w-full rounded-md border border-border bg-muted"
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
                    backgroundColor="var(--card)"
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
                    <div
                      className={cn(
                        "rounded-[8px] border border-border p-5 shadow-sm sm:p-6 dark:border-border print:border-zinc-300",
                        ROTA_REPORT_SURFACE_GLOW_INNER,
                      )}
                    >
                      <div className={cn("mb-5", TOPIC_PILL_WEBSITE)}>
                        <Globe className="size-3.5 shrink-0 stroke-[1.75] text-sky-600 dark:text-sky-400" aria-hidden />
                        <span className={TOPIC_PILL_LABEL_NEXT_TO_ICON}>Website</span>
                      </div>
                      <EvidenceResearchNoteProse
                        text={
                          notes.website ||
                          "Website: não foi possível validar conteúdo relevante; tratar como presença fraca ou inexistente até revisão manual."
                        }
                        size="md"
                      />
                    </div>
                  </BorderGlow>
                  <BorderGlow
                    edgeSensitivity={30}
                    glowColor="318 72 58"
                    backgroundColor="var(--card)"
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
                    <div
                      className={cn(
                        "rounded-[8px] border border-border p-5 shadow-sm sm:p-6 dark:border-border print:border-zinc-300",
                        ROTA_REPORT_SURFACE_GLOW_INNER,
                      )}
                    >
                      <div className={cn("mb-5", TOPIC_PILL_INSTAGRAM)}>
                        <InstagramBrandGlyph className="size-3.5 text-pink-600 dark:text-pink-400" aria-hidden />
                        <span className={TOPIC_PILL_LABEL_NEXT_TO_ICON}>Instagram</span>
                      </div>
                      <EvidenceResearchNoteProse text={normalizedInstagramNote} size="md" />
                    </div>
                  </BorderGlow>
                  {notes.general.length > 0 ? (
                    <div className="space-y-3">
                      {notes.general.map((paragraph, i) => (
                        <ReportProseBlocks
                          key={i}
                          text={paragraph}
                          size="sm"
                          collapseToTwoParagraphs
                          firstProminent={false}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* SWOT — moldura com BorderGlow (antes eram só Card, sem hover na borda). */}
      <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-3 md:items-stretch [--rota-swot-surface:var(--card)] dark:[--rota-swot-surface:#09090b]">
        <BorderGlow
          edgeSensitivity={30}
          glowColor="148 42 44"
          backgroundColor="var(--rota-swot-surface)"
          borderRadius={12}
          glowRadius={28}
          glowIntensity={0.8}
          coneSpread={25}
          animated={false}
          colors={["#5a7a64", "#4d6856", "#7a9a84"]}
          fillOpacity={1}
          contentInset={2}
          disableBorderGlowOnMobile
          restingBorderColor={PRIORITY_RESTING_BORDER.Baixa}
          className="h-full min-h-0 min-w-0 overflow-hidden rounded-xl ring-1 ring-foreground/10 print-white"
        >
          <Card
            className={cn(
              "relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-[color:var(--rota-sev-c-border)]/22 bg-gradient-to-b from-[color:var(--rota-sev-c-bar)]/[0.08] to-transparent text-foreground shadow-none ring-0 rounded-[10px] print-white",
              ROTA_SWOT_CARD_BOX,
            )}
          >
            <CardHeader className="flex flex-row items-center gap-2.5 pb-2 sm:gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--rota-sev-c-bar)]/12 ring-1 ring-[color:var(--rota-sev-c-border)]/25">
                <TrendingUp
                  size={18}
                  className="text-[color:var(--rota-sev-c-fg)] dark:text-[color:var(--rota-sev-c-fg-dark)]"
                />
              </div>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-[color:var(--rota-sev-c-fg)] dark:text-[color:var(--rota-sev-c-fg-dark)]">
                Forças
              </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              <ul className="space-y-0">
                {report.strengths.map((s, i) => (
                  <li
                    key={i}
                    className={cn(
                      "relative flex items-center gap-3 py-3.5 text-sm leading-relaxed text-foreground/90 sm:py-4",
                      i > 0 &&
                        "before:pointer-events-none before:absolute before:left-0 before:right-[8%] before:top-0 before:h-px before:rounded-full before:bg-gradient-to-r before:from-[color:var(--rota-sev-c-border)]/45 before:via-[color:var(--rota-sev-c-bar)]/28 before:to-transparent before:content-[''] dark:before:from-[color:var(--rota-sev-c-border)]/38 dark:before:via-[color:var(--rota-sev-c-bar)]/22 print:before:hidden",
                    )}
                  >
                    <CheckCircle2 size={16} className="shrink-0 text-[color:var(--rota-sev-c-border)]/70" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </BorderGlow>

        <BorderGlow
          edgeSensitivity={30}
          glowColor="24 58 48"
          backgroundColor="var(--rota-swot-surface)"
          borderRadius={12}
          glowRadius={28}
          glowIntensity={0.8}
          coneSpread={25}
          animated={false}
          colors={["#b85c52", "#9e4a42", "#d48072"]}
          fillOpacity={1}
          contentInset={2}
          disableBorderGlowOnMobile
          restingBorderColor={PRIORITY_RESTING_BORDER.Alta}
          className="h-full min-h-0 min-w-0 overflow-hidden rounded-xl ring-1 ring-foreground/10 print-white"
        >
          <Card
            className={cn(
              "relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-[color:var(--rota-sev-a-border)]/22 bg-gradient-to-b from-[color:var(--rota-sev-a-bar)]/[0.07] to-transparent text-foreground shadow-none ring-0 rounded-[10px] print-white",
              ROTA_SWOT_CARD_BOX,
            )}
          >
            <CardHeader className="flex flex-row items-center gap-2.5 pb-2 sm:gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--rota-sev-a-bar)]/12 ring-1 ring-[color:var(--rota-sev-a-border)]/25">
                <TrendingDown
                  size={18}
                  className="text-[color:var(--rota-sev-a-fg)] dark:text-[color:var(--rota-sev-a-fg-dark)]"
                />
              </div>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-[color:var(--rota-sev-a-fg)] dark:text-[color:var(--rota-sev-a-fg-dark)]">
                Fraquezas
              </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              <ul className="space-y-0">
                {report.weaknesses.map((w, i) => (
                  <li
                    key={i}
                    className={cn(
                      "relative flex items-center gap-3 py-3.5 text-sm leading-relaxed text-foreground/90 sm:py-4",
                      i > 0 &&
                        "before:pointer-events-none before:absolute before:left-0 before:right-[8%] before:top-0 before:h-px before:rounded-full before:bg-gradient-to-r before:from-[color:var(--rota-sev-a-border)]/45 before:via-[color:var(--rota-sev-a-bar)]/28 before:to-transparent before:content-[''] dark:before:from-[color:var(--rota-sev-a-border)]/38 dark:before:via-[color:var(--rota-sev-a-bar)]/22 print:before:hidden",
                    )}
                  >
                    <AlertCircle size={16} className="shrink-0 text-[color:var(--rota-sev-a-border)]/65" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </BorderGlow>

        <BorderGlow
          edgeSensitivity={30}
          glowColor="72 52 52"
          backgroundColor="var(--rota-swot-surface)"
          borderRadius={12}
          glowRadius={28}
          glowIntensity={0.8}
          coneSpread={25}
          animated={false}
          colors={["#c4a85a", "#a88f4a", "#e0cc88"]}
          fillOpacity={1}
          contentInset={2}
          disableBorderGlowOnMobile
          restingBorderColor={PRIORITY_RESTING_BORDER.Média}
          className="h-full min-h-0 min-w-0 overflow-hidden rounded-xl ring-1 ring-foreground/10 print-white"
        >
          <Card
            className={cn(
              "relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-[color:var(--rota-sev-b-border)]/22 bg-gradient-to-b from-[color:var(--rota-sev-b-bar)]/[0.08] to-transparent text-foreground shadow-none ring-0 rounded-[10px] print-white",
              ROTA_SWOT_CARD_BOX,
            )}
          >
            <CardHeader className="flex flex-row items-center gap-2.5 pb-2 sm:gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--rota-sev-b-bar)]/12 ring-1 ring-[color:var(--rota-sev-b-border)]/25">
                <Target
                  size={18}
                  className="text-[color:var(--rota-sev-b-fg)] dark:text-[color:var(--rota-sev-b-fg-dark)]"
                />
              </div>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-[color:var(--rota-sev-b-fg)] dark:text-[color:var(--rota-sev-b-fg-dark)]">
                Oportunidades
              </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              <ul className="space-y-0">
                {report.opportunities.map((o, i) => (
                  <li
                    key={i}
                    className={cn(
                      "relative flex items-center gap-3 py-3.5 text-sm leading-relaxed text-foreground/90 sm:py-4",
                      i > 0 &&
                        "before:pointer-events-none before:absolute before:left-0 before:right-[8%] before:top-0 before:h-px before:rounded-full before:bg-gradient-to-r before:from-[color:var(--rota-sev-b-border)]/45 before:via-[color:var(--rota-sev-b-bar)]/28 before:to-transparent before:content-[''] dark:before:from-[color:var(--rota-sev-b-border)]/38 dark:before:via-[color:var(--rota-sev-b-bar)]/22 print:before:hidden",
                    )}
                  >
                    <Star size={16} className="shrink-0 text-[color:var(--rota-sev-b-border)]/68" />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </BorderGlow>
      </div>

      {/* Recommended Channels */}
      <Card
        className={cn(
          "overflow-visible",
          ROTA_REPORT_SURFACE_SECTION,
          "print-white",
          ROTA_REPORT_CARD_BOX,
        )}
      >
        <CardHeader className="pb-6">
          <div className="flex items-center gap-2.5">
            <SectionHeaderIcon Icon={Sparkles} tone="indigo" />
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground">
              Canais Digitais Recomendados
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="overflow-visible">
          <div className="grid grid-cols-1 gap-10 md:auto-rows-fr md:grid-cols-2 md:items-stretch md:gap-5">
            {sortedChannels.map((channel, i) => (
              <ChannelCard key={i} channel={channel} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick wins / longo prazo: apoio à leitura — contraste melhor que muted/50, sem competir com Próximos passos (spotlight + linhas com marca). */}
      <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
        <Card
          className={cn(
            "min-w-0 gap-2 overflow-hidden",
            ROTA_REPORT_SURFACE_SECTION,
            "print-white",
            ROTA_REPORT_CARD_BOX_FLUSH_TOP,
          )}
        >
          <header className={ROTA_ACTIONLIST_INNER_HEADER}>
            <div className="flex min-h-[2.75rem] items-center gap-3 sm:min-h-[3rem]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-brand/30 bg-brand/[0.12] dark:border-brand/25 dark:bg-brand/[0.1]">
                <Zap size={19} className="text-brand dark:text-brand" aria-hidden />
              </div>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground dark:text-zinc-100">
                O que fazer primeiro
              </CardTitle>
            </div>
          </header>
          <CardContent>
            <ul className="space-y-0">
              {report.quickWins.map((win, i) => (
                <li
                  key={i}
                  className={cn(
                    "relative flex items-center gap-4 py-3.5 text-[14px] leading-relaxed text-foreground sm:py-4 dark:text-zinc-200/95",
                    i > 0 &&
                      "before:pointer-events-none before:absolute before:left-0 before:right-[8%] before:top-0 before:h-px before:rounded-full before:bg-gradient-to-r before:from-border before:via-border/70 before:to-transparent before:content-[''] dark:before:from-white/22 dark:before:via-white/12 print:before:hidden",
                  )}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-[11px] font-semibold tabular-nums text-foreground/90 ring-1 ring-border/80 dark:border-border dark:bg-background dark:text-zinc-300 dark:ring-border">
                    {i + 1}
                  </div>
                  <span>{win}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card
          className={cn(
            "min-w-0 gap-2 overflow-hidden",
            ROTA_REPORT_SURFACE_SECTION,
            "print-white",
            ROTA_REPORT_CARD_BOX_FLUSH_TOP,
          )}
        >
          <header className={ROTA_ACTIONLIST_INNER_HEADER}>
            <div className="flex min-h-[2.75rem] items-center gap-3 sm:min-h-[3rem]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-brand/30 bg-brand/[0.12] dark:border-brand/25 dark:bg-brand/[0.1]">
                <Target size={19} className="text-brand dark:text-brand" aria-hidden />
              </div>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground dark:text-zinc-100">
                Ações de Longo Prazo
              </CardTitle>
            </div>
          </header>
          <CardContent>
            <ul className="space-y-0">
              {report.longTermActions.map((action, i) => (
                <li
                  key={i}
                  className={cn(
                    "relative flex items-center gap-4 py-3.5 text-[14px] leading-relaxed text-foreground sm:py-4 dark:text-zinc-200/95",
                    i > 0 &&
                      "before:pointer-events-none before:absolute before:left-0 before:right-[8%] before:top-0 before:h-px before:rounded-full before:bg-gradient-to-r before:from-border before:via-border/70 before:to-transparent before:content-[''] dark:before:from-white/22 dark:before:via-white/12 print:before:hidden",
                  )}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-[11px] font-semibold tabular-nums text-foreground/90 ring-1 ring-border/80 dark:border-border dark:bg-background dark:text-zinc-300 dark:ring-border">
                    {i + 1}
                  </div>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
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
          <CardHeader className="px-4 pb-6 pt-0 sm:px-7 sm:pb-7 sm:pt-0">
            <div className="flex items-center gap-2.5">
              <SectionHeaderIcon Icon={ArrowRight} tone="indigo" />
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground">
                Próximos Passos
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-0 sm:px-7">
            <div className="space-y-3">
              {report.nextSteps.map((step, i) => (
                <div
                  key={i}
                  className="flex min-w-0 w-full items-center gap-4 rounded-xl border border-border/90 bg-card/75 p-4 transition-colors hover:border-brand/40 dark:border-border dark:bg-secondary/55"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand/40 bg-brand/10">
                    <span className="text-[11px] font-bold text-brand dark:text-brand">{i + 1}</span>
                  </div>
                  <p className="min-w-0 flex-1 text-[14.5px] leading-relaxed text-foreground">{step}</p>
                </div>
              ))}
            </div>
          </CardContent>
          {/*
            CTA fora do CardContent: o relatório aplica [&_[data-slot=card-content]]:!px-* ao slot;
            manter o mesmo alinhamento horizontal (px-5 sm:px-7) e largura total até md (tablets estreitos).
          */}
          <div
            id="report-chamada-acao"
            className="scroll-mt-6 mt-6 box-border w-full min-w-0 max-w-full shrink-0 px-5 pb-10 pt-0 sm:px-7 sm:pb-8"
          >
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
                buttonVariants({ variant: "ctaMotionGreen", size: "lg" }),
                "no-print box-border h-10 min-h-10 items-center justify-center gap-2 overflow-hidden px-4 md:px-5",
                /* Largura total: telemóvel e tablet até md; a partir de md o botão volta ao tamanho do conteúdo. */
                "flex w-full min-w-0 max-w-full md:inline-flex md:w-auto md:max-w-none md:shrink-0",
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
        </Card>
      </CardSpotlight>

      {/* Footer */}
      <div className="text-center text-muted-foreground text-xs leading-snug py-4 no-print">
        <span className="block">Rota Digital</span>
        <span className="mt-1 block">{reportCreatedAtLine2}</span>
      </div>

      <PublicReportFloatingCta bottomCta={reportCta.bottom} />
    </div>
  );
}
