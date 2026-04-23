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
import { motion } from "motion/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getProposalByLead } from "@/lib/proposals";
import { updateReport } from "@/lib/reports";
import {
  describeManualUploadFailure,
  uploadUserEvidenceImageForReport,
  uploadUserSettingsImage,
} from "@/lib/evidence-storage";
import { maturityFromDiagnosticScores } from "@/lib/maturity-from-diagnostics";
import {
  getUserCompanyAboutSettings,
  getUserReportCtaSettings,
  saveUserCompanyAboutSettings,
} from "@/lib/user-settings";
import {
  DEFAULT_COMPANY_ABOUT_NAME,
  resolveCompanyAboutNameForDisplay,
  resolveCompanyAboutSummaryForDisplay,
  resolveCompanyPrimaryImageForDisplay,
  resolveCompanyAboutSummaryForSave,
} from "@/lib/company-about-defaults";
import { createEmptyProposalPlan } from "@/lib/proposal-plan-factory";
import { resolveReportCtas } from "@/lib/report-cta";
import { PublicReportFloatingCta } from "@/components/rotas/public-report-floating-cta";
import { GenerateRouteProgressOverlay } from "@/components/rotas/generate-route-progress-overlay";
import { DashboardEditableRegion } from "@/components/rotas/dashboard-editable-region";
import { DiagnosticScoreSlider } from "@/components/rotas/diagnostic-score-slider";
import { RotaDigitalReport, DigitalChannel, DiagnosticScore } from "@/types/report";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  Calendar,
  Check,
  CheckCircle2,
  AlertCircle,
  Star,
  ArrowRight,
  ExternalLink,
  Globe,
  ImageUp,
  X,
  Bot,
  Info,
  Compass,
  Palette,
  Filter,
  Lightbulb,
  MessageSquare,
  Tag,
  ClipboardList,
  Copy,
  Link2,
  Mail,
  Plus,
  Minus,
  Pencil,
  Trash2,
  FileText,
  Images,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/link-button";
import { QuotaGuardLink } from "@/components/limits/quota-gate-context";
import BorderGlow from "@/components/BorderGlow";
import { CardSpotlight } from "@/components/ui/card-spotlight";
import { cn } from "@/lib/utils";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import type { UserCompanyAboutSettings, UserReportCtaSettings } from "@/types/user-settings";
import { PublicThemeToggle } from "@/components/public-theme-toggle";
import { PublicThemeToggleHint } from "@/components/public-theme-toggle-hint";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { PlanLimitModal, type PlanLimitModalState } from "@/components/limits/plan-limit-modal";
import { ReportPlacesSections } from "@/components/rotas/report-places-sections";
import { planIdFromUserSettings, type PlanId } from "@/lib/plan-limits";
import { normalizedSubscriptionPlanKey, planAllowsCustomLogo } from "@/lib/plan-quotas";

function createDefaultCompanyAboutSettings(): UserCompanyAboutSettings {
  return {
    companyName: DEFAULT_COMPANY_ABOUT_NAME,
    companySummary: "",
    primaryImageUrl: "",
    secondaryImageUrl: "",
    companyPhone: "",
    whatsApp: "",
    address: "",
    websiteUrl: "",
    instagramUrl: "",
    youtubeUrl: "",
    services: "",
    defaultSpotPlans: [createEmptyProposalPlan()],
    defaultRecurringPlans: [createEmptyProposalPlan()],
    hideReportAgencyBranding: false,
  };
}

const PRIORITY_COLORS: Record<string, string> = {
  Alta:
    "border border-[color:var(--rota-sev-a-border)]/45 bg-[color:var(--rota-sev-a-bar)]/16 text-[color:var(--rota-sev-a-fg)] shadow-sm shadow-[color:var(--rota-sev-a-border)]/10 dark:shadow-none dark:bg-[color:var(--rota-sev-a-bar)]/22 dark:text-[color:var(--rota-sev-a-fg-dark)] dark:border-[color:var(--rota-sev-a-border)]/45",
  Média:
    "border border-[color:var(--rota-sev-b-border)]/42 bg-[color:var(--rota-sev-b-bar)]/14 text-[color:var(--rota-sev-b-fg)] shadow-sm shadow-[color:var(--rota-sev-b-border)]/10 dark:shadow-none dark:bg-[color:var(--rota-sev-b-bar)]/18 dark:text-[color:var(--rota-sev-b-fg-dark)] dark:border-[color:var(--rota-sev-b-border)]/42",
  Baixa:
    "border border-[color:var(--rota-sev-c-border)]/42 bg-[color:var(--rota-sev-c-bar)]/14 text-[color:var(--rota-sev-c-fg)] shadow-sm shadow-[color:var(--rota-sev-c-border)]/10 dark:shadow-none dark:bg-[color:var(--rota-sev-c-bar)]/18 dark:text-[color:var(--rota-sev-c-fg-dark)] dark:border-[color:var(--rota-sev-c-border)]/42",
};

/**
 * Aba â€œPrioridade â€¦â€ acima do card de canal.
 * Modo claro: fundo suave + texto escuro + borda visível (harmonia no fundo branco do relatório).
 * Modo escuro: mantém o chip escuro com texto claro.
 */
const CHANNEL_PRIORITY_TAB_SURFACE: Record<string, string> = {
  Alta:
    "!shadow-sm !border-x !border-t !border-b-0 !border-[color:var(--rota-sev-a-border)]/55 !bg-[oklch(0.97_0.022_42)] !text-[color:var(--rota-sev-a-fg)] !font-semibold dark:!shadow-none dark:!border-transparent dark:!bg-[oklch(0.2_0.04_38_/_0.94)] dark:!text-[color:var(--rota-sev-a-fg-dark)]",
  Média:
    "!shadow-sm !border-x !border-t !border-b-0 !border-[color:var(--rota-sev-b-border)]/52 !bg-[oklch(0.97_0.02_82)] !text-[color:var(--rota-sev-b-fg)] !font-semibold dark:!shadow-none dark:!border-transparent dark:!bg-[oklch(0.22_0.03_78_/_0.92)] dark:!text-[color:var(--rota-sev-b-fg-dark)]",
  Baixa:
    "!shadow-sm !border-x !border-t !border-b-0 !border-[color:var(--rota-sev-c-border)]/52 !bg-[oklch(0.97_0.018_150)] !text-[color:var(--rota-sev-c-fg)] !font-semibold dark:!shadow-none dark:!border-transparent dark:!bg-[oklch(0.2_0.035_152_/_0.92)] dark:!text-[color:var(--rota-sev-c-fg-dark)]",
};

/** Borda 1px do BorderGlow em repouso (inline â€” evita conflito com `border-border` do componente). */
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

/** Caixa do Ã­cone nas aÃ§Ãµes do card de canal â€” harmoniza com a prioridade. */
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

/** Pill â€œWebsiteâ€ â€” lavagem azul muito suave + borda discreta (evidÃªncias). */
const TOPIC_PILL_WEBSITE =
  "inline-flex max-w-full items-center gap-1.5 rounded-full border border-sky-300/50 bg-gradient-to-r from-sky-500/[0.08] via-blue-500/[0.07] to-indigo-500/[0.08] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide leading-none text-foreground dark:border-sky-500/30 dark:from-sky-400/[0.12] dark:via-blue-500/[0.10] dark:to-indigo-500/[0.11]";

/** Pill â€œInstagramâ€ â€” lavagem rosa/roxo suave + borda discreta (evidÃªncias). */
const TOPIC_PILL_INSTAGRAM =
  "inline-flex max-w-full items-center gap-1.5 rounded-full border border-pink-300/45 bg-gradient-to-r from-fuchsia-500/[0.07] via-rose-500/[0.08] to-amber-500/[0.07] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide leading-none text-foreground dark:border-pink-500/28 dark:from-fuchsia-500/[0.11] dark:via-rose-500/[0.10] dark:to-amber-500/[0.09]";

function channelCardPillClass(channelName: string): string {
  const n = channelName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("instagram")) return TOPIC_PILL_INSTAGRAM;
  if (n.includes("website") || n === "site" || n.startsWith("site ")) return TOPIC_PILL_WEBSITE;
  return TOPIC_PILL_BRAND;
}

/** RÃ³tulo ao lado de Ã­cone na pill â€” desce o texto para alinhar ao centro Ã³ptico do glifo. */
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
 * Casco dos blocos principais: sÃ³ padding vertical extra no Card (sem -mx / calc â€” isso â€œcomiaâ€ a margem lateral).
 */
const ROTA_REPORT_CARD_BOX = "py-6 sm:py-7";
/** Bloco «Sobre a agência» — padding vertical do casco alinhado em cima/baixo (conteúdo com `p` uniforme + ícone no canto). */
const ROTA_REPORT_AGENCY_CARD_BOX = "py-3.5 sm:py-4";

/** Casco vertical quando o topo do card Ã© â€œcoladoâ€ ao primeiro bloco (ex.: faixa de cabeÃ§alho interna). */
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

/** Faixa superior dentro dos cards â€œO que fazer primeiroâ€ / â€œLongo prazoâ€ (corpo da lista fica mais claro). */
const ROTA_ACTIONLIST_INNER_HEADER =
  "relative overflow-hidden border-b border-border/70 bg-gradient-to-b from-muted/50 via-muted/28 to-transparent px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-brand/35 before:to-transparent dark:border-white/[0.09] dark:from-zinc-900/95 dark:via-zinc-900/86 dark:to-zinc-950/88 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] dark:before:via-brand/40 sm:px-7 sm:py-5 sm:before:inset-x-7 print:border-zinc-200 print:from-zinc-100 print:via-zinc-50 print:to-white";

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

/** Quebras â€œmanuaisâ€ antes de frases que costumam ser recomendaÃ§Ãµes (melhor escaneabilidade). */
function applyReadingHeuristics(text: string): string {
  return text
    /* Evitar quebra forÃ§ada antes de "Para chegar a 10â€¦" â€” o prompt jÃ¡ pede uma Ãºnica abertura; duplicar parÃ¡grafos ficava redundante. */
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
 * Divide texto longo da IA em blocos curtos (1â€“2 frases) para leitura mais fluida.
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

/** Blocos de texto com respiro entre frases â€” uso nos cards do relatÃ³rio. */
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

/** Capturas de pÃ¡gina (Microlink etc.): cabem inteiras no quadro com object-contain, sem â€œscrollâ€ no hover. */
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
      /** H S L para `buildBoxShadow` â€” matiz terracota (~24Â°) */
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

/** Reconstrói `evidences.researchNotes` após edição de Website / Instagram no dashboard. */
function buildResearchNotesFromParts(parts: {
  website: string;
  instagram: string;
  general: string[];
}): string {
  const w = parts.website.trim();
  const ig = parts.instagram.trim();
  const gen = parts.general.map((g) => g.trim()).filter(Boolean);
  let out = `Website (validação automática):\n\n${w}\n\nInstagram (validação automática):\n\n${ig}`;
  for (const g of gen) {
    out += `\n\n${g}`;
  }
  return out;
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

const REANALYZE_PROGRESS_TO_88_MS = 90 * 1000;
const REANALYZE_FINAL_PROGRESS_MS = 2200;

function easeOutCubicReanalyze(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Anima de `from` até 100% em `durationMs` (requestAnimationFrame). */
function runProgressTo100Reanalyze(
  from: number,
  durationMs: number,
  onFrame: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const start = Math.min(100, Math.max(0, from));
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / durationMs);
      const pct = start + (100 - start) * easeOutCubicReanalyze(u);
      onFrame(Math.min(100, Math.round(pct * 100) / 100));
      if (u < 1) {
        requestAnimationFrame(step);
      } else {
        onFrame(100);
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

function EvidenceReplaceToolbar({
  ariaLabel,
  busy,
  onPickFile,
}: {
  ariaLabel: string;
  busy: boolean;
  onPickFile: (file: File) => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onPickFile(f);
        }}
      />
      <div className="no-print pointer-events-auto absolute left-1/2 top-1/2 z-[35] -translate-x-1/2 -translate-y-1/2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          className="size-12 rounded-xl border-2 border-border/80 bg-background/95 text-zinc-900 shadow-md ring-1 ring-foreground/10 backdrop-blur-sm hover:border-border hover:bg-muted hover:text-zinc-950 active:not-aria-[haspopup]:translate-y-0 dark:border-white/15 dark:text-white dark:ring-white/15 dark:hover:border-white/25 dark:hover:text-white"
          aria-label={ariaLabel}
          title={ariaLabel}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImageUp className="size-5" aria-hidden />}
        </Button>
      </div>
    </>
  );
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
  replaceToolbar,
}: {
  src?: string;
  alt: string;
  className?: string;
  frameClassName?: string;
  hoverScroll?: boolean;
  /** Deslocamento inicial em repouso (0â€“1 do overflow). Preferir 0 para nÃ£o cortar o topo da captura. */
  initialOffsetRatio?: number;
  /** Encolhe a captura inteira dentro do quadro (site/Microlink), sem crop tipo zoom. */
  fitContain?: boolean;
  /** `contain`: imagem inteira visível; `cover`: preenche a box (pode cortar bordas). */
  fitContainMode?: "width" | "height" | "cover";
  /** Só dashboard: ícone para substituir a imagem por ficheiro local. */
  replaceToolbar?: { ariaLabel: string; busy: boolean; onPickFile: (file: File) => void | Promise<void> };
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

  /** Scroll no hover: modo scroll â€œclÃ¡ssicoâ€ ou `fitContain` sÃ³ em `cover` (box preenchida + pan vertical). */
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

  const wrapReplace = (node: ReactNode) => {
    if (!replaceToolbar) return node;
    return (
      <div className="relative w-full">
        {node}
        <EvidenceReplaceToolbar {...replaceToolbar} />
      </div>
    );
  };

  if (!resolvedSrc || failed) {
    return wrapReplace(
      <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/45 px-3 text-center text-xs text-muted-foreground">
        Sem imagem disponível
      </div>,
    );
  }

  /** Com hover: do topo ou do meio â†’ desce atÃ© o fim; se o repouso jÃ¡ estÃ¡ no rodapÃ© (funil/CTA) â†’ sobe para o topo. */
  const hoverPanTranslateY =
    hovered && scrollOffset > 0
      ? restOffset >= scrollOffset * 0.72
        ? 0
        : scrollOffset
      : restOffset;

  if (fitContain) {
    if (fitContainMode === "cover") {
      if (panInteractive) {
        return wrapReplace(
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
                // Pan longo sÃ³ com o mouse em cima; em repouso nÃ£o â€œanimaâ€ sozinho.
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
          </div>,
        );
      }

      return wrapReplace(
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
        </div>,
      );
    }

    const containClass =
      fitContainMode === "height"
        ? "h-full w-full object-contain object-top"
        : "h-auto w-full max-w-full object-contain object-top";

    return wrapReplace(
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
      </div>,
    );
  }

  if (!panInteractive) {
    return wrapReplace(
      <img src={resolvedSrc} alt={alt} className={className} onError={() => setFailed(true)} />,
    );
  }

  return wrapReplace(
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
    </div>,
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

/** Alinhado ao `generate-route`: sÃ³ Instagram/rede, exceto â€œconsistÃªncia â€¦ comunicaÃ§Ã£oâ€ (cruzado). */
function isInstagramOnlyDiagnosticTopic(topicLower: string): boolean {
  const ascii = topicLower
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const crossChannel = ascii.includes("consistencia") && ascii.includes("comunicacao");
  return (topicLower.includes("instagram") || topicLower.includes("rede")) && !crossChannel;
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
  isDashboard,
  replaceToolbarSite,
  replaceToolbarInstagram,
  replaceToolbarSingle,
}: {
  item: DiagnosticScore;
  report: RotaDigitalReport;
  isDashboard?: boolean;
  replaceToolbarSite?: { ariaLabel: string; busy: boolean; onPickFile: (file: File) => void | Promise<void> };
  replaceToolbarInstagram?: { ariaLabel: string; busy: boolean; onPickFile: (file: File) => void | Promise<void> };
  replaceToolbarSingle?: { ariaLabel: string; busy: boolean; onPickFile: (file: File) => void | Promise<void> };
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
    const siteCellSrc = item.evidenceSiteImageUrl?.trim() || siteSrc || item.evidenceImageUrl?.trim();
    const instagramForCell = item.evidenceInstagramImageUrl?.trim() || instagramSrc;

    return (
      <div className="grid h-56 w-full grid-cols-2 gap-2">
        <EvidenceImage
          src={siteCellSrc}
          alt={`Site em ${item.topic}`}
          fitContain
          fitContainMode="cover"
          hoverScroll
          initialOffsetRatio={combinedGridIdleRatio}
          frameClassName="h-56 w-full rounded-md border border-border bg-muted/55"
          className="h-auto"
          replaceToolbar={isDashboard ? replaceToolbarSite : undefined}
        />
        <EvidenceImage
          src={withSnapshotParams(instagramForCell, {
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
          replaceToolbar={isDashboard ? replaceToolbarInstagram : undefined}
        />
      </div>
    );
  }

  const siteFallback =
    siteSrc && !isInstagramOnlyDiagnosticTopic(topic) ? siteSrc : undefined;

  /** Prioridade: URL própria do tópico (IA ou “Substituir evidência”); só depois a captura global. Assim, trocar a imagem no bloco principal não força a mesma no diagnóstico. */
  const perTopicOrGlobalIg =
    item.evidenceImageUrl?.trim() || item.evidenceInstagramImageUrl?.trim() || instagramSrc;
  const evidenceSrc = (() => {
    if (topic.includes("identidade visual")) {
      return withSnapshotParams(perTopicOrGlobalIg || siteFallback, {
        variant: "feed",
        start: 6,
      });
    }
    if (topic.includes("consist")) {
      return withSnapshotParams(perTopicOrGlobalIg || siteFallback, {
        variant: "profile",
        start: 1,
      });
    }
    return item.evidenceImageUrl || siteFallback;
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
      replaceToolbar={isDashboard ? replaceToolbarSingle : undefined}
    />
  );
}

/** Secções de lista no dashboard: um lápis na caixa abre o modo tópico-a-tópico. */
type DashboardListSectionKey =
  | "strengths"
  | "weaknesses"
  | "opportunities"
  | "quickWins"
  | "longTermActions"
  | "nextSteps";

type DashboardChannelEdit = {
  editingField: string | null;
  fieldSaving: boolean;
  fieldError: string | null;
  editDraft: string;
  setEditDraft: (v: string) => void;
  beginTextEdit: (field: string, initial: string) => void;
  cancelFieldEdit: () => void;
  onSaveChannelDescription: (sortedIndex: number) => Promise<boolean>;
  onSaveChannelActionItem: (sortedIndex: number, actionIndex: number) => Promise<boolean>;
  appendChannelAction: (sortedIndex: number) => Promise<void>;
  removeChannelAction: (sortedIndex: number, actionIndex: number) => Promise<void>;
};

/** Rodapé das listas em modo tópico: + compacto, Salvar (igual ao bloco editável) e Cancelar (sai da secção). */
function DashboardListSectionEditFooter({
  fieldSaving,
  onAdd,
  addAriaLabel,
  onSaveClose,
  onCancel,
  className,
}: {
  fieldSaving: boolean;
  onAdd: () => void | Promise<void>;
  addAriaLabel: string;
  onSaveClose: () => void | Promise<void>;
  onCancel: () => void;
  className?: string;
}) {
  return (
    <div className={cn("no-print flex flex-wrap items-center justify-end gap-2", className ?? "mt-3")}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={fieldSaving}
        onClick={() => void onAdd()}
        className="shrink-0 text-muted-foreground/75 hover:bg-muted/50 hover:text-foreground"
        aria-label={addAriaLabel}
      >
        <Plus className="size-3.5" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="cta"
        size="sm"
        className="gap-1.5"
        disabled={fieldSaving}
        onClick={() => void onSaveClose()}
      >
        {fieldSaving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
        Salvar
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={fieldSaving}
        onClick={onCancel}
      >
        <X className="size-4" aria-hidden />
        Cancelar
      </Button>
    </div>
  );
}

function ChannelCard({
  channel,
  channelIndex,
  dashboardChannelEdit,
}: {
  channel: DigitalChannel;
  channelIndex: number;
  dashboardChannelEdit?: DashboardChannelEdit;
}) {
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
  const d = dashboardChannelEdit;
  const descKey = `channel-${channelIndex}-description`;
  const [actionsSectionOpen, setActionsSectionOpen] = useState(false);

  const saveChannelActionsSectionAndClose = async () => {
    if (!d || d.fieldSaving) return;
    const actionPrefix = `channel-${channelIndex}-action-`;
    let ok = true;
    if (d.editingField === descKey) {
      ok = await d.onSaveChannelDescription(channelIndex);
    } else if (d.editingField?.startsWith(actionPrefix)) {
      const i = parseInt(d.editingField.slice(actionPrefix.length), 10);
      if (Number.isFinite(i)) ok = await d.onSaveChannelActionItem(channelIndex, i);
    }
    if (ok) setActionsSectionOpen(false);
  };

  const cancelChannelActionsSection = () => {
    if (!d) return;
    d.cancelFieldEdit();
    setActionsSectionOpen(false);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col pt-1 md:self-stretch">
      {/*
        Aba fora do BorderGlow (z-0): o glow pinta por cima da borda do frame â€” o selo fica
        â€œpor trÃ¡sâ€ da moldura, igual visual mobile/desktop.
      */}
      <Badge
        className={cn(
          "pointer-events-none absolute right-3 top-0 z-0 inline-flex h-auto min-h-[26px] max-sm:min-h-[24px] -translate-y-[calc(100%-8px)] shrink-0 items-center justify-center gap-1 rounded-t-md rounded-b-none border-x border-t border-b-0 px-2 pb-1.5 pt-1 text-[10px] font-semibold leading-snug whitespace-nowrap sm:right-5 sm:min-h-7 sm:px-2.5 sm:pb-2 sm:pt-1.5 sm:text-[11px] sm:font-medium",
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
            "relative flex min-h-0 flex-1 flex-col overflow-visible space-y-3 rounded-lg px-5 py-5 sm:px-7 sm:py-5",
            ROTA_REPORT_SURFACE_GLOW_INNER,
            d && !actionsSectionOpen && "pb-12",
          )}
        >
          <div className="flex items-start gap-2 pb-1">
            <h4 className="m-0 min-w-0 flex-1 font-normal leading-none" title={channel.name}>
              <span className={channelCardPillClass(channel.name)}>
                <span className="truncate">{channel.name}</span>
              </span>
            </h4>
          </div>
          {d ? (
            <DashboardEditableRegion
              enabled
              hideReadToolbar
              isEditing={d.editingField === descKey}
              onStartEdit={() => d.beginTextEdit(descKey, channel.description)}
              onCancel={d.cancelFieldEdit}
              onSave={async () => {
                await d.onSaveChannelDescription(channelIndex);
              }}
              saving={d.fieldSaving}
              error={d.editingField === descKey ? d.fieldError : null}
              draft={d.editDraft}
              onDraftChange={d.setEditDraft}
              ariaLabel="Editar descrição do canal"
            >
              {actionsSectionOpen && d.editingField !== descKey ? (
                <div
                  role="button"
                  tabIndex={0}
                  title="Clique para editar o texto da descrição"
                  className="cursor-pointer rounded-md outline-none transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    if (d.fieldSaving) return;
                    d.beginTextEdit(descKey, channel.description);
                  }}
                  onKeyDown={(e) => {
                    if (d.fieldSaving) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      d.beginTextEdit(descKey, channel.description);
                    }
                  }}
                >
                  <ReportProseBlocks text={channel.description} size="sm" collapseToOneParagraph />
                </div>
              ) : (
                <ReportProseBlocks text={channel.description} size="sm" collapseToOneParagraph />
              )}
            </DashboardEditableRegion>
          ) : (
            <ReportProseBlocks text={channel.description} size="sm" collapseToOneParagraph />
          )}
          {(channel.actions.length > 0 || d) ? (
            d ? (
              !actionsSectionOpen ? (
                <>
                  {channel.actions.length > 0 ? (
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
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Sem ações listadas. Use o lápis para adicionar ou editar.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={d.fieldSaving}
                    onClick={() => setActionsSectionOpen(true)}
                    className="no-print absolute bottom-3 right-3 z-[6] size-8 rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-foreground sm:bottom-4 sm:right-4"
                    aria-label="Editar descrição e ações deste canal"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  {channel.actions.length > 0 ? (
                    <ul className="space-y-2.5">
                      {channel.actions.map((action, i) => {
                        const actionKey = `channel-${channelIndex}-action-${i}`;
                        return (
                          <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed">
                            <div
                              className={cn(
                                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ring-1",
                                CHANNEL_ACTION_ICON_SHELL[channel.priority] || CHANNEL_ACTION_ICON_SHELL.Média,
                              )}
                              aria-hidden
                            >
                              <ArrowRight size={13} className="shrink-0 opacity-95" strokeWidth={2.25} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <DashboardEditableRegion
                                density="compact"
                                readToolbarPlacement="top-right"
                                enabled
                                isEditing={d.editingField === actionKey}
                                onStartEdit={() => d.beginTextEdit(actionKey, action)}
                                onCancel={d.cancelFieldEdit}
                                onSave={async () => {
                                  await d.onSaveChannelActionItem(channelIndex, i);
                                }}
                                saving={d.fieldSaving}
                                error={d.editingField === actionKey ? d.fieldError : null}
                                draft={d.editDraft}
                                onDraftChange={d.setEditDraft}
                                ariaLabel={`Editar ação ${i + 1} do canal`}
                                onDelete={() => {
                                  d.cancelFieldEdit();
                                  void d.removeChannelAction(channelIndex, i);
                                }}
                                deleteAriaLabel="Remover esta ação"
                              >
                                <span className="block text-muted-foreground dark:text-zinc-300">{action}</span>
                              </DashboardEditableRegion>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem ações listadas.</p>
                  )}
                  <DashboardListSectionEditFooter
                    fieldSaving={d.fieldSaving}
                    onAdd={() => void d.appendChannelAction(channelIndex)}
                    addAriaLabel="Adicionar ação"
                    onSaveClose={() => void saveChannelActionsSectionAndClose()}
                    onCancel={cancelChannelActionsSection}
                  />
                </div>
              )
            ) : (
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
            )
          ) : null}
        </div>
      </BorderGlow>
    </div>
  );
}

/** Diagnóstico por tópico: menor nota primeiro; empate estável pelo nome (igual à vista pública). */
function sortDiagnosticScoresByScoreAsc(scores: DiagnosticScore[]): DiagnosticScore[] {
  return [...scores].sort(
    (a, b) => a.score - b.score || a.topic.localeCompare(b.topic, "pt", { sensitivity: "base" }),
  );
}

function clampTimelineMonth(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.min(120, Math.max(1, Math.round(v)));
}

/** Dados públicos/API podem trazer o valor como string (`"1"`); `=== 1` falhava no singular. */
function isTimelineMonthSingular(months: unknown): boolean {
  return Number(months) === 1;
}

function monthsFromTimelineDraft(draft: string, fallback: unknown): number {
  const digits = draft.replace(/\D/g, "");
  if (digits === "") return clampTimelineMonth(fallback);
  return clampTimelineMonth(parseInt(digits, 10));
}

/** Edição do prazo (meses): stepper + número grande. */
function TimelineMonthsEditPanel({
  editDraft,
  fallbackMonths,
  fieldSaving,
  onDraftChange,
}: {
  editDraft: string;
  fallbackMonths: unknown;
  fieldSaving: boolean;
  onDraftChange: (next: string) => void;
}) {
  const n = monthsFromTimelineDraft(editDraft, fallbackMonths);
  return (
    <div className="rounded-xl border border-border/50 bg-muted/15 px-3 py-3 dark:border-white/[0.06] dark:bg-zinc-950/40 sm:px-4 sm:py-3.5">
      <div className="flex items-center justify-center gap-2 sm:gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10 shrink-0 rounded-full border-border/70 bg-background/80 transition hover:bg-muted/70 dark:bg-zinc-900/90 sm:size-11"
          aria-label="Menos um mês"
          disabled={fieldSaving || n <= 1}
          onClick={() => onDraftChange(String(n - 1))}
        >
          <Minus className="size-4" aria-hidden />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5">
          <Input
            id="report-timeline-months-edit"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={editDraft}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 3);
              onDraftChange(v);
            }}
            className="h-[3.25rem] min-w-0 max-w-[7rem] border-0 bg-transparent px-1 text-center text-4xl font-bold tabular-nums tracking-tight text-brand shadow-none ring-0 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/40 dark:text-brand sm:text-5xl sm:leading-none"
          />
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground/90">
            {isTimelineMonthSingular(n) ? "Mês" : "meses"}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10 shrink-0 rounded-full border-border/70 bg-background/80 transition hover:bg-muted/70 dark:bg-zinc-900/90 sm:size-11"
          aria-label="Mais um mês"
          disabled={fieldSaving || n >= 120}
          onClick={() => onDraftChange(String(n + 1))}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/** Chave para substituição manual de imagens de evidência (dashboard). */
type EvidenceManualSlot =
  | "logo"
  | "instagramProfile"
  | "instagramSnapshot"
  | "siteHero"
  | "instagramBioLink"
  | `diagnostic:${number}`
  | `diagnosticSite:${number}`
  | `diagnosticInstagram:${number}`;

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
  /** E-mail de registo (Auth) do dono — leitura no servidor para `mailto` nos CTAs. */
  initialCtaOwnerAccountEmail?: string | null;
  /** Sobre a empresa (bloco de marca) — leitura no servidor na página pública. */
  initialCompanyAboutSettings?: UserCompanyAboutSettings | null;
};

export function RotaDigitalReportView({
  report: initialReport,
  variant,
  onReportChange,
  initialCtaSettings,
  initialCtaOwnerAccountEmail,
  initialCompanyAboutSettings,
}: RotaDigitalReportViewProps) {
  const router = useRouter();
  const isDashboard = variant === "dashboard";
  const [report, setReport] = useState<RotaDigitalReport>(initialReport);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [fieldSaving, setFieldSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [diagEditSortedIndex, setDiagEditSortedIndex] = useState<number | null>(null);
  const [diagTopicDraft, setDiagTopicDraft] = useState("");
  const [diagScoreDraft, setDiagScoreDraft] = useState("");
  const [diagCommentDraft, setDiagCommentDraft] = useState("");
  const [reanalyzeOpen, setReanalyzeOpen] = useState(false);
  const [reanalyzeNotes, setReanalyzeNotes] = useState("");
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  const [reanalyzeEntryQuotaChecking, setReanalyzeEntryQuotaChecking] = useState(false);
  const [limitModalState, setLimitModalState] = useState<PlanLimitModalState | null>(null);
  const [reanalyzeProgressOpen, setReanalyzeProgressOpen] = useState(false);
  const [reanalyzeProgress, setReanalyzeProgress] = useState(0);
  const [reanalyzeProgressCompleting, setReanalyzeProgressCompleting] = useState(false);
  const reanalyzeProgressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reanalyzeProgressRef = useRef(0);
  const reanalyzeProgressStartedAtRef = useRef(0);
  const [publicLinkOrigin, setPublicLinkOrigin] = useState("");
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);
  const [ctaSettings, setCtaSettings] = useState<UserReportCtaSettings | null>(
    () => initialCtaSettings ?? null
  );
  const [ctaOwnerAccountEmail, setCtaOwnerAccountEmail] = useState<string | null>(
    () => initialCtaOwnerAccountEmail?.trim() || null
  );
  const [companyAboutSettings, setCompanyAboutSettings] = useState<UserCompanyAboutSettings | null>(
    () => (variant === "public" ? initialCompanyAboutSettings ?? null : null),
  );
  const [agencyBrandingDialogOpen, setAgencyBrandingDialogOpen] = useState(false);
  const [agencyBrandingDraft, setAgencyBrandingDraft] = useState({
    primaryImageUrl: "",
    companySummary: "",
    showOnReport: true,
  });
  const [agencyBrandingSaving, setAgencyBrandingSaving] = useState(false);
  const [agencyBrandingError, setAgencyBrandingError] = useState<string | null>(null);
  const [agencyBrandingLogoUploading, setAgencyBrandingLogoUploading] = useState(false);
  const agencyBrandingLogoInputRef = useRef<HTMLInputElement | null>(null);
  /** `userSettings` (Firestore) para regra de logo/marca Pro/Agency vs Starter. */
  const [userSettingsForAgencyBranding, setUserSettingsForAgencyBranding] = useState<Record<
    string,
    unknown
  > | null>(null);
  /** Quem está a ver o dashboard (token): para regras como «Testar busca» só Master. */
  const [viewerUserSettings, setViewerUserSettings] = useState<Record<string, unknown> | null>(null);
  /** Modo tópico-a-tópico só depois de abrir a secção com o lápis da caixa. */
  const [listSectionEditOpen, setListSectionEditOpen] = useState<DashboardListSectionKey | null>(null);
  const [evidenceReplaceSlot, setEvidenceReplaceSlot] = useState<EvidenceManualSlot | null>(null);
  const [leadProposalId, setLeadProposalId] = useState<string | null>(null);
  const [leadProposalLoading, setLeadProposalLoading] = useState(false);

  const reportCta = useMemo(
    () =>
      resolveReportCtas(ctaSettings, process.env.NEXT_PUBLIC_ROTA_REPORT_CTA_URL, {
        accountEmail: ctaOwnerAccountEmail,
      }),
    [ctaSettings, ctaOwnerAccountEmail]
  );

  useEffect(() => {
    setReport(initialReport);
  }, [initialReport]);

  const clearReanalyzeProgressTimer = useCallback(() => {
    if (reanalyzeProgressIntervalRef.current) {
      clearInterval(reanalyzeProgressIntervalRef.current);
      reanalyzeProgressIntervalRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearReanalyzeProgressTimer();
    },
    [clearReanalyzeProgressTimer],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPublicLinkOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (variant !== "public") return;
    setCtaSettings(initialCtaSettings ?? null);
    setCtaOwnerAccountEmail(initialCtaOwnerAccountEmail?.trim() || null);
  }, [variant, initialCtaSettings, initialCtaOwnerAccountEmail]);

  useEffect(() => {
    if (variant === "public" || !auth) return;
    if (!report.userId) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u?.uid === report.userId) setCtaOwnerAccountEmail(u.email?.trim() || null);
    });
    return () => unsub();
  }, [variant, report.userId]);

  useEffect(() => {
    if (variant !== "public") return;
    setCompanyAboutSettings(initialCompanyAboutSettings ?? null);
  }, [variant, initialCompanyAboutSettings]);

  useEffect(() => {
    if (variant === "public") return;
    if (!report.userId) {
      setCompanyAboutSettings(null);
      return;
    }
    let cancelled = false;
    void getUserCompanyAboutSettings(report.userId)
      .then((s) => {
        if (!cancelled) setCompanyAboutSettings(s);
      })
      .catch(() => {
        if (!cancelled) setCompanyAboutSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [report.userId, variant]);

  useEffect(() => {
    if (!isDashboard || !auth) {
      setViewerUserSettings(null);
      return;
    }
    let cancelled = false;
    let loadGen = 0;
    const unsub = onAuthStateChanged(auth, (user) => {
      const gen = ++loadGen;
      if (!user) {
        if (!cancelled) setViewerUserSettings(null);
        return;
      }
      void getDoc(doc(db, "userSettings", user.uid))
        .then((snap) => {
          if (cancelled || gen !== loadGen) return;
          setViewerUserSettings(snap.exists() ? (snap.data() as Record<string, unknown>) : {});
        })
        .catch(() => {
          if (!cancelled && gen === loadGen) setViewerUserSettings(null);
        });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [isDashboard]);

  useEffect(() => {
    if (!isDashboard || !report.userId) {
      setUserSettingsForAgencyBranding(null);
      return;
    }
    let cancelled = false;
    void getDoc(doc(db, "userSettings", report.userId))
      .then((snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          setUserSettingsForAgencyBranding(snap.data() as Record<string, unknown>);
        } else {
          setUserSettingsForAgencyBranding({});
        }
      })
      .catch(() => {
        if (cancelled) return;
        setUserSettingsForAgencyBranding({ plan: "pro" } as Record<string, unknown>);
      });
    return () => {
      cancelled = true;
    };
  }, [isDashboard, report.userId]);

  const reportAgencyBranding = useMemo((): {
    logoSrc: string;
    summary: string;
    name: string;
    /** Só no painel: a secção está oculta no link público; o admin vê em modo pré-visualização. */
    isPreviewHidden: boolean;
  } | null => {
    if (!report.userId) return null;
    const hidden = companyAboutSettings?.hideReportAgencyBranding === true;
    if (hidden && variant === "public") return null;
    return {
      logoSrc: resolveCompanyPrimaryImageForDisplay(companyAboutSettings?.primaryImageUrl),
      summary: resolveCompanyAboutSummaryForDisplay(companyAboutSettings?.companySummary),
      name: resolveCompanyAboutNameForDisplay(companyAboutSettings?.companyName),
      isPreviewHidden: hidden && isDashboard,
    };
  }, [report.userId, companyAboutSettings, variant, isDashboard]);

  useEffect(() => {
    if (!isDashboard || !report.leadId?.trim() || !report.userId) {
      setLeadProposalId(null);
      setLeadProposalLoading(false);
      return;
    }
    let cancelled = false;
    setLeadProposalLoading(true);
    void getProposalByLead(report.leadId.trim(), report.userId)
      .then((proposal) => {
        if (!cancelled) {
          setLeadProposalId(proposal?.id ?? null);
          setLeadProposalLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLeadProposalId(null);
          setLeadProposalLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isDashboard, report.leadId, report.userId]);

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

  const cancelFieldEdit = useCallback(() => {
    setEditingField(null);
    setEditDraft("");
    setFieldError(null);
    setDiagEditSortedIndex(null);
  }, []);

  const effectiveReportPlan: PlanId = useMemo(() => {
    if (report.billingPlanSnapshot) return report.billingPlanSnapshot;
    const raw = userSettingsForAgencyBranding;
    if (!raw) return "starter";
    return planIdFromUserSettings(raw as Record<string, unknown>);
  }, [report.billingPlanSnapshot, userSettingsForAgencyBranding]);

  const openCompetitorUpgradeModal = useCallback(() => {
    setLimitModalState({
      kind: "competitors",
      plan: normalizedSubscriptionPlanKey(effectiveReportPlan),
    });
  }, [effectiveReportPlan]);

  const openGmbUpgradeModal = useCallback(() => {
    setLimitModalState({
      kind: "gmb",
      plan: normalizedSubscriptionPlanKey(effectiveReportPlan),
    });
  }, [effectiveReportPlan]);

  const isViewerMasterAdmin = useMemo(() => {
    if (!isDashboard) return false;
    if (!viewerUserSettings) return false;
    return planIdFromUserSettings(viewerUserSettings) === "master";
  }, [isDashboard, viewerUserSettings]);

  const openListSectionEdit = useCallback(
    (key: DashboardListSectionKey) => {
      cancelFieldEdit();
      setListSectionEditOpen(key);
    },
    [cancelFieldEdit],
  );

  const closeListSectionEdit = useCallback(() => {
    cancelFieldEdit();
    setListSectionEditOpen(null);
  }, [cancelFieldEdit]);

  const openAgencyBrandingDialog = useCallback(() => {
    if (isDashboard) {
      const raw = userSettingsForAgencyBranding;
      if (raw == null) return;
      if (!planAllowsCustomLogo(raw)) {
        setLimitModalState({
          kind: "logo",
          plan: normalizedSubscriptionPlanKey(raw.subscriptionPlan ?? raw.plan),
        });
        return;
      }
    }
    setAgencyBrandingError(null);
    setAgencyBrandingDraft({
      primaryImageUrl: (companyAboutSettings?.primaryImageUrl ?? "").trim(),
      companySummary: resolveCompanyAboutSummaryForDisplay(companyAboutSettings?.companySummary),
      showOnReport: companyAboutSettings?.hideReportAgencyBranding !== true,
    });
    setAgencyBrandingDialogOpen(true);
  }, [companyAboutSettings, isDashboard, userSettingsForAgencyBranding]);

  const saveAgencyBrandingFromModal = useCallback(async () => {
    if (!report.userId) return;
    setAgencyBrandingSaving(true);
    setAgencyBrandingError(null);
    try {
      const base =
        (await getUserCompanyAboutSettings(report.userId)) ?? createDefaultCompanyAboutSettings();
      const next: UserCompanyAboutSettings = {
        ...base,
        primaryImageUrl: agencyBrandingDraft.primaryImageUrl.trim(),
        companySummary: resolveCompanyAboutSummaryForSave(agencyBrandingDraft.companySummary),
        hideReportAgencyBranding: !agencyBrandingDraft.showOnReport,
      };
      await saveUserCompanyAboutSettings(report.userId, next);
      setCompanyAboutSettings(next);
      setAgencyBrandingDialogOpen(false);
    } catch (e) {
      setAgencyBrandingError(e instanceof Error ? e.message : "Não foi possível guardar.");
    } finally {
      setAgencyBrandingSaving(false);
    }
  }, [report.userId, agencyBrandingDraft]);

  const onAgencyBrandingLogoFile = useCallback(
    async (file: File) => {
      if (!isDashboard || !report.userId) return;
      setAgencyBrandingLogoUploading(true);
      setAgencyBrandingError(null);
      try {
        const result = await uploadUserSettingsImage({
          file,
          userId: report.userId,
          slotLabel: "company-about-primary",
        });
        if (!result.ok) {
          setAgencyBrandingError(describeManualUploadFailure(result));
          return;
        }
        setAgencyBrandingDraft((d) => ({ ...d, primaryImageUrl: result.url }));
      } finally {
        setAgencyBrandingLogoUploading(false);
      }
    },
    [isDashboard, report.userId],
  );

  const applyReportPatch = useCallback(
    async (patch: Partial<RotaDigitalReport>): Promise<boolean> => {
      setFieldSaving(true);
      setFieldError(null);
      try {
        await updateReport(report.id, patch);
        let nextReport: RotaDigitalReport | null = null;
        setReport((prev) => {
          const { evidences: evPatch, brief: brPatch, ...rest } = patch;
          const next = { ...prev, ...rest } as RotaDigitalReport;
          if (evPatch) {
            next.evidences = { ...(prev.evidences || {}), ...evPatch };
          }
          if (brPatch) {
            next.brief = { ...(prev.brief || {}), ...brPatch };
          }
          nextReport = next;
          return next;
        });
        if (nextReport) onReportChange?.(nextReport);
        cancelFieldEdit();
        return true;
      } catch (err: unknown) {
        setFieldError(err instanceof Error ? err.message : "Erro ao guardar.");
        return false;
      } finally {
        setFieldSaving(false);
      }
    },
    [report.id, onReportChange, cancelFieldEdit],
  );

  const handleReplaceEvidenceImage = useCallback(
    async (slot: EvidenceManualSlot, file: File) => {
      if (!isDashboard) return;
      setEvidenceReplaceSlot(slot);
      setFieldError(null);
      try {
        const result = await uploadUserEvidenceImageForReport({
          file,
          userId: report.userId,
          leadId: report.leadId,
          reportId: report.id,
          slotLabel: slot,
        });
        if (!result.ok) {
          setFieldError(describeManualUploadFailure(result));
          return;
        }
        const baseEv = { ...(report.evidences || {}) };
        if (slot === "logo") {
          await applyReportPatch({ evidences: { ...baseEv, logoImageUrl: result.url } });
          return;
        }
        if (slot === "instagramProfile") {
          await applyReportPatch({ evidences: { ...baseEv, instagramProfileImageUrl: result.url } });
          return;
        }
        if (slot === "instagramSnapshot") {
          const prevIg = baseEv.instagramSnapshotUrl?.trim() || "";
          const existing = report.diagnosticScores || [];
          let relinkedScores: DiagnosticScore[] | null = null;
          if (existing.length > 0 && prevIg) {
            let touched = false;
            const mapped = existing.map((it) => {
              const evIg = it.evidenceInstagramImageUrl?.trim() || "";
              if (evIg !== prevIg) return it;
              touched = true;
              return { ...it, evidenceInstagramImageUrl: result.url };
            });
            if (touched) relinkedScores = sortDiagnosticScoresByScoreAsc(mapped);
          }
          const patch: Partial<RotaDigitalReport> = {
            evidences: { ...baseEv, instagramSnapshotUrl: result.url },
          };
          if (relinkedScores) {
            patch.diagnosticScores = relinkedScores;
            const maturityPatch = maturityFromDiagnosticScores(relinkedScores);
            if (maturityPatch) {
              patch.digitalMaturityScore = maturityPatch.digitalMaturityScore;
              patch.digitalMaturityLevel = maturityPatch.digitalMaturityLevel;
            }
          }
          await applyReportPatch(patch);
          return;
        }
        if (slot === "siteHero") {
          const prevHero = baseEv.siteHeroSnapshotUrl?.trim() || "";
          const existing = report.diagnosticScores || [];
          let relinkedScores: DiagnosticScore[] | null = null;
          if (existing.length > 0 && prevHero) {
            let touched = false;
            const mapped = existing.map((it) => {
              const ev = it.evidenceImageUrl?.trim() || "";
              const evSite = it.evidenceSiteImageUrl?.trim() || "";
              if (ev !== prevHero && evSite !== prevHero) return it;
              touched = true;
              return {
                ...it,
                ...(ev === prevHero ? { evidenceImageUrl: result.url } : {}),
                ...(evSite === prevHero ? { evidenceSiteImageUrl: result.url } : {}),
              };
            });
            if (touched) relinkedScores = sortDiagnosticScoresByScoreAsc(mapped);
          }
          const patch: Partial<RotaDigitalReport> = {
            evidences: { ...baseEv, siteHeroSnapshotUrl: result.url },
          };
          if (relinkedScores) {
            patch.diagnosticScores = relinkedScores;
            const maturityPatch = maturityFromDiagnosticScores(relinkedScores);
            if (maturityPatch) {
              patch.digitalMaturityScore = maturityPatch.digitalMaturityScore;
              patch.digitalMaturityLevel = maturityPatch.digitalMaturityLevel;
            }
          }
          await applyReportPatch(patch);
          return;
        }
        if (slot === "instagramBioLink") {
          await applyReportPatch({ evidences: { ...baseEv, instagramBioLinkSnapshotUrl: result.url } });
          return;
        }
        if (slot.startsWith("diagnosticSite:")) {
          const i = Number.parseInt(slot.slice("diagnosticSite:".length), 10);
          const arr = [...(report.diagnosticScores || [])];
          if (!Number.isFinite(i) || arr[i] === undefined) return;
          arr[i] = { ...arr[i]!, evidenceSiteImageUrl: result.url };
          const ordered = sortDiagnosticScoresByScoreAsc(arr);
          const maturityPatch = maturityFromDiagnosticScores(ordered);
          await applyReportPatch(
            maturityPatch
              ? { diagnosticScores: ordered, ...maturityPatch }
              : { diagnosticScores: ordered },
          );
          return;
        }
        if (slot.startsWith("diagnosticInstagram:")) {
          const i = Number.parseInt(slot.slice("diagnosticInstagram:".length), 10);
          const arr = [...(report.diagnosticScores || [])];
          if (!Number.isFinite(i) || arr[i] === undefined) return;
          arr[i] = { ...arr[i]!, evidenceInstagramImageUrl: result.url };
          const ordered = sortDiagnosticScoresByScoreAsc(arr);
          const maturityPatch = maturityFromDiagnosticScores(ordered);
          await applyReportPatch(
            maturityPatch
              ? { diagnosticScores: ordered, ...maturityPatch }
              : { diagnosticScores: ordered },
          );
          return;
        }
        if (slot.startsWith("diagnostic:")) {
          const i = Number.parseInt(slot.slice("diagnostic:".length), 10);
          const arr = [...(report.diagnosticScores || [])];
          if (!Number.isFinite(i) || arr[i] === undefined) return;
          arr[i] = { ...arr[i]!, evidenceImageUrl: result.url };
          const ordered = sortDiagnosticScoresByScoreAsc(arr);
          const maturityPatch = maturityFromDiagnosticScores(ordered);
          await applyReportPatch(
            maturityPatch
              ? { diagnosticScores: ordered, ...maturityPatch }
              : { diagnosticScores: ordered },
          );
        }
      } finally {
        setEvidenceReplaceSlot(null);
      }
    },
    [isDashboard, report, applyReportPatch],
  );

  const beginTextEdit = useCallback((field: string, initial: string) => {
    setEditingField(field);
    setEditDraft(initial);
    setFieldError(null);
  }, []);

  const beginDiagnosticEdit = useCallback(
    (sortedIndex: number, scores: DiagnosticScore[]) => {
      const it = scores[sortedIndex];
      if (!it) return;
      setEditingField(`diagnostic:${sortedIndex}`);
      setDiagEditSortedIndex(sortedIndex);
      setDiagTopicDraft(it.topic);
      setDiagScoreDraft(String(it.score));
      setDiagCommentDraft(it.comment);
      setFieldError(null);
    },
    [],
  );

  const handleReanalyze = async () => {
    if (!report) return;
    if (!reanalyzeNotes.trim()) {
      setReanalyzeError("Descreva o que deve ser ajustado.");
      return;
    }

    clearReanalyzeProgressTimer();
    setReanalyzeProgressCompleting(false);
    reanalyzeProgressRef.current = 0;
    reanalyzeProgressStartedAtRef.current = Date.now();
    setReanalyzeProgress(0);
    setReanalyzeOpen(false);
    setReanalyzeProgressOpen(true);
    setReanalyzing(true);
    setReanalyzeError(null);

    reanalyzeProgressIntervalRef.current = setInterval(() => {
      setReanalyzeProgress((p) => {
        if (p >= 88) return p;
        const elapsedMs = Math.max(0, Date.now() - reanalyzeProgressStartedAtRef.current);
        const ratio = Math.min(1, elapsedMs / REANALYZE_PROGRESS_TO_88_MS);
        const target = ratio * 88;
        const gapToTarget = target - p;
        let inc: number;
        if (gapToTarget > 1.2) {
          inc = 0.3 + Math.random() * 0.16;
        } else if (gapToTarget > 0.25) {
          inc = 0.12 + Math.random() * 0.1;
        } else {
          inc = 0.04 + Math.random() * 0.05;
        }
        const next = Math.min(88, Math.round((p + inc) * 10) / 10);
        reanalyzeProgressRef.current = next;
        return next;
      });
    }, 250);

    try {
      const idToken = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (idToken) headers.Authorization = `Bearer ${idToken}`;
      const res = await fetch("/api/reanalyze-route", {
        method: "POST",
        headers,
        body: JSON.stringify({
          report,
          observation: reanalyzeNotes.trim(),
        }),
      });
      const data = await res.json();
      if (res.status === 429 && data?.code === "ROTAS_LIMIT_REACHED") {
        clearReanalyzeProgressTimer();
        setReanalyzeProgressCompleting(false);
        setReanalyzeProgressOpen(false);
        setReanalyzeProgress(0);
        reanalyzeProgressRef.current = 0;
        setReanalyzing(false);
        setLimitModalState({
          kind: "rotas",
          plan: normalizedSubscriptionPlanKey(data?.plan ?? "pro"),
          monthlyLimit: data?.monthlyLimit,
          usedThisMonth: data?.usedThisMonth,
        });
        return;
      }
      if (!res.ok) throw new Error(data.error || "Falha na reanálise.");

      const updatedReport = {
        ...report,
        ...data.report,
      } as RotaDigitalReport;

      await updateReport(report.id, data.report);
      setReport(updatedReport);
      onReportChange?.(updatedReport);

      clearReanalyzeProgressTimer();
      setReanalyzeProgressCompleting(true);
      await runProgressTo100Reanalyze(reanalyzeProgressRef.current, REANALYZE_FINAL_PROGRESS_MS, (pct) => {
        reanalyzeProgressRef.current = pct;
        setReanalyzeProgress(pct);
      });
      setReanalyzeProgressCompleting(false);
      setReanalyzeProgressOpen(false);
      setReanalyzeProgress(0);
      reanalyzeProgressRef.current = 0;
      setReanalyzeOpen(false);
      setReanalyzeNotes("");
    } catch (err: unknown) {
      clearReanalyzeProgressTimer();
      setReanalyzeProgressCompleting(false);
      setReanalyzeProgressOpen(false);
      setReanalyzeProgress(0);
      reanalyzeProgressRef.current = 0;
      setReanalyzeError(err instanceof Error ? err.message : "Erro desconhecido.");
      setReanalyzeOpen(true);
    } finally {
      setReanalyzing(false);
    }
  };

  const sortedChannels = useMemo(
    () =>
      [...report.recommendedChannels].sort(
        (a, b) =>
          ["Alta", "Média", "Baixa"].indexOf(a.priority) -
          ["Alta", "Média", "Baixa"].indexOf(b.priority),
      ),
    [report.recommendedChannels],
  );
  /** Sempre por nota crescente (igual à vista pública); o array guardado é reordenado ao gravar. */
  const sortedDiagnosticScores = useMemo(
    () => sortDiagnosticScoresByScoreAsc(report.diagnosticScores || []),
    [report.diagnosticScores],
  );

  /** Reanálises já concluídas: a 1.ª é gratuita (API); da 2.ª em diante consome 1 unidade da cota “rotas”. */
  const priorReanalysesCount = useMemo(
    () => (Array.isArray(report.aiUsage?.reanalysis) ? report.aiUsage.reanalysis.length : 0),
    [report.aiUsage?.reanalysis],
  );
  const reanalysisWillConsumeRotasQuota = priorReanalysesCount >= 1;

  const onReanalyzeButtonClick = useCallback(async () => {
    if (!reanalysisWillConsumeRotasQuota) {
      setReanalyzeOpen(true);
      setReanalyzeError(null);
      return;
    }
    const current = auth?.currentUser;
    if (!current) {
      setReanalyzeOpen(true);
      setReanalyzeError(null);
      return;
    }
    setReanalyzeEntryQuotaChecking(true);
    try {
      const idToken = await current.getIdToken();
      const res = await fetch("/api/user-quota", { headers: { Authorization: `Bearer ${idToken}` } });
      if (res.ok) {
        const data = (await res.json()) as {
          plan: string;
          rotas: { atLimit: boolean; limit: number; used: number };
        };
        if (data.rotas.atLimit) {
          setLimitModalState({
            kind: "rotas",
            plan: normalizedSubscriptionPlanKey(data.plan),
            monthlyLimit: data.rotas.limit,
            usedThisMonth: data.rotas.used,
          });
          return;
        }
      }
    } catch {
      /* abre o diálogo: o API valida cota no pedido */
    } finally {
      setReanalyzeEntryQuotaChecking(false);
    }
    setReanalyzeOpen(true);
    setReanalyzeError(null);
  }, [reanalysisWillConsumeRotasQuota]);

  const headlineMaturity = useMemo(() => {
    const fromTopics = maturityFromDiagnosticScores(report.diagnosticScores);
    if (fromTopics) return fromTopics;
    return {
      digitalMaturityScore: report.digitalMaturityScore,
      digitalMaturityLevel: report.digitalMaturityLevel,
    };
  }, [report.diagnosticScores, report.digitalMaturityScore, report.digitalMaturityLevel]);

  const onSaveChannelDescription = useCallback(
    async (sortedIndex: number): Promise<boolean> => {
      const list = [...sortedChannels];
      const row = list[sortedIndex];
      if (!row) return false;
      list[sortedIndex] = { ...row, description: editDraft.trim() };
      return await applyReportPatch({ recommendedChannels: list });
    },
    [sortedChannels, editDraft, applyReportPatch],
  );

  const onSaveChannelActionItem = useCallback(
    async (sortedIndex: number, actionIndex: number): Promise<boolean> => {
      const list = [...sortedChannels];
      const row = list[sortedIndex];
      if (!row || row.actions[actionIndex] === undefined) return false;
      const actions = [...row.actions];
      actions[actionIndex] = editDraft.trim();
      list[sortedIndex] = { ...row, actions };
      return await applyReportPatch({ recommendedChannels: list });
    },
    [sortedChannels, editDraft, applyReportPatch],
  );

  const appendChannelAction = useCallback(
    async (sortedIndex: number) => {
      const list = [...sortedChannels];
      const row = list[sortedIndex];
      if (!row) return;
      list[sortedIndex] = {
        ...row,
        actions: [...row.actions, "Nova aÃ§Ã£o â€” edite o texto."],
      };
      await applyReportPatch({ recommendedChannels: list });
    },
    [sortedChannels, applyReportPatch],
  );

  const removeChannelAction = useCallback(
    async (sortedIndex: number, actionIndex: number) => {
      const list = [...sortedChannels];
      const row = list[sortedIndex];
      if (!row) return;
      const actions = row.actions.filter((_, j) => j !== actionIndex);
      list[sortedIndex] = { ...row, actions };
      await applyReportPatch({ recommendedChannels: list });
    },
    [sortedChannels, applyReportPatch],
  );

  type SwotListKey = "strengths" | "weaknesses" | "opportunities";

  const patchSwotItem = useCallback(
    async (key: SwotListKey, index: number, value: string): Promise<boolean> => {
      const arr = [...report[key]];
      if (arr[index] === undefined) return false;
      arr[index] = value.trim();
      return await applyReportPatch({ [key]: arr });
    },
    [report, applyReportPatch],
  );

  const removeSwotItem = useCallback(
    async (key: SwotListKey, index: number) => {
      const arr = report[key].filter((_, j) => j !== index);
      await applyReportPatch({ [key]: arr });
    },
    [report, applyReportPatch],
  );

  const appendSwotItem = useCallback(
    async (key: SwotListKey) => {
      const arr = [...report[key], "Novo ponto â€” edite o texto."];
      await applyReportPatch({ [key]: arr });
    },
    [report, applyReportPatch],
  );

  type ReportStringListKey = "quickWins" | "longTermActions" | "nextSteps";

  const patchReportStringListItem = useCallback(
    async (key: ReportStringListKey, index: number, value: string): Promise<boolean> => {
      const arr = [...report[key]];
      if (arr[index] === undefined) return false;
      arr[index] = value.trim();
      return await applyReportPatch({ [key]: arr });
    },
    [report, applyReportPatch],
  );

  const removeReportStringListItem = useCallback(
    async (key: ReportStringListKey, index: number) => {
      const arr = report[key].filter((_, j) => j !== index);
      await applyReportPatch({ [key]: arr });
    },
    [report, applyReportPatch],
  );

  const appendReportStringListItem = useCallback(
    async (key: ReportStringListKey) => {
      const arr = [...report[key], "Novo ponto â€” edite o texto."];
      await applyReportPatch({ [key]: arr });
    },
    [report, applyReportPatch],
  );

  /** Guarda a linha em edição (se houver) e fecha o modo tópico da secção. */
  const saveListSectionFooterAndClose = useCallback(async () => {
    if (fieldSaving || !listSectionEditOpen) return;
    const section = listSectionEditOpen;
    const prefix = `${section}:`;
    if (editingField?.startsWith(prefix)) {
      const index = parseInt(editingField.slice(prefix.length), 10);
      if (Number.isFinite(index)) {
        let ok = true;
        if (section === "strengths" || section === "weaknesses" || section === "opportunities") {
          ok = await patchSwotItem(section, index, editDraft);
        } else if (section === "quickWins" || section === "longTermActions" || section === "nextSteps") {
          ok = await patchReportStringListItem(section, index, editDraft);
        }
        if (!ok) return;
      }
    }
    closeListSectionEdit();
  }, [
    fieldSaving,
    listSectionEditOpen,
    editingField,
    editDraft,
    patchSwotItem,
    patchReportStringListItem,
    closeListSectionEdit,
  ]);

  const dashboardChannelEdit: DashboardChannelEdit | undefined = isDashboard
    ? {
        editingField,
        fieldSaving,
        fieldError,
        editDraft,
        setEditDraft,
        beginTextEdit,
        cancelFieldEdit,
        onSaveChannelDescription,
        onSaveChannelActionItem,
        appendChannelAction,
        removeChannelAction,
      }
    : undefined;

  const strengthsTopicMode = isDashboard && listSectionEditOpen === "strengths";
  const weaknessesTopicMode = isDashboard && listSectionEditOpen === "weaknesses";
  const opportunitiesTopicMode = isDashboard && listSectionEditOpen === "opportunities";
  const quickWinsTopicMode = isDashboard && listSectionEditOpen === "quickWins";
  const longTermTopicMode = isDashboard && listSectionEditOpen === "longTermActions";
  const nextStepsTopicMode = isDashboard && listSectionEditOpen === "nextSteps";

  const saveDiagnosticEdit = useCallback(async () => {
    if (diagEditSortedIndex == null) return;
    const ref = sortedDiagnosticScores[diagEditSortedIndex];
    if (!ref) return;
    const score = Number(diagScoreDraft.replace(",", "."));
    if (!Number.isFinite(score) || score < 0 || score > 10) {
      setFieldError("Nota entre 0 e 10.");
      return;
    }
    const topic = diagTopicDraft.trim();
    if (!topic) {
      setFieldError("Indique o nome do tópico.");
      return;
    }
    const next = (report.diagnosticScores || []).map((d) =>
      d === ref ? { ...d, topic, score, comment: diagCommentDraft.trim() } : d,
    );
    const ordered = sortDiagnosticScoresByScoreAsc(next);
    const maturityPatch = maturityFromDiagnosticScores(ordered);
    await applyReportPatch(
      maturityPatch
        ? { diagnosticScores: ordered, ...maturityPatch }
        : { diagnosticScores: ordered },
    );
  }, [
    diagEditSortedIndex,
    sortedDiagnosticScores,
    diagTopicDraft,
    diagScoreDraft,
    diagCommentDraft,
    report.diagnosticScores,
    applyReportPatch,
  ]);

  const addDiagnosticTopic = useCallback(async () => {
    const next = [
      ...(report.diagnosticScores || []),
      {
        topic: "Novo tópico",
        score: 7,
        comment:
          "Primeiro parágrafo: descreva o que foi observado.\n\nSegundo parágrafo: indique uma prioridade ou próximo passo.",
      },
    ];
    const ordered = sortDiagnosticScoresByScoreAsc(next);
    const maturityPatch = maturityFromDiagnosticScores(ordered)!;
    await applyReportPatch({ diagnosticScores: ordered, ...maturityPatch });
  }, [report.diagnosticScores, applyReportPatch]);

  const removeDiagnosticItem = useCallback(
    async (item: DiagnosticScore) => {
      const next = (report.diagnosticScores || []).filter((d) => d !== item);
      const ordered = sortDiagnosticScoresByScoreAsc(next);
      const maturityPatch = maturityFromDiagnosticScores(ordered);
      await applyReportPatch(
        maturityPatch
          ? { diagnosticScores: ordered, ...maturityPatch }
          : { diagnosticScores: ordered },
      );
    },
    [report.diagnosticScores, applyReportPatch],
  );

  const notes = parseResearchNotes(report.evidences?.researchNotes);
  const instagramEvidenceSrc = buildInstagramEvidenceSrc(report);
  /** Thumbnail do card â€œResumoâ€: prioriza sempre foto de perfil do Instagram quando houver anÃ¡lise IG; logo/favicon do site sÃ³ se nÃ£o houver imagem de Instagram. */
  const instagramProfileThumb =
    report.evidences?.instagramProfileImageUrl?.trim() ||
    (instagramEvidenceSrc?.startsWith("/api/instagram-profile-snapshot")
      ? withSnapshotParams(instagramEvidenceSrc, { variant: "profile", start: 1 })
      : undefined) ||
    instagramEvidenceSrc;
  const brandImageSrc = instagramProfileThumb || report.evidences?.logoImageUrl;
  const hasBrandImage = Boolean(brandImageSrc);
  const isWebsiteLogo = Boolean(
    report.evidences?.logoImageUrl?.trim() &&
      brandImageSrc === report.evidences.logoImageUrl.trim(),
  );
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
      <PlanLimitModal
        state={limitModalState}
        onClose={() => setLimitModalState(null)}
        getIdToken={
          auth && auth.currentUser
            ? () => {
                const current = auth?.currentUser;
                return current ? current.getIdToken() : Promise.resolve(null);
              }
            : undefined
        }
      />

      {/* Header */}
      <div
        className={cn(
          "no-print justify-between gap-4 sm:gap-6",
          isDashboard
            ? "flex flex-col items-start sm:flex-row sm:items-start"
            : "flex flex-row items-start justify-between gap-3 sm:items-center sm:gap-6",
        )}
      >
        <div className={cn("flex items-center gap-3", !isDashboard && "min-w-0 flex-1 pr-2 sm:pr-4")}>
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
            {leadProposalLoading ? (
              <Button type="button" variant="outline" disabled className="gap-2 no-print">
                <Loader2 size={16} className="animate-spin" />
                Proposta…
              </Button>
            ) : leadProposalId ? (
              <LinkButton
                href={`/dashboard/propostas/${leadProposalId}`}
                variant="outline"
                size="default"
                className="gap-2 no-print"
              >
                <FileText size={16} />
                Ver Proposta
              </LinkButton>
            ) : (
              <QuotaGuardLink
                href={`/dashboard/propostas/new?leadId=${encodeURIComponent(report.leadId)}`}
                quotaKind="propostas"
                variant="outline"
                size="default"
                className="gap-2 no-print"
              >
                <FileText size={16} />
                Gerar Proposta
              </QuotaGuardLink>
            )}
            <Button
              type="button"
              variant="ctaMotion"
              disabled={reanalyzing || reanalyzeProgressOpen || reanalyzeEntryQuotaChecking}
              onClick={() => {
                void onReanalyzeButtonClick();
              }}
              className="gap-2 no-print"
            >
              {reanalyzeEntryQuotaChecking ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />}
              Reanalise
            </Button>
          </div>
        ) : (
            <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-5">
              <p className="hidden max-w-[min(100%,32rem)] text-right text-sm leading-snug text-muted-foreground sm:block sm:min-w-0">
                Gerado para{" "}
                <span className="font-medium text-foreground">{report.leadCompany}</span>
              </p>
              {variant === "public" ? <PublicThemeToggleHint /> : null}
              <PublicThemeToggle className="no-print shrink-0" />
            </div>
        )}
      </div>

      {isDashboard ? (
        <>
          <Dialog open={reanalyzeOpen} onOpenChange={setReanalyzeOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reanalisar com IA</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Escreva o que deseja ajustar. A IA vai usar este relatório como contexto.
                </p>
                {reanalysisWillConsumeRotasQuota ? (
                  <div
                    role="status"
                    className="flex gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/[0.12] px-3 py-2.5 text-sm leading-snug text-foreground dark:border-amber-400/35 dark:bg-amber-400/10"
                  >
                    <AlertCircle
                      className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300"
                      aria-hidden
                    />
                    <p>
                      <span className="font-semibold">Cota:</span> desconta <strong>1 Rota</strong> do ciclo
                      atual (equivalente a gerar uma Rota). Sem saldo, o pedido é recusado.
                    </p>
                  </div>
                ) : (
                  <div
                    role="status"
                    className="flex gap-2.5 rounded-lg border border-border/80 bg-muted/45 px-3 py-2.5 text-sm leading-snug text-muted-foreground"
                  >
                    <Info className="mt-0.5 size-4 shrink-0 text-foreground/80" aria-hidden />
                    <p>
                      A <strong className="text-foreground">primeira reanálise</strong> deste relatório{" "}
                      <strong className="text-foreground">não desconta</strong> da cota. A partir da{" "}
                      <strong className="text-foreground">segunda</strong>, cada reanálise consome 1 unidade
                      como na geração de uma Rota.
                    </p>
                  </div>
                )}
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
                <Button variant="cta" onClick={() => void handleReanalyze()} disabled={reanalyzing} className="gap-2">
                  {reanalyzing ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />}
                  {reanalyzing ? "Reanalisando..." : "Reanalisar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={agencyBrandingDialogOpen}
            onOpenChange={(open) => {
              if (!open) {
                if (agencyBrandingSaving || agencyBrandingLogoUploading) return;
                setAgencyBrandingError(null);
              }
              setAgencyBrandingDialogOpen(open);
            }}
          >
            <DialogContent
              className="flex max-h-[min(92dvh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
              showCloseButton={!agencyBrandingSaving && !agencyBrandingLogoUploading}
            >
              <div className="shrink-0 border-b border-border px-5 pb-3.5 pt-5 sm:px-6 sm:pb-3.5 sm:pt-5 dark:border-white/10">
                <DialogHeader className="space-y-0 text-left">
                  <DialogTitle className="text-base font-semibold sm:text-lg">Sobre a agência</DialogTitle>
                  <DialogDescription className="mt-0.5 text-sm leading-snug text-muted-foreground">
                    Logótipo, descrição e exibição no fim do relatório.
                  </DialogDescription>
                </DialogHeader>
              </div>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6 sm:py-5">
                <div className="space-y-2.5">
                  <Label className="text-xs font-medium">Logótipo</Label>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
                    <div className="flex shrink-0 justify-center sm:justify-start">
                      <img
                        src={resolveCompanyPrimaryImageForDisplay(agencyBrandingDraft.primaryImageUrl || null)}
                        alt="Pré-visualização do logótipo"
                        className="h-20 w-20 rounded-full border border-border/80 object-contain bg-muted/30 p-1"
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                      <input
                        ref={agencyBrandingLogoInputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.currentTarget.value = "";
                          if (f) void onAgencyBrandingLogoFile(f);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-fit gap-2"
                        disabled={agencyBrandingLogoUploading || agencyBrandingSaving}
                        onClick={() => agencyBrandingLogoInputRef.current?.click()}
                      >
                        {agencyBrandingLogoUploading ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        ) : (
                          <ImageUp className="size-3.5" aria-hidden />
                        )}
                        Trocar imagem
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="report-agency-branding-summary" className="text-xs font-medium">
                    Descrição
                  </Label>
                  <Textarea
                    id="report-agency-branding-summary"
                    value={agencyBrandingDraft.companySummary}
                    onChange={(e) =>
                      setAgencyBrandingDraft((d) => ({ ...d, companySummary: e.target.value }))
                    }
                    className="min-h-[130px] resize-y text-sm"
                    disabled={agencyBrandingSaving}
                    placeholder="Texto de apresentação da agência…"
                  />
                </div>
                <div
                  className="space-y-2.5"
                  aria-describedby={!agencyBrandingDraft.showOnReport ? "agency-branding-hidden-hint" : undefined}
                >
                  <div
                    className={cn(
                      "relative inline-flex h-8 w-fit shrink-0 items-stretch rounded-full border p-0.5 text-[11px] shadow-sm",
                      "border-border/90 bg-muted/80",
                      "dark:border-border dark:bg-background/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
                    )}
                    role="tablist"
                    aria-label="Visibilidade do bloco Sobre a agência nos relatórios Rota digital partilhados com leads"
                  >
                    <div className="relative flex min-w-0 items-center gap-0.5">
                      <motion.button
                        type="button"
                        role="tab"
                        whileTap={{ scale: 0.98 }}
                        aria-selected={!agencyBrandingDraft.showOnReport}
                        onClick={() =>
                          setAgencyBrandingDraft((d) => ({ ...d, showOnReport: false }))
                        }
                        disabled={agencyBrandingSaving}
                        className={cn(
                          "relative isolate shrink-0 rounded-full px-2.5 py-1 font-semibold tracking-tight transition-colors duration-200",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                          !agencyBrandingDraft.showOnReport
                            ? "text-brand-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {!agencyBrandingDraft.showOnReport && (
                          <motion.div
                            layoutId="agency-show-on-report"
                            aria-hidden
                            className="pointer-events-none absolute inset-0 z-0 rounded-full shadow-sm ring-1 ring-black/5 dark:ring-2 dark:ring-white/20"
                            style={{ backgroundColor: "var(--brand)" }}
                            transition={{ type: "spring", bounce: 0.22, stiffness: 400, damping: 32 }}
                          />
                        )}
                        <span className="relative z-10">Oculto</span>
                      </motion.button>
                      <motion.button
                        type="button"
                        role="tab"
                        whileTap={{ scale: 0.98 }}
                        aria-selected={agencyBrandingDraft.showOnReport}
                        onClick={() => setAgencyBrandingDraft((d) => ({ ...d, showOnReport: true }))}
                        disabled={agencyBrandingSaving}
                        className={cn(
                          "relative isolate shrink-0 rounded-full px-2.5 py-1 font-semibold tracking-tight transition-colors duration-200",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                          agencyBrandingDraft.showOnReport
                            ? "text-brand-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {agencyBrandingDraft.showOnReport && (
                          <motion.div
                            layoutId="agency-show-on-report"
                            aria-hidden
                            className="pointer-events-none absolute inset-0 z-0 rounded-full shadow-sm ring-1 ring-black/5 dark:ring-2 dark:ring-white/20"
                            style={{ backgroundColor: "var(--brand)" }}
                            transition={{ type: "spring", bounce: 0.22, stiffness: 400, damping: 32 }}
                          />
                        )}
                        <span className="relative z-10">Exibir</span>
                      </motion.button>
                    </div>
                  </div>
                  {!agencyBrandingDraft.showOnReport ? (
                    <p
                      className="max-w-md text-[11px] leading-relaxed text-muted-foreground"
                      id="agency-branding-hidden-hint"
                    >
                      O bloco deixa de aparecer no link público de todos os relatórios Rota digital (atuais e futuros) que
                      os leads abrirem. No painel, continua visível em pré-visualização para poder voltar a exibir.
                    </p>
                  ) : null}
                </div>
                {agencyBrandingError ? (
                  <p
                    className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                    role="alert"
                  >
                    {agencyBrandingError}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 border-t border-border bg-muted/15 px-5 py-4 dark:border-white/10 dark:bg-zinc-950/40 sm:px-6 sm:py-5">
                <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAgencyBrandingDialogOpen(false)}
                    disabled={agencyBrandingSaving}
                    className="w-full sm:w-auto"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="cta"
                    onClick={() => void saveAgencyBrandingFromModal()}
                    disabled={agencyBrandingSaving || agencyBrandingLogoUploading}
                    className="w-full gap-2 sm:w-auto"
                  >
                    {agencyBrandingSaving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    Guardar
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <GenerateRouteProgressOverlay
            open={reanalyzeProgressOpen}
            progress={reanalyzeProgress}
            companyName={report.leadCompany}
            instantBarWidth={reanalyzeProgressCompleting}
            mode="reanalyze"
          />
        </>
      ) : null}

      {/* Print Header (only on print) */}
      <div className="hidden print:block mb-8">
        <h1 className="text-3xl font-bold">Rota Digital â€” {report.leadCompany}</h1>
        <p className="text-gray-500 mt-1">
          Relatório gerado em{" "}
          {new Date(report.createdAt).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {isDashboard && report.publicSlug?.trim() && publicLinkOrigin ? (
        <Card
          className={cn(
            "no-print border border-border bg-card shadow-lg ring-1 ring-foreground/10 dark:border-border dark:bg-card dark:shadow-xl",
            "border-l-[3px] border-l-brand/45 dark:border-l-brand/40",
            ROTA_REPORT_CARD_BOX,
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
              {`${publicLinkOrigin}/r/${report.publicSlug.trim()}`}
            </code>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                type="button"
                variant="cta"
                className="gap-2"
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    `${publicLinkOrigin}/r/${report.publicSlug!.trim()}`,
                  );
                  setPublicLinkCopied(true);
                  setTimeout(() => setPublicLinkCopied(false), 2000);
                }}
              >
                {publicLinkCopied ? <CheckCircle2 size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                {publicLinkCopied ? "Copiado" : "Copiar"}
              </Button>
              <LinkButton
                href={`/r/${report.publicSlug.trim()}`}
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

      {isDashboard ? (
        <Card className={cn("no-print", ROTA_REPORT_SURFACE_SECTION, ROTA_REPORT_CARD_BOX)}>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2.5">
              <SectionHeaderIcon Icon={FileText} tone="indigo" />
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground">
                Perfil da empresa
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <DashboardEditableRegion
              enabled
              isEditing={editingField === "companyProfile"}
              onStartEdit={() => beginTextEdit("companyProfile", report.companyProfile || "")}
              onCancel={cancelFieldEdit}
              onSave={() => void applyReportPatch({ companyProfile: editDraft.trim() })}
              saving={fieldSaving}
              error={editingField === "companyProfile" ? fieldError : null}
              draft={editDraft}
              onDraftChange={setEditDraft}
              ariaLabel="Editar perfil da empresa"
            >
              <ReportProseBlocks
                text={report.companyProfile?.trim() ? report.companyProfile : "â€”"}
                size="md"
                collapseToTwoParagraphs
                firstProminent={false}
              />
            </DashboardEditableRegion>
          </CardContent>
        </Card>
      ) : null}

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
            <DashboardEditableRegion
              enabled={isDashboard}
              isEditing={editingField === "executiveSummary"}
              onStartEdit={() => beginTextEdit("executiveSummary", report.executiveSummary || "")}
              onCancel={cancelFieldEdit}
              onSave={() => void applyReportPatch({ executiveSummary: editDraft.trim() })}
              saving={fieldSaving}
              error={editingField === "executiveSummary" ? fieldError : null}
              draft={editDraft}
              onDraftChange={setEditDraft}
              ariaLabel="Editar resumo executivo"
            >
              <ReportProseBlocks
                text={report.executiveSummary}
                size="lg"
                collapseToTwoParagraphs
              />
            </DashboardEditableRegion>
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
                  replaceToolbar={
                    isDashboard
                      ? {
                          ariaLabel: isWebsiteLogo ? "Substituir logo" : "Substituir foto de perfil",
                          busy:
                            evidenceReplaceSlot ===
                            (isWebsiteLogo ? "logo" : "instagramProfile"),
                          onPickFile: (file) =>
                            void handleReplaceEvidenceImage(
                              isWebsiteLogo ? "logo" : "instagramProfile",
                              file,
                            ),
                        }
                      : undefined
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
            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold tracking-tight tabular-nums text-foreground">
                  {headlineMaturity.digitalMaturityScore.toFixed(1)}
                </span>
                <span className="text-lg font-medium text-muted-foreground">/10</span>
              </div>
              <div className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-1000",
                      MATURITY_CONFIG[headlineMaturity.digitalMaturityLevel]?.bar || "bg-brand",
                    )}
                    style={{ width: `${headlineMaturity.digitalMaturityScore * 10}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Badge
                    className={cn(
                      "border-none px-0 text-sm font-semibold bg-transparent",
                      MATURITY_CONFIG[headlineMaturity.digitalMaturityLevel]?.scoreText ||
                        "text-brand dark:text-brand",
                    )}
                  >
                    Nível {headlineMaturity.digitalMaturityLevel}
                  </Badge>
                  <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Score
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Prazo estimado â€” fundo em destaque + CTA para apoio / especialista */}
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-brand/35 bg-brand/10">
                  <Calendar size={14} className="text-brand dark:text-brand" aria-hidden />
                </div>
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground print:text-foreground">
                  Prazo estimado
                </CardTitle>
              </div>
              {isDashboard && editingField !== "timeline" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={fieldSaving}
                  onClick={() => beginTextEdit("timeline", String(report.estimatedTimelineMonths))}
                  className="no-print size-8 shrink-0 rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-foreground"
                  aria-label="Editar prazo estimado (meses)"
                >
                  <Pencil className="size-3.5" aria-hidden />
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="relative flex flex-1 flex-col justify-between gap-4">
            <DashboardEditableRegion
              enabled={isDashboard}
              hideReadToolbar
              isEditing={editingField === "timeline"}
              onStartEdit={() => beginTextEdit("timeline", String(report.estimatedTimelineMonths))}
              onCancel={cancelFieldEdit}
              onSave={async () => {
                const m = parseInt(editDraft.trim(), 10);
                if (!Number.isFinite(m) || m < 1 || m > 120) {
                  setFieldError("Indique um número de meses entre 1 e 120.");
                  return;
                }
                await applyReportPatch({ estimatedTimelineMonths: m });
              }}
              saving={fieldSaving}
              error={editingField === "timeline" ? fieldError : null}
              draft={editDraft}
              onDraftChange={setEditDraft}
              ariaLabel="Editar prazo estimado (meses)"
              editStackClassName="space-y-4"
              editActionsClassName="mt-1 justify-end gap-2 border-t border-border/50 pt-4 dark:border-white/[0.08]"
              editSlot={
                <TimelineMonthsEditPanel
                  editDraft={editDraft}
                  fallbackMonths={report.estimatedTimelineMonths}
                  fieldSaving={fieldSaving}
                  onDraftChange={(v) => {
                    setEditDraft(v);
                    setFieldError(null);
                  }}
                />
              }
            >
              <div className="space-y-2.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-5xl font-bold tracking-tight tabular-nums text-brand dark:text-brand">
                    {report.estimatedTimelineMonths}
                  </span>
                  <span className="text-lg font-medium text-muted-foreground print:text-muted-foreground">
                    {isTimelineMonthSingular(report.estimatedTimelineMonths) ? "Mês" : "meses"}
                  </span>
                </div>
                <p className="border-l-2 border-brand/45 pl-2.5 text-[11px] leading-snug text-foreground/90 antialiased print:border-l-brand/50 print:text-zinc-800 dark:border-brand/40">
                  Tempo previsto para{" "}
                  <span className="font-semibold text-brand dark:text-brand print:text-zinc-900">
                    colocar este plano em prática
                  </span>
                  {" "}no seu negócio, em{" "}
                  <span className="font-semibold text-brand dark:text-brand print:text-zinc-900">
                    {isTimelineMonthSingular(report.estimatedTimelineMonths)
                      ? "mês corrido"
                      : "meses corridos"}
                  </span>
                  .
                  <span className="text-muted-foreground print:text-muted-foreground">
                    {" "}Serve para você entender o caminho, planejar o investimento e avançar com mais segurança.
                  </span>
                </p>
              </div>
            </DashboardEditableRegion>
            <a
              href={reportCta.top.href}
              {...(reportCta.top.openInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              title={
                reportCta.top.useWhatsAppIcon
                  ? "Falar com especialista (abre o WhatsApp)"
                  : reportCta.top.useMailIcon
                    ? "Falar com especialista (abre o e-mail)"
                    : "Marque uma conversa com um especialista para executar este plano"
              }
              aria-label={
                reportCta.top.useWhatsAppIcon
                  ? "Falar com especialista pelo WhatsApp"
                  : reportCta.top.useMailIcon
                    ? "Falar com especialista por e-mail"
                    : "Falar com um especialista da Rota Digital para colocar o plano do relatório em prática"
              }
              className={cn(
                buttonVariants({ variant: "ctaMotionGreen", size: "lg" }),
                "no-print relative h-10 min-h-10 w-full justify-center gap-2 overflow-hidden px-4 text-center text-sm leading-snug sm:px-5",
              )}
            >
              {reportCta.top.useWhatsAppIcon ? (
                <WhatsAppIcon className="size-4 shrink-0" />
              ) : reportCta.top.useMailIcon ? (
                <Mail className="size-4 shrink-0" aria-hidden />
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
              <DashboardEditableRegion
                enabled={isDashboard}
                isEditing={editingField === "brief-services"}
                onStartEdit={() =>
                  beginTextEdit(
                    "brief-services",
                    report.brief?.servicesOffered?.trim() ? report.brief.servicesOffered : "",
                  )
                }
                onCancel={cancelFieldEdit}
                onSave={() =>
                  void applyReportPatch({
                    brief: { ...(report.brief || {}), servicesOffered: editDraft.trim() },
                  })
                }
                saving={fieldSaving}
                error={editingField === "brief-services" ? fieldError : null}
                draft={editDraft}
                onDraftChange={setEditDraft}
                ariaLabel="Editar serviços oferecidos"
              >
                <ReportProseBlocks
                  text={report.brief?.servicesOffered?.trim() ? report.brief.servicesOffered : "â€”"}
                  size="sm"
                  collapseToTwoParagraphs
                  firstProminent={false}
                />
              </DashboardEditableRegion>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-1">Objetivo</p>
              <DashboardEditableRegion
                enabled={isDashboard}
                isEditing={editingField === "brief-objective"}
                onStartEdit={() =>
                  beginTextEdit("brief-objective", report.brief?.objective?.trim() ? report.brief.objective : "")
                }
                onCancel={cancelFieldEdit}
                onSave={() =>
                  void applyReportPatch({
                    brief: { ...(report.brief || {}), objective: editDraft.trim() },
                  })
                }
                saving={fieldSaving}
                error={editingField === "brief-objective" ? fieldError : null}
                draft={editDraft}
                onDraftChange={setEditDraft}
                ariaLabel="Editar objetivo do briefing"
              >
                <ReportProseBlocks
                  text={report.brief?.objective?.trim() ? report.brief.objective : "â€”"}
                  size="sm"
                  collapseToTwoParagraphs
                  firstProminent={false}
                />
              </DashboardEditableRegion>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {sortedDiagnosticScores.length > 0 || isDashboard ? (
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
            {sortedDiagnosticScores.length === 0 && isDashboard ? (
              <p className="text-sm text-muted-foreground">
                Ainda não há tópicos de diagnóstico. Use &quot;Adicionar tópico&quot; para criar o primeiro.
              </p>
            ) : null}
            {sortedDiagnosticScores.map((item, idx) => {
              const topicGlow = getDiagnosticTopicGlow(item.score);
              const originalIdx = (report.diagnosticScores || []).findIndex(
                (x) => x.topic === item.topic,
              );
              const diagnosticSlot = `diagnostic:${originalIdx}` as const;
              const diagnosticSiteSlot =
                originalIdx >= 0 ? (`diagnosticSite:${originalIdx}` as const) : null;
              const diagnosticInstagramSlot =
                originalIdx >= 0 ? (`diagnosticInstagram:${originalIdx}` as const) : null;
              const topicReplaceSite =
                isDashboard && diagnosticSiteSlot
                  ? {
                      ariaLabel: `Substituir captura da página do site em ${item.topic}`,
                      busy: evidenceReplaceSlot === diagnosticSiteSlot,
                      onPickFile: (file: File) =>
                        void handleReplaceEvidenceImage(diagnosticSiteSlot, file),
                    }
                  : undefined;
              const topicReplaceInstagram =
                isDashboard && diagnosticInstagramSlot
                  ? {
                      ariaLabel: `Substituir imagem do Instagram em ${item.topic}`,
                      busy: evidenceReplaceSlot === diagnosticInstagramSlot,
                      onPickFile: (file: File) =>
                        void handleReplaceEvidenceImage(diagnosticInstagramSlot, file),
                    }
                  : undefined;
              const topicReplaceSingle =
                isDashboard && originalIdx >= 0
                  ? {
                      ariaLabel: `Substituir evidência de ${item.topic}`,
                      busy: evidenceReplaceSlot === diagnosticSlot,
                      onPickFile: (file: File) =>
                        void handleReplaceEvidenceImage(diagnosticSlot, file),
                    }
                  : undefined;
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
                <div className={cn("relative rounded-[10px] p-6 sm:p-7", ROTA_REPORT_SURFACE_GLOW_INNER)}>
                  <div className="grid gap-5 md:grid-cols-[360px_minmax(0,1fr)] md:items-start md:gap-6">
                    <TopicEvidence
                      item={item}
                      report={report}
                      isDashboard={isDashboard}
                      replaceToolbarSite={topicReplaceSite}
                      replaceToolbarInstagram={topicReplaceInstagram}
                      replaceToolbarSingle={topicReplaceSingle}
                    />
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2 pb-2">
                        <div className="space-y-1.5">
                          <DiagnosticTopicPill topic={item.topic} />
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Badge className={cn("text-xs font-bold px-2.5 py-0.5", getScoreBadgeClass(item.score))}>
                            {item.score}/10
                          </Badge>
                        </div>
                      </div>
                      <DashboardEditableRegion
                        enabled={isDashboard}
                        hideReadToolbar={isDashboard}
                        isEditing={editingField === `diagnostic:${idx}`}
                        onStartEdit={() => beginDiagnosticEdit(idx, sortedDiagnosticScores)}
                        onCancel={cancelFieldEdit}
                        onSave={() => void saveDiagnosticEdit()}
                        saving={fieldSaving}
                        error={editingField === `diagnostic:${idx}` ? fieldError : null}
                        draft=""
                        onDraftChange={() => {}}
                        ariaLabel={`Editar comentário: ${item.topic}`}
                        onDelete={() => void removeDiagnosticItem(item)}
                        deleteAriaLabel={`Remover tópico ${item.topic}`}
                        editSlot={
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Nome do tópico</label>
                              <Input
                                value={diagTopicDraft}
                                onChange={(e) => setDiagTopicDraft(e.target.value)}
                                className="text-sm"
                              />
                            </div>
                            <DiagnosticScoreSlider
                              value={diagScoreDraft}
                              onChange={setDiagScoreDraft}
                              disabled={fieldSaving}
                            />
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Comentário</label>
                              <Textarea
                                value={diagCommentDraft}
                                onChange={(e) => setDiagCommentDraft(e.target.value)}
                                className="min-h-[160px] resize-y text-sm"
                              />
                            </div>
                          </div>
                        }
                      >
                        <ReportProseBlocks text={item.comment} size="md" collapseToTwoParagraphs />
                      </DashboardEditableRegion>
                    </div>
                  </div>
                  {isDashboard && editingField !== `diagnostic:${idx}` ? (
                    <div className="no-print absolute bottom-4 right-4 z-[5] flex flex-row items-center gap-0.5 sm:bottom-5 sm:right-5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void removeDiagnosticItem(item)}
                        disabled={fieldSaving}
                        className="size-8 rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-destructive"
                        aria-label={`Remover tópico ${item.topic}`}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => beginDiagnosticEdit(idx, sortedDiagnosticScores)}
                        disabled={fieldSaving}
                        className="size-8 rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-foreground"
                        aria-label={`Editar comentário: ${item.topic}`}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </BorderGlow>
              );
            })}
            {isDashboard ? (
              <div className="no-print flex justify-end border-t border-border/60 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void addDiagnosticTopic()}
                  disabled={fieldSaving}
                >
                  <Plus className="size-4" aria-hidden />
                  Adicionar tópico
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <ReportPlacesSections
        report={report}
        isDashboard={isDashboard}
        plan={effectiveReportPlan}
        patchReport={async (patch) => await applyReportPatch(patch)}
        showMasterPlacesSearchTest={isViewerMasterAdmin}
        onRequestGmbUpgrade={openGmbUpgradeModal}
        onRequestCompetitorUpgrade={openCompetitorUpgradeModal}
      />

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
              {/* Mobile: bio em texto duplica a captura do perfil â€” sÃ³ mostrar a partir de md. */}
              <div className="flex flex-col gap-3 max-md:hidden">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Bio do Instagram</p>
                <div
                  className={cn(
                    "shrink-0 rounded-xl p-5",
                    ROTA_REPORT_SURFACE_INSET,
                    "shadow-none",
                  )}
                >
                  <DashboardEditableRegion
                    enabled={isDashboard}
                    isEditing={editingField === "evidence-instagram-bio-excerpt"}
                    onStartEdit={() => {
                      const bio = report.evidences?.instagramBioExcerpt;
                      beginTextEdit("evidence-instagram-bio-excerpt", bio?.trim() ? bio : "");
                    }}
                    onCancel={cancelFieldEdit}
                    onSave={() =>
                      void applyReportPatch({
                        evidences: {
                          ...(report.evidences || {}),
                          instagramBioExcerpt: editDraft.trim(),
                        },
                      })
                    }
                    saving={fieldSaving}
                    error={editingField === "evidence-instagram-bio-excerpt" ? fieldError : null}
                    draft={editDraft}
                    onDraftChange={setEditDraft}
                    ariaLabel="Editar texto da bio do Instagram"
                    textAreaClassName="min-h-[160px] whitespace-pre-wrap break-words font-sans text-[14px] leading-relaxed [overflow-wrap:anywhere]"
                  >
                    {/* Bio: manter quebras de linha como no Instagram (`\\n` na coleta), sem normalizar em frases. */}
                    <p className="text-[14px] leading-relaxed text-foreground whitespace-pre-line break-words [overflow-wrap:anywhere]">
                      {report.evidences.instagramBioExcerpt?.trim()
                        ? report.evidences.instagramBioExcerpt
                        : report.evidences.instagramSnapshotUrl
                          ? "A bio nÃ£o foi extraÃ­da em texto na coleta automÃ¡tica â€” confira a captura do perfil ao lado para ler a bio e as mÃ©tricas na imagem."
                          : "Bio não disponível na coleta automática."}
                    </p>
                  </DashboardEditableRegion>
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
                replaceToolbar={
                  isDashboard
                    ? {
                        ariaLabel: "Substituir imagem do Instagram",
                        busy: evidenceReplaceSlot === "instagramSnapshot",
                        onPickFile: (file) => void handleReplaceEvidenceImage("instagramSnapshot", file),
                      }
                    : undefined
                }
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
                replaceToolbar={
                  isDashboard
                    ? {
                        ariaLabel: "Substituir captura da página do site",
                        busy: evidenceReplaceSlot === "siteHero",
                        onPickFile: (file) => void handleReplaceEvidenceImage("siteHero", file),
                      }
                    : undefined
                }
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
                  replaceToolbar={
                    isDashboard
                      ? {
                          ariaLabel: "Substituir captura do destino do link da bio",
                          busy: evidenceReplaceSlot === "instagramBioLink",
                          onPickFile: (file) =>
                            void handleReplaceEvidenceImage("instagramBioLink", file),
                        }
                      : undefined
                  }
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
                      <DashboardEditableRegion
                        enabled={isDashboard}
                        isEditing={editingField === "research-website"}
                        onStartEdit={() => {
                          const initial =
                            notes.website ||
                            "Website: não foi possível validar conteúdo relevante; tratar como presença fraca ou inexistente até revisão manual.";
                          beginTextEdit("research-website", initial);
                        }}
                        onCancel={cancelFieldEdit}
                        onSave={() => {
                          const cur = parseResearchNotes(report.evidences?.researchNotes);
                          const merged = buildResearchNotesFromParts({
                            ...cur,
                            website: editDraft.trim(),
                          });
                          void applyReportPatch({
                            evidences: { ...(report.evidences || {}), researchNotes: merged },
                          });
                        }}
                        saving={fieldSaving}
                        error={editingField === "research-website" ? fieldError : null}
                        draft={editDraft}
                        onDraftChange={setEditDraft}
                        ariaLabel="Editar nota de pesquisa do website"
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
                      </DashboardEditableRegion>
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
                      <DashboardEditableRegion
                        enabled={isDashboard}
                        isEditing={editingField === "research-instagram"}
                        onStartEdit={() => {
                          const initial = notes.instagram?.trim()
                            ? notes.instagram
                            : normalizedInstagramNote;
                          beginTextEdit("research-instagram", initial);
                        }}
                        onCancel={cancelFieldEdit}
                        onSave={() => {
                          const cur = parseResearchNotes(report.evidences?.researchNotes);
                          const merged = buildResearchNotesFromParts({
                            ...cur,
                            instagram: editDraft.trim(),
                          });
                          void applyReportPatch({
                            evidences: { ...(report.evidences || {}), researchNotes: merged },
                          });
                        }}
                        saving={fieldSaving}
                        error={editingField === "research-instagram" ? fieldError : null}
                        draft={editDraft}
                        onDraftChange={setEditDraft}
                        ariaLabel="Editar nota de pesquisa do Instagram"
                      >
                        <div className={cn("mb-5", TOPIC_PILL_INSTAGRAM)}>
                          <InstagramBrandGlyph className="size-3.5 text-pink-600 dark:text-pink-400" aria-hidden />
                          <span className={TOPIC_PILL_LABEL_NEXT_TO_ICON}>Instagram</span>
                        </div>
                        <EvidenceResearchNoteProse text={normalizedInstagramNote} size="md" />
                      </DashboardEditableRegion>
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

      {/* SWOT â€” moldura com BorderGlow (antes eram sÃ³ Card, sem hover na borda). */}
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
            <CardContent
              className={cn(
                "flex min-h-0 flex-1 flex-col",
                isDashboard && !strengthsTopicMode && "pb-12",
              )}
            >
              <ul className="space-y-0">
                {report.strengths.length === 0 && strengthsTopicMode ? (
                  <li className="py-3 text-sm text-muted-foreground">Sem itens â€” use â€œAdicionar forÃ§aâ€.</li>
                ) : null}
                {report.strengths.map((s, i) => (
                  <li
                    key={i}
                    className={cn(
                      "relative flex items-start gap-2 py-3.5 text-sm leading-relaxed text-foreground/90 sm:gap-3 sm:py-4",
                      i > 0 &&
                        "before:pointer-events-none before:absolute before:left-0 before:right-[8%] before:top-0 before:h-px before:rounded-full before:bg-gradient-to-r before:from-[color:var(--rota-sev-c-border)]/45 before:via-[color:var(--rota-sev-c-bar)]/28 before:to-transparent before:content-[''] dark:before:from-[color:var(--rota-sev-c-border)]/38 dark:before:via-[color:var(--rota-sev-c-bar)]/22 print:before:hidden",
                    )}
                  >
                    <CheckCircle2
                      size={16}
                      className="mt-1 shrink-0 text-[color:var(--rota-sev-c-border)]/70"
                    />
                    <div className="min-w-0 flex-1">
                      {strengthsTopicMode ? (
                        <DashboardEditableRegion
                          density="compact"
                          readToolbarPlacement="top-right"
                          enabled
                          isEditing={editingField === `strengths:${i}`}
                          onStartEdit={() => beginTextEdit(`strengths:${i}`, s)}
                          onCancel={cancelFieldEdit}
                          onSave={() => void patchSwotItem("strengths", i, editDraft)}
                          saving={fieldSaving}
                          error={editingField === `strengths:${i}` ? fieldError : null}
                          draft={editDraft}
                          onDraftChange={setEditDraft}
                          ariaLabel={`Editar força ${i + 1}`}
                          onDelete={() => {
                            cancelFieldEdit();
                            void removeSwotItem("strengths", i);
                          }}
                          deleteAriaLabel="Remover força"
                        >
                          <span className="block">{s}</span>
                        </DashboardEditableRegion>
                      ) : (
                        <span>{s}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {strengthsTopicMode ? (
                <DashboardListSectionEditFooter
                  fieldSaving={fieldSaving}
                  onAdd={() => void appendSwotItem("strengths")}
                  addAriaLabel="Adicionar força"
                  onSaveClose={saveListSectionFooterAndClose}
                  onCancel={closeListSectionEdit}
                />
              ) : null}
            </CardContent>
            {isDashboard && !strengthsTopicMode ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={fieldSaving}
                onClick={() => openListSectionEdit("strengths")}
                className="no-print absolute bottom-3 right-3 z-[6] size-8 rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-foreground sm:bottom-4 sm:right-4"
                aria-label="Editar forças"
              >
                <Pencil className="size-3.5" aria-hidden />
              </Button>
            ) : null}
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
            <CardContent
              className={cn(
                "flex min-h-0 flex-1 flex-col",
                isDashboard && !weaknessesTopicMode && "pb-12",
              )}
            >
              <ul className="space-y-0">
                {report.weaknesses.length === 0 && weaknessesTopicMode ? (
                  <li className="py-3 text-sm text-muted-foreground">Sem itens â€” use â€œAdicionar fraquezaâ€.</li>
                ) : null}
                {report.weaknesses.map((w, i) => (
                  <li
                    key={i}
                    className={cn(
                      "relative flex items-start gap-2 py-3.5 text-sm leading-relaxed text-foreground/90 sm:gap-3 sm:py-4",
                      i > 0 &&
                        "before:pointer-events-none before:absolute before:left-0 before:right-[8%] before:top-0 before:h-px before:rounded-full before:bg-gradient-to-r before:from-[color:var(--rota-sev-a-border)]/45 before:via-[color:var(--rota-sev-a-bar)]/28 before:to-transparent before:content-[''] dark:before:from-[color:var(--rota-sev-a-border)]/38 dark:before:via-[color:var(--rota-sev-a-bar)]/22 print:before:hidden",
                    )}
                  >
                    <AlertCircle
                      size={16}
                      className="mt-1 shrink-0 text-[color:var(--rota-sev-a-border)]/65"
                    />
                    <div className="min-w-0 flex-1">
                      {weaknessesTopicMode ? (
                        <DashboardEditableRegion
                          density="compact"
                          readToolbarPlacement="top-right"
                          enabled
                          isEditing={editingField === `weaknesses:${i}`}
                          onStartEdit={() => beginTextEdit(`weaknesses:${i}`, w)}
                          onCancel={cancelFieldEdit}
                          onSave={() => void patchSwotItem("weaknesses", i, editDraft)}
                          saving={fieldSaving}
                          error={editingField === `weaknesses:${i}` ? fieldError : null}
                          draft={editDraft}
                          onDraftChange={setEditDraft}
                          ariaLabel={`Editar fraqueza ${i + 1}`}
                          onDelete={() => {
                            cancelFieldEdit();
                            void removeSwotItem("weaknesses", i);
                          }}
                          deleteAriaLabel="Remover fraqueza"
                        >
                          <span className="block">{w}</span>
                        </DashboardEditableRegion>
                      ) : (
                        <span>{w}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {weaknessesTopicMode ? (
                <DashboardListSectionEditFooter
                  fieldSaving={fieldSaving}
                  onAdd={() => void appendSwotItem("weaknesses")}
                  addAriaLabel="Adicionar fraqueza"
                  onSaveClose={saveListSectionFooterAndClose}
                  onCancel={closeListSectionEdit}
                />
              ) : null}
            </CardContent>
            {isDashboard && !weaknessesTopicMode ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={fieldSaving}
                onClick={() => openListSectionEdit("weaknesses")}
                className="no-print absolute bottom-3 right-3 z-[6] size-8 rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-foreground sm:bottom-4 sm:right-4"
                aria-label="Editar fraquezas"
              >
                <Pencil className="size-3.5" aria-hidden />
              </Button>
            ) : null}
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
            <CardContent
              className={cn(
                "flex min-h-0 flex-1 flex-col",
                isDashboard && !opportunitiesTopicMode && "pb-12",
              )}
            >
              <ul className="space-y-0">
                {report.opportunities.length === 0 && opportunitiesTopicMode ? (
                  <li className="py-3 text-sm text-muted-foreground">Sem itens â€” use â€œAdicionar oportunidadeâ€.</li>
                ) : null}
                {report.opportunities.map((o, i) => (
                  <li
                    key={i}
                    className={cn(
                      "relative flex items-start gap-2 py-3.5 text-sm leading-relaxed text-foreground/90 sm:gap-3 sm:py-4",
                      i > 0 &&
                        "before:pointer-events-none before:absolute before:left-0 before:right-[8%] before:top-0 before:h-px before:rounded-full before:bg-gradient-to-r before:from-[color:var(--rota-sev-b-border)]/45 before:via-[color:var(--rota-sev-b-bar)]/28 before:to-transparent before:content-[''] dark:before:from-[color:var(--rota-sev-b-border)]/38 dark:before:via-[color:var(--rota-sev-b-bar)]/22 print:before:hidden",
                    )}
                  >
                    <Star size={16} className="mt-1 shrink-0 text-[color:var(--rota-sev-b-border)]/68" />
                    <div className="min-w-0 flex-1">
                      {opportunitiesTopicMode ? (
                        <DashboardEditableRegion
                          density="compact"
                          readToolbarPlacement="top-right"
                          enabled
                          isEditing={editingField === `opportunities:${i}`}
                          onStartEdit={() => beginTextEdit(`opportunities:${i}`, o)}
                          onCancel={cancelFieldEdit}
                          onSave={() => void patchSwotItem("opportunities", i, editDraft)}
                          saving={fieldSaving}
                          error={editingField === `opportunities:${i}` ? fieldError : null}
                          draft={editDraft}
                          onDraftChange={setEditDraft}
                          ariaLabel={`Editar oportunidade ${i + 1}`}
                          onDelete={() => {
                            cancelFieldEdit();
                            void removeSwotItem("opportunities", i);
                          }}
                          deleteAriaLabel="Remover oportunidade"
                        >
                          <span className="block">{o}</span>
                        </DashboardEditableRegion>
                      ) : (
                        <span>{o}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {opportunitiesTopicMode ? (
                <DashboardListSectionEditFooter
                  fieldSaving={fieldSaving}
                  onAdd={() => void appendSwotItem("opportunities")}
                  addAriaLabel="Adicionar oportunidade"
                  onSaveClose={saveListSectionFooterAndClose}
                  onCancel={closeListSectionEdit}
                />
              ) : null}
            </CardContent>
            {isDashboard && !opportunitiesTopicMode ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={fieldSaving}
                onClick={() => openListSectionEdit("opportunities")}
                className="no-print absolute bottom-3 right-3 z-[6] size-8 rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-foreground sm:bottom-4 sm:right-4"
                aria-label="Editar oportunidades"
              >
                <Pencil className="size-3.5" aria-hidden />
              </Button>
            ) : null}
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
          <div className="grid grid-cols-1 gap-10 md:auto-rows-fr md:grid-cols-2 md:items-stretch md:gap-x-6 md:gap-y-12">
            {sortedChannels.map((channel, i) => (
              <ChannelCard
                key={`${channel.name}-${i}`}
                channel={channel}
                channelIndex={i}
                dashboardChannelEdit={dashboardChannelEdit}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick wins / longo prazo: apoio Ã  leitura â€” contraste melhor que muted/50, sem competir com PrÃ³ximos passos (spotlight + linhas com marca). */}
      <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
        <Card
          className={cn(
            "relative min-w-0 gap-2 overflow-hidden",
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
          <CardContent
            className={cn(isDashboard && !quickWinsTopicMode && "pb-12")}
          >
            <ul className="space-y-0">
              {report.quickWins.length === 0 && quickWinsTopicMode ? (
                <li className="py-3 text-sm text-muted-foreground">Sem itens â€” use â€œAdicionarâ€.</li>
              ) : null}
              {report.quickWins.map((win, i) => (
                <li
                  key={i}
                  className={cn(
                    "relative flex items-center gap-3 py-3.5 text-[14px] leading-relaxed text-foreground sm:gap-4 sm:py-4 dark:text-zinc-200/95",
                    i > 0 &&
                      "before:pointer-events-none before:absolute before:left-0 before:right-[8%] before:top-0 before:h-px before:rounded-full before:bg-gradient-to-r before:from-border before:via-border/70 before:to-transparent before:content-[''] dark:before:from-white/22 dark:before:via-white/12 print:before:hidden",
                  )}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-[11px] font-semibold tabular-nums text-foreground/90 ring-1 ring-border/80 dark:border-border dark:bg-background dark:text-zinc-300 dark:ring-border">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    {quickWinsTopicMode ? (
                      <DashboardEditableRegion
                        density="compact"
                        readToolbarPlacement="top-right"
                        enabled
                        isEditing={editingField === `quickWins:${i}`}
                        onStartEdit={() => beginTextEdit(`quickWins:${i}`, win)}
                        onCancel={cancelFieldEdit}
                        onSave={() => void patchReportStringListItem("quickWins", i, editDraft)}
                        saving={fieldSaving}
                        error={editingField === `quickWins:${i}` ? fieldError : null}
                        draft={editDraft}
                        onDraftChange={setEditDraft}
                        ariaLabel={`Editar item ${i + 1}`}
                        onDelete={() => {
                          cancelFieldEdit();
                          void removeReportStringListItem("quickWins", i);
                        }}
                        deleteAriaLabel="Remover item"
                      >
                        <span className="block">{win}</span>
                      </DashboardEditableRegion>
                    ) : (
                      <span>{win}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {quickWinsTopicMode ? (
              <DashboardListSectionEditFooter
                fieldSaving={fieldSaving}
                onAdd={() => void appendReportStringListItem("quickWins")}
                addAriaLabel="Adicionar item"
                onSaveClose={saveListSectionFooterAndClose}
                onCancel={closeListSectionEdit}
              />
            ) : null}
          </CardContent>
          {isDashboard && !quickWinsTopicMode ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={fieldSaving}
              onClick={() => openListSectionEdit("quickWins")}
              className="no-print absolute bottom-3 right-3 z-[6] size-8 rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-foreground sm:bottom-4 sm:right-4"
              aria-label="Editar o que fazer primeiro"
            >
              <Pencil className="size-3.5" aria-hidden />
            </Button>
          ) : null}
        </Card>

        <Card
          className={cn(
            "relative min-w-0 gap-2 overflow-hidden",
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
          <CardContent
            className={cn(isDashboard && !longTermTopicMode && "pb-12")}
          >
            <ul className="space-y-0">
              {report.longTermActions.length === 0 && longTermTopicMode ? (
                <li className="py-3 text-sm text-muted-foreground">Sem itens â€” use â€œAdicionarâ€.</li>
              ) : null}
              {report.longTermActions.map((action, i) => (
                <li
                  key={i}
                  className={cn(
                    "relative flex items-center gap-3 py-3.5 text-[14px] leading-relaxed text-foreground sm:gap-4 sm:py-4 dark:text-zinc-200/95",
                    i > 0 &&
                      "before:pointer-events-none before:absolute before:left-0 before:right-[8%] before:top-0 before:h-px before:rounded-full before:bg-gradient-to-r before:from-border before:via-border/70 before:to-transparent before:content-[''] dark:before:from-white/22 dark:before:via-white/12 print:before:hidden",
                  )}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-[11px] font-semibold tabular-nums text-foreground/90 ring-1 ring-border/80 dark:border-border dark:bg-background dark:text-zinc-300 dark:ring-border">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    {longTermTopicMode ? (
                      <DashboardEditableRegion
                        density="compact"
                        readToolbarPlacement="top-right"
                        enabled
                        isEditing={editingField === `longTermActions:${i}`}
                        onStartEdit={() => beginTextEdit(`longTermActions:${i}`, action)}
                        onCancel={cancelFieldEdit}
                        onSave={() => void patchReportStringListItem("longTermActions", i, editDraft)}
                        saving={fieldSaving}
                        error={editingField === `longTermActions:${i}` ? fieldError : null}
                        draft={editDraft}
                        onDraftChange={setEditDraft}
                        ariaLabel={`Editar ação de longo prazo ${i + 1}`}
                        onDelete={() => {
                          cancelFieldEdit();
                          void removeReportStringListItem("longTermActions", i);
                        }}
                        deleteAriaLabel="Remover ação"
                      >
                        <span className="block">{action}</span>
                      </DashboardEditableRegion>
                    ) : (
                      <span>{action}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {longTermTopicMode ? (
              <DashboardListSectionEditFooter
                fieldSaving={fieldSaving}
                onAdd={() => void appendReportStringListItem("longTermActions")}
                addAriaLabel="Adicionar ação"
                onSaveClose={saveListSectionFooterAndClose}
                onCancel={closeListSectionEdit}
              />
            ) : null}
          </CardContent>
          {isDashboard && !longTermTopicMode ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={fieldSaving}
              onClick={() => openListSectionEdit("longTermActions")}
              className="no-print absolute bottom-3 right-3 z-[6] size-8 rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-foreground sm:bottom-4 sm:right-4"
              aria-label="Editar ações de longo prazo"
            >
              <Pencil className="size-3.5" aria-hidden />
            </Button>
          ) : null}
        </Card>
      </div>

      {reportAgencyBranding ? (
        <CardSpotlight
          className={cn(
            "scroll-mt-6 w-full print:border-zinc-200 print:bg-white",
            ROTA_REPORT_AGENCY_CARD_BOX,
            reportAgencyBranding.isPreviewHidden && "print:hidden",
          )}
        >
          <Card
            id="report-agencia"
            className={cn(
              "relative border-0 !bg-transparent shadow-none ring-0 print-white",
              "py-0 gap-0",
            )}
          >
            {reportAgencyBranding.isPreviewHidden ? (
              <div className="no-print flex flex-none justify-end px-4 pb-1.5 pt-2.5 sm:px-7 sm:pb-2 sm:pt-3">
                <Badge
                  className="pointer-events-none border-amber-500/50 bg-amber-500/18 text-[10px] font-bold uppercase tracking-wide text-amber-950 shadow-sm dark:border-amber-400/45 dark:bg-amber-500/12 dark:text-amber-100"
                  variant="outline"
                >
                  Oculta
                </Badge>
              </div>
            ) : null}
            <div
              className={cn(
                reportAgencyBranding.isPreviewHidden &&
                  "pointer-events-none opacity-[0.42] [filter:saturate(0.7)] dark:opacity-[0.48]",
              )}
            >
              <CardContent
                className={cn(
                  "px-4 sm:px-7",
                  "py-3.5 sm:py-4",
                  isDashboard && "pe-10 sm:pe-12",
                  reportAgencyBranding.isPreviewHidden && isDashboard && "pt-0",
                )}
              >
                <h2 className="sr-only">Sobre a agência</h2>
                {/* Até md: coluna (logo em cima); a partir de md: linha — evita “lado a lado” em telemóveis largos. */}
                <div className="flex min-w-0 flex-col items-stretch gap-4 md:flex-row md:items-center md:gap-6 lg:gap-7">
                  {/* No mobile alinhada à esquerda; no desktop w-auto (coluna do logo sem roubar 100% da linha). */}
                  <div className="flex w-full max-w-full shrink-0 justify-start md:w-auto md:max-w-none md:flex-none">
                    <div
                      className={cn(
                        "relative flex aspect-square w-full max-w-[min(85vw,14rem)] items-center justify-center",
                        "md:max-w-[14rem] lg:max-w-[15rem]",
                        "rounded-full",
                        "border-[8px] sm:border-[10px] border-white/[0.11] dark:border-white/[0.14]",
                        "bg-[linear-gradient(180deg,rgba(255,255,255,0.07)_0%,rgba(255,255,255,0.02)_100%)]",
                        "shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_40px_-14px_rgba(255,255,255,0.1),0_20px_40px_-24px_rgba(0,0,0,0.5)]",
                        "p-2.5 sm:p-3",
                      )}
                    >
                      <img
                        src={reportAgencyBranding.logoSrc}
                        alt={`Logótipo de ${reportAgencyBranding.name}`}
                        className="h-full w-full rounded-full object-contain"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  </div>
                  <p className="m-0 min-w-0 w-full flex-1 whitespace-pre-line text-left text-[13px] leading-snug text-foreground/92 dark:text-zinc-200/95 sm:text-[13.5px] sm:leading-relaxed md:min-w-0 md:flex-1">
                    {reportAgencyBranding.summary}
                  </p>
                </div>
              </CardContent>
            </div>
            {isDashboard ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => openAgencyBrandingDialog()}
                disabled={userSettingsForAgencyBranding === null}
                className={cn(
                  "no-print pointer-events-auto absolute z-[8] size-8 rounded-md shadow-md",
                  "bottom-3.5 right-3.5 sm:bottom-4 sm:right-4",
                  "border-0 !bg-[color:var(--brand)] !text-[color:var(--brand-foreground)]",
                  "hover:!bg-[color:var(--brand)] hover:brightness-110",
                  "active:brightness-95 disabled:opacity-50",
                )}
                aria-label="Editar logótipo, descrição e exibição da secção (definições globais; Pro ou Agency)"
              >
                <Pencil className="size-3.5" aria-hidden />
              </Button>
            ) : null}
          </Card>
        </CardSpotlight>
      ) : null}

      {/* PrÃ³ximos passos â€” spotlight ao hover */}
      <CardSpotlight className={cn("scroll-mt-6 w-full print:border-zinc-200 print:bg-white", ROTA_REPORT_CARD_BOX)}>
        <Card
          id="report-proximos-passos"
          className={cn(
            "relative border-0 !bg-transparent shadow-none ring-0 print-white",
            "py-0 gap-0",
          )}
        >
          <div>
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
              {report.nextSteps.length === 0 && nextStepsTopicMode ? (
                <p className="text-sm text-muted-foreground">Sem passos â€” use â€œAdicionar passoâ€.</p>
              ) : null}
              {report.nextSteps.map((step, i) => (
                <div key={i} className="group/step relative min-w-0 w-full pl-3 sm:pl-4">
                  {/* 
                    Layout de "Borda Contínua": 
                    A caixa principal tem um recorte circular à esquerda e o número está envolto 
                    por uma borda que se conecta perfeitamente à caixa fazendo a curva em S.
                  */}
                  <div
                    className={cn(
                      "relative min-w-0 rounded-md border border-border border-l-transparent bg-card/80 py-4 pl-8 pr-4 sm:pr-6",
                      "shadow-sm transition-[border-color,box-shadow] duration-300",
                      "group-hover/step:border-brand/45 group-hover/step:shadow-md group-hover/step:shadow-brand/5",
                      "dark:border-border dark:bg-secondary/60 dark:group-hover/step:border-brand/35",
                      // Curvas superior/inferior: só borda horizontal + canto arredondado (sem border-r — evita linha vertical no meio do número).
                      "before:pointer-events-none before:absolute before:-left-[20px] before:top-1/2 before:h-10 before:w-6 before:-translate-y-full before:rounded-br-md before:border-b before:border-border before:content-[''] dark:before:border-border group-hover/step:before:border-brand/45",
                      "after:pointer-events-none after:absolute after:-left-[20px] after:top-1/2 after:h-10 after:w-6 after:rounded-tr-md after:border-t after:border-border after:content-[''] dark:after:border-border group-hover/step:after:border-brand/45",
                    )}
                  >
                    {/* Número: anel exterior só na metade direita (metade esquerda “entra” na caixa); interior inteiro por cima. */}
                    <div className="absolute -left-[21px] top-1/2 z-30 -translate-y-1/2">
                      <div className="relative size-11 rounded-full bg-card transition-transform duration-300 group-hover/step:scale-110 dark:bg-zinc-950">
                        <div
                          className="pointer-events-none absolute inset-0 overflow-hidden [clip-path:inset(0_0_0_50%)]"
                          aria-hidden
                        >
                          <div
                            className={cn(
                              "absolute left-1/2 top-1/2 size-11 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/90 bg-card shadow-sm",
                              "dark:border-zinc-600/80 dark:bg-zinc-950",
                              "transition-[border-color,box-shadow] duration-300 group-hover/step:border-brand/50 group-hover/step:shadow-brand/20",
                            )}
                          />
                        </div>
                        <div
                          className={cn(
                            "absolute left-1/2 top-1/2 z-10 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-brand/30 bg-card text-[13px] font-black tabular-nums text-brand",
                            "dark:border-brand/35 dark:bg-zinc-900",
                          )}
                        >
                          {i + 1}
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0">
                    {nextStepsTopicMode ? (
                      <DashboardEditableRegion
                        density="compact"
                        readToolbarPlacement="top-right"
                        enabled
                        isEditing={editingField === `nextSteps:${i}`}
                        onStartEdit={() => beginTextEdit(`nextSteps:${i}`, step)}
                        onCancel={cancelFieldEdit}
                        onSave={() => void patchReportStringListItem("nextSteps", i, editDraft)}
                        saving={fieldSaving}
                        error={editingField === `nextSteps:${i}` ? fieldError : null}
                        draft={editDraft}
                        onDraftChange={setEditDraft}
                        ariaLabel={`Editar passo ${i + 1}`}
                        onDelete={() => {
                          cancelFieldEdit();
                          void removeReportStringListItem("nextSteps", i);
                        }}
                        deleteAriaLabel="Remover passo"
                      >
                        <p className="m-0 text-[14.5px] leading-relaxed text-foreground">{step}</p>
                      </DashboardEditableRegion>
                    ) : (
                      <p className="m-0 text-[14.5px] leading-relaxed text-foreground">{step}</p>
                    )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {nextStepsTopicMode ? (
              <DashboardListSectionEditFooter
                className="mt-4"
                fieldSaving={fieldSaving}
                onAdd={() => void appendReportStringListItem("nextSteps")}
                addAriaLabel="Adicionar passo"
                onSaveClose={saveListSectionFooterAndClose}
                onCancel={closeListSectionEdit}
              />
            ) : null}
            </CardContent>
          </div>
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
                  : reportCta.bottom.useMailIcon
                    ? "Agendar reunião estratégica (abre o e-mail)"
                    : "Agendar reunião estratégica com a Rota Digital"
              }
              aria-label={
                reportCta.bottom.useWhatsAppIcon
                  ? "Agendar reunião estratégica pelo WhatsApp"
                  : reportCta.bottom.useMailIcon
                    ? "Agendar reunião estratégica por e-mail"
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
              ) : reportCta.bottom.useMailIcon ? (
                <Mail className="size-4 shrink-0" aria-hidden />
              ) : (
                <Calendar className="size-4 shrink-0" aria-hidden />
              )}
              {reportCta.bottom.label}
            </a>
          </div>
          {isDashboard && !nextStepsTopicMode ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={fieldSaving}
              onClick={() => openListSectionEdit("nextSteps")}
              className="no-print absolute bottom-5 right-5 z-[6] size-8 rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-foreground sm:bottom-6 sm:right-7"
              aria-label="Editar próximos passos"
            >
              <Pencil className="size-3.5" aria-hidden />
            </Button>
          ) : null}
        </Card>
      </CardSpotlight>

      {/* Footer */}
      <div className="text-center text-muted-foreground text-xs leading-snug space-y-2.5 py-4 no-print">
        <div className="flex justify-center">
          <Image
            src="/assets/logo/logo-dark.png"
            alt="Rota Digital"
            width={220}
            height={62}
            className="h-6 w-auto object-contain object-center dark:hidden"
          />
          <Image
            src="/assets/logo/logo-white.png"
            alt="Rota Digital"
            width={220}
            height={62}
            className="hidden h-6 w-auto object-contain object-center dark:block"
          />
        </div>
        <span className="block">{reportCreatedAtLine2}</span>
      </div>

      <PublicReportFloatingCta bottomCta={reportCta.bottom} />
    </div>
  );
}

