import { NextRequest, NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  DynamicRetrievalMode,
} from "@google/generative-ai";
import { randomBytes } from "crypto";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { incrementCycleUsageAdmin, readCycleUsage } from "@/lib/cycle-usage";
import {
  ROTAS_ADD_ON_PACKS,
  resolveCycleStartMs,
  resolveQuotaLimit,
} from "@/lib/plan-quotas";
import { PLAN_FEATURES, type PlanFeatures } from "@/lib/plan-limits";
import { getUserPlanAdmin } from "@/lib/plan-limits-admin";
import {
  ensureLeadCompetitorsCacheAdmin,
  ensureLeadGmbCacheAdmin,
  readLeadPlacesFromData,
} from "@/lib/lead-places-enrichment";
import type { LeadPlacesRead } from "@/lib/lead-places-enrichment";
import { buildCompetitorRanking } from "@/lib/competitor-ranking";
import { localityTierLabelPt } from "@/lib/locality-tier";
import { splitWebsiteUriForSnapshot } from "@/lib/gmb-website-split";
import { countReportsSinceAdmin } from "@/lib/reports-admin";
import type { DiagnosticScore, RotaDigitalReport } from "@/types/report";
import type {
  AiRecommendedChannelsPolicy,
  AiScoringStrictness,
  AiServicesFocusPolicy,
} from "@/types/user-settings";
import {
  buildRecommendedChannelsPolicyPromptSection,
  sanitizeAiOpenRecommendedChannelCount,
} from "@/lib/ai-recommended-channels-prompt";
import { normalizeRecommendedChannels } from "@/lib/recommended-channels-normalize";
import { buildServicesFocusPromptSection } from "@/lib/ai-services-focus-prompt";
import { sanitizeAiRecommendedChannelIds } from "@/lib/ai-recommended-channel-options";
import {
  sanitizeAiCustomServiceLabels,
  sanitizeAiServiceOfferingIds,
} from "@/lib/ai-agency-services";
import {
  buildScoringStrictnessPromptSection,
  sanitizeAiScoringStrictness,
} from "@/lib/ai-scoring-strictness-prompt";
import { buildReportCopyVoicePromptSection } from "@/lib/report-copy-voice-prompt";
import {
  buildInstagramRequestHeaders,
  fetchInstagramPublicPage,
  hasInstagramAuthCookies,
  isInstagramLoginWallBio,
  isInstagramLoginWallHtml,
  sanitizeInstagramAssetUrl,
} from "@/lib/instagram-public-profile";
import { parseModelJson } from "@/lib/model-json-parse";
import {
  type GeminiInlineImagePart,
  downloadImageAsInlinePart,
} from "@/lib/gemini-inline-image";
import { maturityFromDiagnosticScores } from "@/lib/maturity-from-diagnostics";

export const runtime = "nodejs";
/** Vercel Pro: até 300s; 180s dá folga para evidências + Gemini + eventual reparo de JSON. */
export const maxDuration = 180;

/**
 * Uma chamada `generateContent` com prompt grande e imagens costuma levar bem mais que 20s.
 * Valor baixo provoca erro enganoso (“nenhum modelo disponível”) quando só houve timeout.
 * Manter folga em relação a `maxDuration` (coleta de evidências também consome tempo).
 */
const GEMINI_GENERATE_TIMEOUT_MS = 75_000;
const GEMINI_JSON_REPAIR_TIMEOUT_MS = 45_000;

async function withGeminiCallTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Tempo limite (${timeoutMs}ms) na chamada do Gemini.`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function newPublicSlug(): string {
  return randomBytes(12)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 14)
    .toLowerCase();
}

function sanitizeProposalHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function normalizeUrl(input?: string): string | undefined {
  if (!input?.trim()) return undefined;
  const value = input.trim();
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("@")) return `https://instagram.com/${value.slice(1)}`;
  if (value.includes("instagram.com")) {
    return value.startsWith("http") ? value : `https://${value}`;
  }
  return `https://${value}`;
}

const RESERVED_INSTAGRAM_PATHS = new Set([
  "accounts",
  "about",
  "explore",
  "developer",
  "reels",
  "reel",
  "stories",
  "p",
  "tv",
  "direct",
  "challenge",
]);

function extractInstagramHandle(input?: string): string | undefined {
  if (!input?.trim()) return undefined;
  const raw = input.trim();

  if (/^@?[a-zA-Z0-9._]{1,30}$/.test(raw)) {
    return raw.replace(/^@+/, "").toLowerCase();
  }

  const candidate = raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : raw.includes("instagram.com") || raw.includes("instagr.am")
      ? `https://${raw.replace(/^\/+/, "")}`
      : undefined;

  if (!candidate) return undefined;

  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "instagram.com" && host !== "instagr.am") return undefined;

    const segment = parsed.pathname
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)[0];

    if (!segment) return undefined;
    const handle = segment.replace(/^@+/, "").toLowerCase();
    if (!/^[a-z0-9._]{1,30}$/.test(handle)) return undefined;
    if (RESERVED_INSTAGRAM_PATHS.has(handle)) return undefined;
    return handle;
  } catch {
    return undefined;
  }
}

function normalizeInstagramUrl(input?: string): string | undefined {
  const handle = extractInstagramHandle(input);
  if (handle) return `https://www.instagram.com/${handle}/`;
  return normalizeUrl(input);
}

function isInstagramDomainUrl(input?: string): boolean {
  if (!input) return false;
  try {
    const parsed = new URL(input);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return host === "instagram.com" || host === "instagr.am";
  } catch {
    return false;
  }
}

type WebsiteEvidence = {
  url?: string;
  status?: number;
  title?: string;
  h1?: string;
  h2Count?: number;
  ctaCount?: number;
  testimonialSignals?: number;
  hasMetaDescription?: boolean;
  hasOgTags?: boolean;
  hasStructuredData?: boolean;
  detectedTimeline?: string;
  description?: string;
  isDirectoryListing?: boolean;
  isPlaceholder?: boolean;
  isAccessible?: boolean;
  /** HTML da coleta via fetch pode ser shell SPA/WordPress com pouco texto, enquanto a captura em navegador mostra a página pronta. */
  htmlTextualLikelyShell?: boolean;
};

type InstagramEvidence = {
  url?: string;
  status?: number;
  handle?: string;
  dataSource?: "playwright" | "api_internal" | "public_html" | "mirror" | "microlink" | "none";
  followers?: number;
  bio?: string;
  posts?: number;
  following?: number;
  hasLinkInBio?: boolean;
  bioLinkTitle?: string;
  bioLinkUrl?: string;
  bioLinkResolvedUrl?: string;
  profileImageUrl?: string;
  recentPostImageUrl?: string;
  recentPostImageUrls?: string[];
  accessLimited?: boolean;
  isAccessible?: boolean;
};

type PreparedEvidencePayload = {
  normalizedWebsiteUrl?: string;
  normalizedInstagramUrl?: string;
  websiteEvidence: WebsiteEvidence;
  instagramEvidence: InstagramEvidence;
  hasBrowserless: boolean;
  siteHeroSnapshotUrl?: string;
  instagramSnapshotUrl?: string;
  instagramBioLinkSnapshotUrl?: string;
  instagramProfileImageUrl?: string;
  logoImageUrl?: string;
  websiteCandidateUrls: Array<string | undefined>;
  instagramSnapshotCandidates: Array<string | undefined>;
  bioLinkCandidateUrls: Array<string | undefined>;
};

function buildVisualAnalysisUnavailableNote(kind: "website" | "instagram", snapshotAvailable: boolean): string {
  if (kind === "website") {
    return snapshotAvailable
      ? "A captura do site está disponível nas evidências do relatório, mas não foi enviada à IA nesta execução; use a imagem como apoio visual e considere reprocessar se quiser uma leitura multimodal completa."
      : "não foi possível analisar visualmente o website porque a captura real não ficou disponível.";
  }
  return snapshotAvailable
    ? "A captura do Instagram está disponível nas evidências do relatório, mas não foi enviada à IA nesta execução; use a imagem como apoio visual e considere reprocessar se quiser uma leitura multimodal completa."
    : "não foi possível analisar visualmente o Instagram porque a captura real não ficou disponível.";
}

type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
};

type ModelCostPer1M = {
  inputUsd: number;
  outputUsd: number;
};

/**
 * Tabela simplificada para estimativa de custo.
 * Os valores podem mudar no provedor; por isso salvamos como "estimado".
 */
const MODEL_COST_PER_1M_USD: Record<string, ModelCostPer1M> = {
  "gemini-2.5-flash": { inputUsd: 0.15, outputUsd: 0.6 },
  "gemini-2.0-flash": { inputUsd: 0.1, outputUsd: 0.4 },
  "gemini-2.0-flash-lite": { inputUsd: 0.075, outputUsd: 0.3 },
  "gemini-1.5-flash": { inputUsd: 0.15, outputUsd: 0.6 },
  "gemini-1.5-flash-latest": { inputUsd: 0.15, outputUsd: 0.6 },
  "gemini-2.5-pro": { inputUsd: 1.25, outputUsd: 5 },
  "gemini-1.5-pro": { inputUsd: 1.25, outputUsd: 5 },
};

const USD_TO_BRL_ESTIMATE = 5.2;

function estimateCostUsdFromUsage(modelName: string, usage?: GeminiUsageMetadata): number | undefined {
  if (!usage) return undefined;
  const pricing = MODEL_COST_PER_1M_USD[modelName];
  if (!pricing) return undefined;
  const promptTokens = Number(usage.promptTokenCount || 0);
  const outputTokens = Number(usage.candidatesTokenCount || 0);
  const estimated =
    (promptTokens / 1_000_000) * pricing.inputUsd +
    (outputTokens / 1_000_000) * pricing.outputUsd;
  return Number.isFinite(estimated) ? Number(estimated.toFixed(8)) : undefined;
}

async function fetchText(url: string): Promise<{ status: number; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (RotaDigitalBot/1.0)",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(
  url: string,
  headers?: Record<string, string>
): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (RotaDigitalBot/1.0)",
        ...(headers || {}),
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveFinalUrl(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (RotaDigitalBot/1.0)",
      },
      redirect: "follow",
      signal: ctrl.signal,
      cache: "no-store",
    });
    return res.url || url;
  } catch {
    return url;
  } finally {
    clearTimeout(timer);
  }
}

async function listGeminiGenerateContentModels(apiKey: string): Promise<string[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`,
      {
        method: "GET",
        signal: ctrl.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) return [];
    const payload = (await res.json()) as {
      models?: Array<{
        name?: string;
        supportedGenerationMethods?: string[];
      }>;
    };
    const available = (payload.models || [])
      .filter((model) =>
        Array.isArray(model.supportedGenerationMethods)
          ? model.supportedGenerationMethods.includes("generateContent")
          : false
      )
      .map((model) => (model.name || "").replace(/^models\//, "").trim())
      .filter(Boolean);

    if (!available.length) return [];

    const preferredOrder = [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-1.5-flash-latest",
    ];
    const preferred = preferredOrder.filter((name) => available.includes(name));
    const flashFamily = available.filter((name) => /flash/i.test(name) && !preferred.includes(name));
    const remaining = available.filter((name) => !preferred.includes(name) && !flashFamily.includes(name));
    return [...preferred, ...flashFamily, ...remaining].slice(0, 8);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function buildInstagramProfileSnapshotUrl(handle?: string): string | undefined {
  if (!handle) return undefined;
  return `/api/instagram-profile-snapshot?handle=${encodeURIComponent(handle)}`;
}

function buildWebsiteFullPageSnapshotUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return undefined;
    return `/api/website-fullpage-snapshot?url=${encodeURIComponent(parsed.toString())}`;
  } catch {
    return undefined;
  }
}

function buildImageProxyUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return undefined;
    return `/api/image-proxy?url=${encodeURIComponent(parsed.toString())}`;
  } catch {
    return undefined;
  }
}

function toAbsoluteUrl(origin: string, input?: string): string | undefined {
  if (!input) return undefined;
  try {
    const parsed = new URL(input);
    if (!/^https?:$/.test(parsed.protocol)) return undefined;
    return parsed.toString();
  } catch {
    try {
      return new URL(input, origin).toString();
    } catch {
      return undefined;
    }
  }
}

async function downloadFirstAvailableImagePart(
  origin: string,
  candidates: Array<string | undefined>
): Promise<{ part?: GeminiInlineImagePart; selectedUrl?: string }> {
  for (const candidate of candidates) {
    const absolute = toAbsoluteUrl(origin, candidate);
    if (!absolute) continue;
    const part = await downloadImageAsInlinePart(absolute);
    if (part) {
      return {
        part,
        selectedUrl: candidate,
      };
    }
  }
  return {};
}

function buildGenerateContentInput(
  prompt: string,
  options: {
    websiteImagePart?: GeminiInlineImagePart;
    instagramImagePart?: GeminiInlineImagePart;
    instagramBioLinkImagePart?: GeminiInlineImagePart;
  }
): string | Array<{ text: string } | GeminiInlineImagePart> {
  const parts: Array<{ text: string } | GeminiInlineImagePart> = [{ text: prompt }];
  if (options.websiteImagePart) {
    parts.push({
      text:
        "CAPTURA 1 (Website - página completa): use esta imagem como fonte principal para análise visual do site como um todo, incluindo estrutura da página, paleta, contraste, hierarquia, prova social e clareza de CTA. Se o texto do prompt disser que o HTML automático parece shell/carregamento, IGNORE isso para conclusões sobre o que o visitante vê: esta imagem reflete o navegador após renderização.",
    });
    parts.push(options.websiteImagePart);
  }
  if (options.instagramImagePart) {
    parts.push({
      text:
        "CAPTURA 2 (Instagram): esta é a captura real do perfil do Instagram. ANALISE DETALHADAMENTE esta imagem. Mesmo que haja um overlay escuro parcial, o conteúdo do perfil (foto, nome, bio, seguidores, posts do feed) geralmente está visível por trás. Extraia TODAS as informações legíveis: nome do perfil, bio, número de seguidores/posts/seguindo, link da bio, estética do feed, tipo de conteúdo dos posts. Use estas informações na análise. NÃO descarte esta captura como 'tela de login' se houver qualquer conteúdo de perfil visível.",
    });
    parts.push(options.instagramImagePart);
  }
  if (options.instagramBioLinkImagePart) {
    parts.push({
      text:
        "CAPTURA 3 (Destino do link da bio): esta imagem mostra a página aberta após clicar no link da bio do Instagram. Use para validar clareza do destino, coerência da mensagem, jornada e CTA da página de destino.",
    });
    parts.push(options.instagramBioLinkImagePart);
  }
  return parts.length > 1 ? parts : prompt;
}

function parseCompactNumber(value: string): number | undefined {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "").replace(",", ".");
  const suffix = normalized.slice(-1);
  const numericPart =
    suffix === "k" || suffix === "m" || suffix === "b"
      ? normalized.slice(0, -1)
      : normalized;
  const base = Number(numericPart.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(base)) return undefined;
  const multiplier =
    suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  return Math.round(base * multiplier);
}

function parseInstagramMetaCounts(text?: string): {
  posts?: number;
  followers?: number;
  following?: number;
} {
  if (!text) return {};
  const compact = text.replace(/\s+/g, " ");
  const posts = compact.match(/([\d.,kmb]+)\s*(?:posts?|publica(?:ç|c)[õo]es)/i)?.[1];
  const followers = compact.match(/([\d.,kmb]+)\s*seguidores?/i)?.[1];
  const following = compact.match(/([\d.,kmb]+)\s*seguindo/i)?.[1];
  return {
    posts: parseCompactNumber(posts || ""),
    followers: parseCompactNumber(followers || ""),
    following: parseCompactNumber(following || ""),
  };
}

function unwrapInstagramOutboundUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "l.instagram.com" || host.endsWith(".instagram.com")) {
      const direct = parsed.searchParams.get("u");
      if (direct) return decodeURIComponent(direct);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function extractTagText(html: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = html.match(regex);
  return match?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || undefined;
}

function extractMetaContent(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexes = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i"
    ),
  ];
  for (const regex of regexes) {
    const hit = html.match(regex)?.[1]?.trim();
    if (hit) return hit;
  }
  return undefined;
}

function toPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeResearchNotesText(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+Validação automática:\s*/gi, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Normaliza o corpo das notas de pesquisa: até 2 parágrafos (\\n\\n); excesso vira continuação do 2º. */
function normalizeAiResearchBody(text: unknown): string {
  if (typeof text !== "string") return "";
  const stripped = normalizeResearchNotesText(text)
    .replace(/^(website|site|instagram)\s*(?:\(.*?\))?\s*:\s*/i, "")
    .trim();
  if (!stripped) return "";
  const paragraphs = stripped
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return "";
  if (paragraphs.length <= 2) return paragraphs.join("\n\n");
  return `${paragraphs[0]}\n\n${paragraphs.slice(1).join(" ")}`.trim();
}

function buildScoredResearchNote(
  label: "Website" | "Instagram",
  scoreText: string,
  aiBody: unknown,
  fallbackBody: string
): string {
  const normalizedAi = normalizeAiResearchBody(aiBody);
  const usableAi = normalizedAi.length >= 80 ? normalizedAi : "";
  const body = usableAi || fallbackBody;
  return `${label} (nota ${scoreText}): ${body}`;
}

function sanitizeInstagramAiBody(text: unknown, evidence: InstagramEvidence): string {
  const normalized = normalizeAiResearchBody(text);
  if (!normalized) return "";

  const finalUrl = (evidence.bioLinkResolvedUrl || evidence.bioLinkUrl || "").toLowerCase();
  const goesToWhatsApp =
    finalUrl.includes("api.whatsapp.com") ||
    finalUrl.includes("wa.me/") ||
    finalUrl.includes("wa.link/");

  if (!goesToWhatsApp) return normalized;

  const misleadingPattern =
    /linktree|v[aá]rias op[cç][oõ]es|menu de links|m[uú]ltiplos links|v[aá]rios caminhos/i;

  const cleanup = (value: string) =>
    value
      .replace(/\bO\s+O\s+link\b/gi, "O link")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  if (!misleadingPattern.test(normalized)) {
    return cleanup(
      normalized.replace(
        /\bO?\s*link na bio[^.]*\./i,
        "O link da bio leva direto para o WhatsApp. "
      )
    );
  }

  return cleanup(
    normalized
    .replace(/o link(?:tree)?[^.]*\./gi, "")
    .replace(/menu de links[^.]*\./gi, "")
    .replace(/v[aá]rias op[cç][oõ]es[^.]*\./gi, "")
    .replace(/m[uú]ltiplos links[^.]*\./gi, "")
    .trim()
    .concat(" O link da bio leva direto para o WhatsApp.")
  );
}

function sanitizeInstagramBioExcerpt(raw?: string): string {
  if (!raw) return "";
  const cleaned = raw
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/gi, "&")
    .replace(/\r/g, "")
    .trim();
  if (!cleaned || isInstagramLoginWallBio(cleaned)) return "";
  if (
    /\bseguidores?\b/i.test(cleaned) &&
    /\bposts?\b/i.test(cleaned) &&
    /\bno instagram\b/i.test(cleaned)
  ) {
    const colonIndex = cleaned.indexOf(":");
    if (colonIndex >= 0) {
      return cleaned.slice(colonIndex + 1).replace(/^"+|"+$/g, "").trim();
    }
    return "";
  }
  return cleaned.replace(/^"+|"+$/g, "").trim();
}

function alignInstagramTextWithEvidence(text: string, evidence: InstagramEvidence): string {
  if (!text) return text;
  let result = text;
  const followers = typeof evidence.followers === "number" ? evidence.followers : undefined;
  const following = typeof evidence.following === "number" ? evidence.following : undefined;
  const posts = typeof evidence.posts === "number" ? evidence.posts : undefined;

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

  const finalLink = evidence.bioLinkResolvedUrl || evidence.bioLinkUrl;
  if (finalLink) {
    result = result
      .replace(/link na bio não foi verificado[^.]*\./gi, `O link da bio foi verificado e leva para ${finalLink}.`)
      .replace(/nenhum link na bio foi verificado[^.]*\./gi, `O link da bio foi verificado e leva para ${finalLink}.`)
      .replace(/não foi verificado para o destino final[^.]*\./gi, `O link da bio foi verificado e leva para ${finalLink}.`);
  }

  if ((posts ?? 0) > 0 || (followers ?? 0) > 0) {
    result = result
      .replace(/perfil[^.]*vazio[^.]*\./gi, "")
      .replace(/sem conteúdo ativo[^.]*\./gi, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return result;
}

async function resolveScreenshotUrl(
  targetUrl?: string,
  width = 1200,
  allowWordpressFallback = true,
  options?: {
    denyInstagram?: boolean;
    fullPage?: boolean;
  }
): Promise<string | undefined> {
  if (!targetUrl) return undefined;
  if (options?.denyInstagram && isInstagramDomainUrl(targetUrl)) return undefined;
  const encoded = encodeURIComponent(targetUrl);
  const fullPageParam = options?.fullPage ? "&fullPage=true" : "";
  const scrollToParam = options?.fullPage ? "&scrollTo=bottom" : "";
  const viewportParam = options?.fullPage
    ? "&viewport.width=1440&viewport.height=900&viewport.deviceScaleFactor=1"
    : "";
  const api = `https://api.microlink.io/?url=${encoded}&screenshot=true&meta=false&palette=false${fullPageParam}${scrollToParam}${viewportParam}`;
  const data = await fetchJson<{
    data?: { screenshot?: { url?: string } };
  }>(api);
  const shot = data?.data?.screenshot?.url;
  if (shot) return shot;
  if (!allowWordpressFallback) return undefined;
  return `https://s.wordpress.com/mshots/v1/${encoded}?w=${width}`;
}

/** Screenshot do site (Microlink → mShots). Para Instagram, usar `resolveInstagramVisual`. */

async function collectWebsiteEvidence(url?: string): Promise<WebsiteEvidence> {
  if (!url) return {};
  try {
    const { status, text } = await fetchText(url);
    const title = extractTagText(text, "title");
    const h1 = extractTagText(text, "h1");
    const description = extractMetaContent(text, "description");
    const lower = text.toLowerCase();
    const plain = toPlainText(text).toLowerCase();
    const isDirectoryListing =
      lower.includes("<title>index of") || lower.includes(">index of /<");
    const isPlaceholder =
      lower.includes("hello world") || lower.includes("coming soon") || lower.includes("under construction");
    const h2Count = (text.match(/<h2[\s>]/gi) || []).length;
    const ctaCount =
      (plain.match(/fale com|saiba mais|quero|entre em contato|acessar|agendar|inscreva/g) || []).length;
    const testimonialSignals =
      (plain.match(/depoimento|aluno|avalia|reputa|resultados?|case|flu[eê]ncia/g) || []).length;
    const hasMetaDescription = Boolean(description?.trim());
    const hasOgTags = /<meta[^>]+property=["']og:/i.test(text);
    const hasStructuredData = /application\/ld\+json/i.test(text);
    const detectedTimeline =
      plain.match(/\b(\d{1,2}\s*(?:a|-)\s*\d{1,2}\s*mes(?:es)?)\b/i)?.[1];

    const plainLen = plain.replace(/\s+/g, " ").trim().length;
    const headSnippet = `${(title || "").toLowerCase()} ${lower.slice(0, 4000)}`;
    const titleOrHeadLooksLoading =
      /carregando|loading\b|loader|aguarde|please\s*wait|wp\s*embed|one\s*moment/i.test(headSnippet);
    /** Só sinaliza conflito HTML vs navegador quando o fetch parece página de espera, não por ser WordPress em si. */
    const htmlTextualLikelyShell =
      titleOrHeadLooksLoading && !(h1 && h1.trim().length > 0) && plainLen < 800;

    return {
      url,
      status,
      title,
      h1,
      h2Count,
      ctaCount,
      testimonialSignals,
      hasMetaDescription,
      hasOgTags,
      hasStructuredData,
      detectedTimeline,
      description,
      isDirectoryListing,
      isPlaceholder,
      isAccessible: true,
      htmlTextualLikelyShell,
    };
  } catch {
    return { url, isAccessible: false };
  }
}

async function collectInstagramEvidence(url?: string): Promise<InstagramEvidence> {
  if (!url) {
    console.info("[IG_DEBUG][collectInstagramEvidence] URL de Instagram ausente.");
    return {};
  }
  try {
    const handle = extractInstagramHandle(url);
    if (!handle) {
      console.warn("[IG_DEBUG][collectInstagramEvidence] Handle inválido.", { url });
      return { url, isAccessible: false };
    }
    const phaseStart = Date.now();
    const BUDGET_MS = 18000;
    const hasTimeBudget = () => Date.now() - phaseStart < BUDGET_MS;
    console.info("[IG_DEBUG][collectInstagramEvidence] Iniciando coleta.", { url, handle });

    let bio: string | undefined;
    let followers: number | undefined;
    let following: number | undefined;
    let posts: number | undefined;
    let profileImageUrl: string | undefined;
    let recentPostImageUrl: string | undefined;
    let recentPostImageUrls: string[] | undefined;
    let hasLinkInBio = false;
    let bioLinkTitle: string | undefined;
    let bioLinkUrl: string | undefined;
    let bioLinkResolvedUrl: string | undefined;
    let dataSource: InstagramEvidence["dataSource"] = "none";

    // --- Estratégia 1: API interna do Instagram (funciona sem Playwright, prioridade em produção) ---
    const profileInfo = await fetchJson<{
      data?: {
        user?: {
          biography?: string;
          profile_pic_url_hd?: string;
          edge_followed_by?: { count?: number };
          edge_follow?: { count?: number };
          edge_owner_to_timeline_media?: {
            count?: number;
            edges?: Array<{ node?: { thumbnail_src?: string; display_url?: string } }>;
          };
          bio_links?: Array<{ title?: string; url?: string }>;
        };
      };
    }>(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`,
      buildInstagramRequestHeaders({
        "x-ig-app-id": "936619743392459",
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      })
    );
    const pu = profileInfo?.data?.user;
    if (pu) {
      const chooseCount = (current: number | undefined, incoming: number | undefined): number | undefined => {
        if (typeof incoming !== "number" || Number.isNaN(incoming)) return current;
        if (typeof current !== "number" || Number.isNaN(current)) return incoming;
        return Math.max(current, incoming);
      };
      bio = pu.biography?.trim() || bio;
      followers = chooseCount(followers, pu.edge_followed_by?.count);
      following = chooseCount(following, pu.edge_follow?.count);
      posts = chooseCount(posts, pu.edge_owner_to_timeline_media?.count);
      profileImageUrl = sanitizeInstagramAssetUrl(pu.profile_pic_url_hd);
      recentPostImageUrls =
        pu.edge_owner_to_timeline_media?.edges
          ?.map((edge) => edge?.node?.display_url || edge?.node?.thumbnail_src)
          .map((value) => sanitizeInstagramAssetUrl(value))
          .filter((value): value is string => Boolean(value))
          .slice(0, 3) || [];
      recentPostImageUrl =
        recentPostImageUrls?.[0] ||
        sanitizeInstagramAssetUrl(
          pu.edge_owner_to_timeline_media?.edges?.[0]?.node?.thumbnail_src ||
            pu.edge_owner_to_timeline_media?.edges?.[0]?.node?.display_url
        );
      const primaryBioLink = pu.bio_links?.find((l) => l?.url);
      hasLinkInBio = Boolean(primaryBioLink?.url);
      bioLinkTitle = primaryBioLink?.title?.trim() || undefined;
      bioLinkUrl = unwrapInstagramOutboundUrl(primaryBioLink?.url?.trim() || undefined);
      dataSource = "api_internal";
      console.info("[IG_DEBUG][collectInstagramEvidence] Estratégia 1 (API interna) OK.", {
        handle,
        hasBio: Boolean(bio),
        followers,
        posts,
        hasProfileImage: Boolean(profileImageUrl),
      });
    } else {
      console.warn("[IG_DEBUG][collectInstagramEvidence] Estratégia 1 sem usuário retornado.", {
        handle,
      });
    }

    // --- Estratégia 2: HTML da página oficial (JSON embutido / meta). ---
    const needsHtmlFallback =
      !bio || typeof followers !== "number" || typeof posts !== "number" || !profileImageUrl;
    if (needsHtmlFallback && hasTimeBudget()) {
      try {
        const { text } = await fetchInstagramPublicPage(url);
        if (isInstagramLoginWallHtml(text)) {
          console.warn(
            "[IG_DEBUG][collectInstagramEvidence] Instagram devolveu página de login, não perfil público.",
            { handle }
          );
        } else {
          const bioMatch = text.match(/"biography"\s*:\s*"([^"]{1,300})"/i);
          if (bioMatch) {
            const candidate = bioMatch[1].replace(/\\n/g, " ").trim();
            if (!isInstagramLoginWallBio(candidate)) bio = candidate;
          }
          if (typeof followers !== "number") {
            const fm = text.match(/"edge_followed_by"\s*:\s*\{"count"\s*:\s*(\d+)/i)
              || text.match(/"followers_count"\s*:\s*(\d+)/i);
            if (fm) followers = Number(fm[1]);
          }
          if (typeof posts !== "number") {
            const pm = text.match(/"edge_owner_to_timeline_media"\s*:\s*\{"count"\s*:\s*(\d+)/i);
            if (pm) posts = Number(pm[1]);
          }
          if (typeof following !== "number") {
            const fg = text.match(/"edge_follow"\s*:\s*\{"count"\s*:\s*(\d+)/i)
              || text.match(/"following_count"\s*:\s*(\d+)/i);
            if (fg) following = Number(fg[1]);
          }
          if (!profileImageUrl) {
            const pm = text.match(/"profile_pic_url_hd"\s*:\s*"([^"]+)"/i)
              || text.match(/"profile_pic_url"\s*:\s*"([^"]+)"/i);
            if (pm) {
              profileImageUrl = sanitizeInstagramAssetUrl(
                pm[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/")
              );
            }
          }
          if (!recentPostImageUrls?.length) {
            const urls = Array.from(
              text.matchAll(/"display_url"\s*:\s*"([^"]+)"/gi),
              (m) => m[1]
            )
              .map((item) =>
                sanitizeInstagramAssetUrl(item.replace(/\\u0026/g, "&").replace(/\\\//g, "/"))
              )
              .filter((value): value is string => Boolean(value))
              .slice(0, 3);
            if (urls.length) {
              recentPostImageUrls = urls;
              recentPostImageUrl = urls[0];
            }
          }

          const ogDescription = extractMetaContent(text, "og:description")
            || extractMetaContent(text, "description");
          if (ogDescription && !isInstagramLoginWallBio(ogDescription)) {
            const metaCounts = parseInstagramMetaCounts(ogDescription);
            if (typeof followers !== "number") followers = metaCounts.followers;
            if (typeof following !== "number") following = metaCounts.following;
            if (typeof posts !== "number") posts = metaCounts.posts;
          }

          if (!profileImageUrl) {
            profileImageUrl = sanitizeInstagramAssetUrl(
              extractMetaContent(text, "og:image") || undefined
            );
          }

          if (bio || typeof followers === "number" || typeof posts === "number") {
            dataSource = "public_html";
          }
        }
      } catch (error) {
        console.warn("[IG_DEBUG][collectInstagramEvidence] Estratégia 2 (HTML) falhou.", {
          handle,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // --- Estratégia 3: Espelhos públicos (não requerem login) ---
    const mirrors = [
      { name: "dumpor", url: `https://dumpor.io/v/${handle}/` },
      { name: "picuki", url: `https://www.picuki.com/profile/${handle}` },
      { name: "gramhir", url: `https://gramhir.com/profile/${handle}` },
    ];
    const needsMirrorFallback =
      !bio || typeof followers !== "number" || typeof posts !== "number";
    if (needsMirrorFallback && hasTimeBudget()) {
      for (const mirror of mirrors) {
        if (!hasTimeBudget()) break;
        try {
          const { text } = await fetchText(mirror.url);
          const lower = text.toLowerCase();
          if (lower.includes("not found") || lower.includes("page not found")) continue;

          if (!bio) {
            const bioPattern =
              mirror.name === "picuki"
                ? /<div[^>]*class="[^"]*profile-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i
                : mirror.name === "gramhir"
                  ? /<div[^>]*class="[^"]*biography[^"]*"[^>]*>([\s\S]*?)<\/div>/i
                  : /<div[^>]*class="[^"]*bio[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
            const bm = text.match(bioPattern);
            if (bm) {
              const cleaned = bm[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
              if (cleaned.length > 5 && !cleaned.toLowerCase().includes("login")) bio = cleaned;
            }
          }

          if (typeof followers !== "number") {
            const fm = text.match(/([\d.,]+)\s*(?:followers|seguidores)/i);
            if (fm) {
              const raw = fm[1].replace(/[.,]/g, "");
              const n = Number(raw);
              if (!isNaN(n)) followers = n;
            }
          }
          if (typeof posts !== "number") {
            const pm = text.match(/([\d.,]+)\s*(?:posts|publicações|publications)/i);
            if (pm) {
              const raw = pm[1].replace(/[.,]/g, "");
              const n = Number(raw);
              if (!isNaN(n)) posts = n;
            }
          }
          if (!profileImageUrl) {
            const imgMatch = text.match(/<img[^>]+src=["']([^"']+instagram[^"']+)[^>]*>/i)
              || text.match(/<img[^>]+src=["']([^"']+profile[^"']+)[^>]*>/i);
            if (imgMatch) profileImageUrl = sanitizeInstagramAssetUrl(imgMatch[1]);
          }

          if (bio || typeof followers === "number" || typeof posts === "number") {
            dataSource = "mirror";
            break;
          }
        } catch (error) {
          console.warn("[IG_DEBUG][collectInstagramEvidence] Estratégia 3 (mirror) falhou.", {
            handle,
            mirror: mirror.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // --- Estratégia 4: Microlink como scraper de metadados ---
    const needsMicrolinkFallback = !bio || !profileImageUrl;
    if (needsMicrolinkFallback && hasTimeBudget()) {
      try {
        const mlData = await fetchJson<{
          data?: { description?: string; image?: { url?: string } };
        }>(`https://api.microlink.io/?url=${encodeURIComponent(url)}&meta=true`);
        const desc = mlData?.data?.description;
        if (desc && desc.length > 10 && !isInstagramLoginWallBio(desc)) {
          bio = desc;
        }
        if (!profileImageUrl && mlData?.data?.image?.url) {
          profileImageUrl = sanitizeInstagramAssetUrl(mlData.data.image.url);
        }
        if (bio) {
          dataSource = "microlink";
        }
      } catch (error) {
        console.warn("[IG_DEBUG][collectInstagramEvidence] Estratégia 4 (Microlink) falhou.", {
          handle,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // --- Estratégia 5 (opcional): Playwright local — só roda fora de serverless ---
    const needsPlaywrightEnrichment =
      !bio || typeof followers !== "number" || typeof posts !== "number" || !profileImageUrl;
    if (needsPlaywrightEnrichment && hasTimeBudget()) {
      try {
        const { captureInstagramProfileViaPlaywright } = await import("@/lib/instagram-playwright");
        const playwrightCapture = await captureInstagramProfileViaPlaywright(handle);
        if (playwrightCapture?.profile) {
          bio = bio || playwrightCapture.profile.bio;
          followers = followers ?? playwrightCapture.profile.followers;
          following = following ?? playwrightCapture.profile.following;
          posts = posts ?? playwrightCapture.profile.posts;
          profileImageUrl = profileImageUrl || playwrightCapture.profile.profileImageUrl;
          bioLinkTitle = bioLinkTitle || playwrightCapture.profile.bioLinkTitle;
          bioLinkUrl = bioLinkUrl || unwrapInstagramOutboundUrl(playwrightCapture.profile.bioLinkUrl);
          hasLinkInBio = hasLinkInBio || Boolean(bioLinkUrl);
          if (dataSource === "none") dataSource = "playwright";
          console.info("[IG_DEBUG][collectInstagramEvidence] Estratégia 5 (Playwright) OK.", {
            handle,
            hasBio: Boolean(bio),
            followers,
          });
        }
      } catch (error) {
        console.warn("[IG_DEBUG][collectInstagramEvidence] Estratégia 5 (Playwright) ignorada.", {
          handle,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    bio = sanitizeInstagramBioExcerpt(bio);

    if (!hasLinkInBio && bio) {
      hasLinkInBio = /https?:\/\/|\.com|\.com\.br|whatsapp|wa\.me|linktr\.ee/i.test(bio);
    }

    if (bioLinkUrl) {
      bioLinkResolvedUrl = await resolveFinalUrl(bioLinkUrl);
      bioLinkResolvedUrl = unwrapInstagramOutboundUrl(bioLinkResolvedUrl);
    }

    if (bio && isInstagramLoginWallBio(bio)) {
      bio = undefined;
    }

    const hasCoreData = Boolean(typeof followers === "number" || typeof posts === "number" || bio);
    console.info("[IG_DEBUG][collectInstagramEvidence] Coleta finalizada.", {
      handle,
      hasCoreData,
      followers,
      following,
      posts,
      hasBio: Boolean(bio),
      hasProfileImage: Boolean(profileImageUrl),
      hasRecentPostImage: Boolean(recentPostImageUrl),
      accessLimited: !hasCoreData,
      dataSource,
      authCookiesConfigured: hasInstagramAuthCookies(),
    });

    return {
      url,
      status: 200,
      handle,
      dataSource,
      followers: typeof followers === "number" && !isNaN(followers) ? followers : undefined,
      following: typeof following === "number" && !isNaN(following) ? following : undefined,
      posts: typeof posts === "number" && !isNaN(posts) ? posts : undefined,
      bio: bio || undefined,
      hasLinkInBio,
      bioLinkTitle,
      bioLinkUrl,
      bioLinkResolvedUrl,
      profileImageUrl,
      recentPostImageUrl,
      recentPostImageUrls,
      accessLimited: !hasCoreData,
      isAccessible: true,
    };
  } catch (error) {
    console.error("[IG_DEBUG][collectInstagramEvidence] Erro inesperado na coleta.", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return { url, isAccessible: false };
  }
}

async function repairModelJsonWithGemini(
  genAI: GoogleGenerativeAI,
  rawText: string,
  candidateModels: string[],
  parseError?: unknown
): Promise<Record<string, unknown>> {
  const buildRepairPrompt = (hint: unknown): string => {
    const lines = [
      "Converta o conteúdo abaixo para um JSON VÁLIDO.",
      "Regras:",
      "- Preserve os mesmos campos e valores sempre que possível.",
      "- Escape aspas e quebras de linha dentro de strings conforme JSON (\\n, \\\").",
      "- Não adicione comentários.",
      "- Não adicione texto fora do JSON.",
      "- Retorne apenas um único objeto JSON válido.",
    ];
    if (hint instanceof Error && hint.message) {
      lines.push(
        "",
        "O parse anterior falhou com esta mensagem — corrija o JSON para eliminar o problema:",
        hint.message
      );
      const posMatch = hint.message.match(/position\s+(\d+)/i);
      if (posMatch) {
        const p = Number(posMatch[1]);
        if (Number.isFinite(p) && p >= 0 && rawText.length > 0) {
          const from = Math.max(0, p - 450);
          const to = Math.min(rawText.length, p + 450);
          lines.push("", "Trecho do texto original próximo ao erro:", rawText.slice(from, to));
        }
      }
    }
    lines.push("", rawText);
    return lines.join("\n");
  };

  let hint: unknown = parseError ?? null;
  let lastError: unknown = null;

  for (let round = 0; round < 2; round++) {
    const repairPrompt = buildRepairPrompt(hint);
    for (const modelName of candidateModels) {
      try {
        const repairModel = genAI.getGenerativeModel(
          {
            model: modelName,
          },
          { apiVersion: "v1" }
        );
        const repaired = await withGeminiCallTimeout(
          repairModel.generateContent(repairPrompt),
          GEMINI_JSON_REPAIR_TIMEOUT_MS
        );
        return parseModelJson(repaired.response.text());
      } catch (error) {
        lastError = error;
      }
    }
    hint = lastError;
  }

  throw new Error(
    `Falha ao reparar JSON com os modelos disponíveis. Último erro: ${
      lastError instanceof Error ? lastError.message : "desconhecido"
    }`
  );
}

async function prepareEvidencePayload(params: {
  normalizedWebsiteUrl?: string;
  normalizedInstagramUrl?: string;
}): Promise<PreparedEvidencePayload> {
  const { normalizedWebsiteUrl, normalizedInstagramUrl } = params;
  const [websiteEvidence, instagramEvidence] = await Promise.all([
    collectWebsiteEvidence(normalizedWebsiteUrl),
    collectInstagramEvidence(normalizedInstagramUrl),
  ]);
  console.info("[IG_DEBUG][generate-route] Evidências coletadas.", {
    websiteAccessible: websiteEvidence.isAccessible !== false,
    instagramAccessible: instagramEvidence.isAccessible !== false,
    instagramHandle: instagramEvidence.handle || null,
    instagramHasBio: Boolean(instagramEvidence.bio),
    instagramFollowers: instagramEvidence.followers ?? null,
    instagramPosts: instagramEvidence.posts ?? null,
    instagramHasProfileImage: Boolean(instagramEvidence.profileImageUrl),
    instagramHasRecentPost: Boolean(instagramEvidence.recentPostImageUrl),
  });

  const hasBrowserless = Boolean(process.env.BROWSERLESS_API_KEY?.trim());
  const internalWebsiteSnapshotUrl = buildWebsiteFullPageSnapshotUrl(normalizedWebsiteUrl);
  const internalInstagramSnapshotUrl = instagramEvidence.handle
    ? buildInstagramProfileSnapshotUrl(instagramEvidence.handle)
    : undefined;
  const instagramBioLinkTargetUrl =
    instagramEvidence.bioLinkResolvedUrl || instagramEvidence.bioLinkUrl;
  const internalInstagramBioLinkSnapshotUrl = buildWebsiteFullPageSnapshotUrl(
    instagramBioLinkTargetUrl
  );
  const proxiedInstagramProfileImageUrl = buildImageProxyUrl(instagramEvidence.profileImageUrl);
  const proxiedInstagramRecentPostUrls =
    (instagramEvidence.recentPostImageUrls || [])
      .map((url) => buildImageProxyUrl(url))
      .filter((value): value is string => Boolean(value));
  const proxiedInstagramRecentPostUrl =
    buildImageProxyUrl(instagramEvidence.recentPostImageUrl) || proxiedInstagramRecentPostUrls[0];
  const logoImageUrl = normalizedWebsiteUrl
    ? `https://www.google.com/s2/favicons?sz=256&domain_url=${encodeURIComponent(normalizedWebsiteUrl)}`
    : undefined;

  const [externalWebsiteSnapshotUrl, externalInstagramBioLinkSnapshotUrl] =
    await Promise.all([
      resolveScreenshotUrl(normalizedWebsiteUrl, 1400, true, {
        denyInstagram: true,
        fullPage: true,
      }),
      resolveScreenshotUrl(instagramBioLinkTargetUrl, 1400, true, {
        denyInstagram: true,
        fullPage: true,
      }),
    ]);
  const externalWebsiteSnapshotProxyUrl = buildImageProxyUrl(externalWebsiteSnapshotUrl);
  const externalInstagramBioLinkSnapshotProxyUrl = buildImageProxyUrl(
    externalInstagramBioLinkSnapshotUrl
  );

  let siteHeroSnapshotUrl = hasBrowserless
    ? internalWebsiteSnapshotUrl || externalWebsiteSnapshotProxyUrl || externalWebsiteSnapshotUrl
    : externalWebsiteSnapshotProxyUrl || externalWebsiteSnapshotUrl || internalWebsiteSnapshotUrl;
  const instagramSnapshotCandidates = [
    internalInstagramSnapshotUrl,
    proxiedInstagramRecentPostUrl,
    ...proxiedInstagramRecentPostUrls,
    proxiedInstagramProfileImageUrl,
  ];
  const instagramSnapshotUrl = instagramSnapshotCandidates.find(Boolean);
  if (siteHeroSnapshotUrl && siteHeroSnapshotUrl === instagramSnapshotUrl) {
    siteHeroSnapshotUrl = undefined;
  }
  const instagramBioLinkSnapshotUrl = hasBrowserless
    ? internalInstagramBioLinkSnapshotUrl ||
      externalInstagramBioLinkSnapshotProxyUrl ||
      externalInstagramBioLinkSnapshotUrl
    : externalInstagramBioLinkSnapshotProxyUrl ||
      externalInstagramBioLinkSnapshotUrl ||
      internalInstagramBioLinkSnapshotUrl;

  const websiteCandidateUrls = hasBrowserless
    ? [internalWebsiteSnapshotUrl, externalWebsiteSnapshotProxyUrl, externalWebsiteSnapshotUrl]
    : [externalWebsiteSnapshotProxyUrl, externalWebsiteSnapshotUrl, internalWebsiteSnapshotUrl];
  const bioLinkCandidateUrls = hasBrowserless
    ? [
        internalInstagramBioLinkSnapshotUrl,
        externalInstagramBioLinkSnapshotProxyUrl,
        externalInstagramBioLinkSnapshotUrl,
      ]
    : [
        externalInstagramBioLinkSnapshotProxyUrl,
        externalInstagramBioLinkSnapshotUrl,
        internalInstagramBioLinkSnapshotUrl,
      ];

  return {
    normalizedWebsiteUrl,
    normalizedInstagramUrl,
    websiteEvidence,
    instagramEvidence,
    hasBrowserless,
    siteHeroSnapshotUrl: siteHeroSnapshotUrl || undefined,
    instagramSnapshotUrl: instagramSnapshotUrl || undefined,
    instagramBioLinkSnapshotUrl: instagramBioLinkSnapshotUrl || undefined,
    instagramProfileImageUrl: proxiedInstagramProfileImageUrl || undefined,
    logoImageUrl,
    websiteCandidateUrls,
    instagramSnapshotCandidates,
    bioLinkCandidateUrls,
  };
}

function buildWebsiteResearchNote(e: WebsiteEvidence): string {
  if (e.isAccessible === false) {
    return `não foi possível acessar a home durante a coleta automática.`;
  }
  if (e.isDirectoryListing) {
    return `o domínio abre uma listagem de diretórios (Index of), sem página institucional válida.`;
  }
  if (e.isPlaceholder) {
    return `a home aparenta ser placeholder ou temporária, com baixa maturidade de comunicação.`;
  }
  const seoParts = [
    e.hasMetaDescription ? "meta description presente" : "meta description ausente",
    e.hasOgTags ? "tags Open Graph presentes" : "Open Graph ausente",
    e.hasStructuredData ? "dados estruturados presentes" : "sem dados estruturados detectados",
  ];
  return `a home foi analisada com foco em posicionamento, comunicação e conversão. Título "${
    e.title || "não encontrado"
  }"${e.h1 ? ` e H1 "${e.h1}"` : ""}. SEO técnico: ${seoParts.join(
    ", "
  )}. Estrutura: ${e.h2Count ?? 0} subtítulos H2, ${
    e.ctaCount ?? 0
  } sinais de CTA e ${e.testimonialSignals ?? 0} sinais de prova social/depoimentos.`;
}

function buildInstagramResearchNote(
  e: InstagramEvidence
): string {
  if (e.isAccessible === false) {
    return `não foi possível abrir o perfil durante a coleta automática.`;
  }
  const hasCoreData =
    typeof e.followers === "number" ||
    typeof e.posts === "number" ||
    typeof e.following === "number" ||
    Boolean(e.bio);

  if (e.accessLimited && !hasCoreData) {
    return `certifique-se de que está logado no Instagram, para que o sistema consiga acessar o perfil e validar métricas públicas com mais precisão.`;
  }
  const handle = e.handle ? `@${e.handle}` : "identificado";
  const bioSentence = e.bio
    ? "Tem uma bio clara sobre posicionamento e público."
    : "A bio não foi coletada automaticamente.";
  const finalUrl = (e.bioLinkResolvedUrl || e.bioLinkUrl || "").toLowerCase();
  const linkText =
    finalUrl.includes("api.whatsapp.com") ||
    finalUrl.includes("wa.me/") ||
    finalUrl.includes("wa.link/")
      ? "O link da bio leva direto para o WhatsApp."
      : e.bioLinkResolvedUrl
        ? `O link da bio leva para ${e.bioLinkResolvedUrl}.`
        : e.bioLinkUrl
          ? `O link da bio aponta para ${e.bioLinkUrl}.`
          : "Nenhum link na bio foi verificado.";
  return `O perfil ${handle} ${bioSentence} ${linkText}`.replace(/\s+/g, " ").trim();
}

function buildTechnicalImprovementHints(e: WebsiteEvidence): string[] {
  const hints: string[] = [];
  if (!e.h1) hints.push("definir um H1 claro na home");
  if (!e.hasMetaDescription) hints.push("escrever uma meta description mais forte");
  if (!e.hasStructuredData) hints.push("adicionar dados estruturados básicos");
  if ((e.ctaCount ?? 0) < 3) hints.push("reforçar os CTAs nas áreas principais");
  if ((e.testimonialSignals ?? 0) < 3) hints.push("dar mais destaque para provas sociais e depoimentos");
  return hints;
}

function buildDiagnosticImprovementText(
  topic: string,
  websiteEvidence: WebsiteEvidence,
  instagramEvidence: InstagramEvidence
): string {
  const lower = topic.toLowerCase();
  const technicalHints = buildTechnicalImprovementHints(websiteEvidence);
  const finalLink = (instagramEvidence.bioLinkResolvedUrl || instagramEvidence.bioLinkUrl || "").toLowerCase();
  const hasWhatsappLink =
    finalLink.includes("api.whatsapp.com") ||
    finalLink.includes("wa.me/") ||
    finalLink.includes("wa.link/");

  if (lower.includes("identidade visual")) {
    return "Para 10/10: hierarquia, contraste, respiro e coerência visual entre site e Instagram.";
  }
  if (lower.includes("presença")) {
    const hintStr = technicalHints.slice(0, 2).join(", ");
    const websitePart = hintStr ? `Site: ${hintStr}.` : "Site: CTAs, SEO básico e prova social.";
    const funnelPart = hasWhatsappLink
      ? " Ligar Instagram → site → WhatsApp na jornada."
      : " Ligar Instagram e site na jornada.";
    return `Para 10/10: ${websitePart}${funnelPart}`.replace(/\s+/g, " ").trim();
  }
  if (lower.includes("funil") || lower.includes("cta")) {
    return hasWhatsappLink
      ? "Para 10/10: CTAs mais claros, menos fricção até o WhatsApp e expectativa pós-clique explícita."
      : "Para 10/10: CTAs mais claros, visíveis e ligados à próxima etapa de conversão.";
  }
  if (lower.includes("clareza da proposta")) {
    return "Para 10/10: benefício e diferencial no primeiro bloco, com CTA no mesmo fluxo visual.";
  }
  if (lower.includes("consist")) {
    return "Para 10/10: alinhar tom, promessa e destaques entre site e Instagram.";
  }
  if (lower.includes("posicionamento")) {
    return "Para 10/10: diferencial explícito nos pontos nobres e promessa ligada à oferta.";
  }
  return "Para 10/10: evidenciar o que funciona, corrigir atritos e traduzir em ação no site e no Instagram.";
}

/** Teto alinhado ao prompt: 2 parágrafos objetivos e diretos. */
const DIAGNOSTIC_COMMENT_MAX_CHARS = 420;

/**
 * Encurta até `maxLen` preferindo cortar no fim da última frase completa (`.!?` + espaço ou fim).
 * Sem reticências artificiais; se não houver frase completa, corta no limite de palavra.
 */
function fitTextToMaxCharsPreferSentenceEnd(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  const w = t.slice(0, maxLen);
  const floor = Math.min(36, Math.max(20, Math.floor(maxLen * 0.32)));
  for (let i = w.length - 1; i >= floor; i--) {
    const ch = w[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    const next = i + 1 < w.length ? w[i + 1] : "";
    if (next === "" || /\s/.test(next)) {
      return w.slice(0, i + 1).trim();
    }
  }
  return w.replace(/\s+\S*$/, "").trim();
}

/** Normaliza comentário do modelo (remove reticências soltas no fim). */
function normalizeDiagnosticCommentRaw(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]*\u2026[ \t]*$/g, "")
    .replace(/[ \t]*\.{3,}[ \t]*$/g, "")
    .trim();
}

/** Garante teto de caracteres mantendo 2 parágrafos quando possível, sem `…` forçado. */
function clampDiagnosticComment(raw: string, maxChars: number): string {
  let s = normalizeDiagnosticCommentRaw(raw);
  if (s.length <= maxChars) return s;
  const paras = s
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (paras.length >= 2) {
    const first = paras[0]!;
    let second = paras.slice(1).join(" ");
    const sep = "\n\n";
    const maxSecond = maxChars - first.length - sep.length;
    if (maxSecond >= 28) {
      if (second.length > maxSecond) {
        second = fitTextToMaxCharsPreferSentenceEnd(second, maxSecond);
      }
      const out = `${first}${sep}${second}`;
      if (out.length <= maxChars) return out;
    }
  }
  const single = s.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  if (single.length <= maxChars) return single;
  return fitTextToMaxCharsPreferSentenceEnd(single, maxChars);
}

function ensureDiagnosticCommentActionability(
  item: DiagnosticScore,
  websiteEvidence: WebsiteEvidence,
  instagramEvidence: InstagramEvidence
): DiagnosticScore {
  if (item.score >= 10) return item;
  const comment = String(item.comment || "").trim();
  const improvement = buildDiagnosticImprovementText(
    item.topic,
    websiteEvidence,
    instagramEvidence
  );

  if (!comment) {
    return { ...item, comment: clampDiagnosticComment(improvement, DIAGNOSTIC_COMMENT_MAX_CHARS) };
  }

  if (/para chegar a 10\/10|para 10\/10|para ficar 10\/10|para melhorar|o que falta|vale ajustar|precisa/i.test(comment)) {
    return { ...item, comment: clampDiagnosticComment(comment, DIAGNOSTIC_COMMENT_MAX_CHARS) };
  }

  return {
    ...item,
    comment: clampDiagnosticComment(`${comment} ${improvement}`.trim(), DIAGNOSTIC_COMMENT_MAX_CHARS),
  };
}

function mapGmbBusinessStatusPt(status: string | undefined, openNow: boolean | undefined): string {
  if (!status?.trim()) return "Desconhecido";
  const u = status.toUpperCase();
  if (u.includes("CLOSED_TEMPORARILY")) return "Temporariamente fechado";
  if (u.includes("CLOSED_PERMANENTLY")) return "Encerrado permanentemente";
  if (u.includes("OPERATIONAL")) {
    if (openNow === true) return "Em operação — aberto agora";
    if (openNow === false) return "Em operação — fechado no momento";
    return "Em operação";
  }
  return status;
}

function buildPlacesContextPromptBlock(args: {
  places: LeadPlacesRead;
  features: PlanFeatures;
  company: string;
  leadWebsiteUrl?: string;
  leadInstagramUrl?: string;
}): string {
  if (!args.features.gmbAnalysis) return "";
  const p = args.places;
  const hasListing = p.gmbHasListing === true;
  const listingLine = hasListing ? "sim" : p.gmbHasListing === false ? "não" : "desconhecido";
  const ratingLine =
    typeof p.gmbRating === "number" ? `${p.gmbRating.toFixed(1)} estrelas` : "não disponível";
  const reviewsLine = typeof p.gmbReviewCount === "number" ? String(p.gmbReviewCount) : "não disponível";
  const statusLine = mapGmbBusinessStatusPt(p.gmbBusinessStatus, p.gmbOpenNow);
  const photosLine = typeof p.gmbPhotoCount === "number" ? `${p.gmbPhotoCount} fotos` : "não disponível";
  const nicheLine = p.gmbPrimaryTypeDisplay?.trim() || p.gmbPrimaryType?.trim() || "não identificado";
  const locationLine = [p.gmbSubLocality, p.gmbCity, p.gmbRegion]
    .filter((v): v is string => Boolean(v?.trim()))
    .join(", ") || "não identificada";

  let competitorsSection = "";
  if (args.features.competitorAnalysis && Array.isArray(p.competitors) && p.competitors.length > 0) {
    const ranking = buildCompetitorRanking({
      leadName: args.company,
      leadRating: p.gmbRating,
      leadReviewCount: p.gmbReviewCount,
      leadFormattedAddress: p.gmbFormattedAddress,
      leadCity: p.gmbCity,
      leadSubLocality: p.gmbSubLocality,
      leadWebsiteUrl: args.leadWebsiteUrl,
      leadInstagramUrl: args.leadInstagramUrl,
      competitors: p.competitors,
    });
    const leadRow = ranking.find((r) => r.isLead);
    const leadRankLine = leadRow
      ? `Posição atual deste lead no ranking local (ordenado por total de avaliações, depois por nota média): **${leadRow.position}º** de ${ranking.length}.`
      : "Posição do lead no ranking: não disponível.";
    const lines = ranking.map((r) => {
      const site = r.hasWebsite ? "sim" : "não";
      const rating = typeof r.rating === "number" ? r.rating.toFixed(1) : "—";
      const reviews = typeof r.reviewCount === "number" ? String(r.reviewCount) : "—";
      const tag = r.isLead ? " (ESTE LEAD)" : "";
      const loc =
        r.localityTier === 0 || r.localityTier === 1 || r.localityTier === 2
          ? `, local: ${localityTierLabelPt(r.localityTier)}`
          : "";
      return `${r.position}º. ${r.name}${tag} — ${rating} estrelas, ${reviews} avaliações, site: ${site}${loc}`;
    });
    competitorsSection = `## Ranking local (lead + concorrentes na mesma região/nicho)\n${lines.join("\n")}\n${leadRankLine}\n`;
  } else if (args.features.competitorAnalysis) {
    competitorsSection =
      "## Ranking local (lead + concorrentes na mesma região/nicho)\n(dados não disponíveis nesta execução — não invente concorrentes nem posições)\n";
  }

  return `## Dados do Google Meu Negócio
- Tem perfil GMB: ${listingLine}
- Nicho (tipo primário Google): ${nicheLine}
- Localização (bairro/cidade/UF): ${locationLine}
- Nota média: ${ratingLine}
- Total de avaliações: ${reviewsLine}
- Status: ${statusLine}
- Fotos no GMB: ${photosLine}

${competitorsSection}
Com base nesses dados (e somente quando estiverem listados acima), inclua na Rota Digital para "${args.company}":
- Uma análise do perfil GMB do lead (pontos fracos e o que melhorar)
- Um comparativo direto com os concorrentes explicitando a **posição do lead no ranking** e a diferença para os líderes (nota, avaliações, presença de site)
- Ações específicas, priorizadas para fechar o gap até as primeiras posições do ranking local
Se algum dado acima estiver "não disponível" ou ausente, não invente números, nomes ou posições de concorrentes.`;
}

function buildPrompt(body: {
  name: string;
  email?: string;
  phone?: string;
  company: string;
  status: string;
  notes?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  servicesOffered?: string;
  objective?: string;
  aiBasePromptGuidelines?: string;
  aiRecommendedChannelsPolicy?: AiRecommendedChannelsPolicy;
  aiRecommendedChannelIds?: string[];
  aiOpenRecommendedChannelCount?: number;
  aiServicesFocusPolicy?: AiServicesFocusPolicy;
  aiServiceOfferingIds?: string[];
  aiCustomServiceLabels?: string[];
  aiScoringStrictness?: AiScoringStrictness;
  websiteEvidence?: WebsiteEvidence;
  instagramEvidence?: InstagramEvidence;
  /** Imagem realmente enviada ao modelo (download para Gemini). */
  hasWebsiteScreenshot?: boolean;
  hasInstagramScreenshot?: boolean;
  hasInstagramBioLinkScreenshot?: boolean;
  /** URL de snapshot gerada para o relatório (o cliente pode ver a imagem mesmo se o download para a IA falhou). */
  instagramSnapshotForReport?: boolean;
  websiteSnapshotForReport?: boolean;
  /** Bloco opcional Google Meu Negócio / concorrentes (Places). */
  placesBlock?: string;
}): string {
  const siteEvidence = body.websiteEvidence;
  const instaEvidence = body.instagramEvidence;
  const servicesText = body.servicesOffered?.trim();
  const objectiveText = body.objective?.trim();
  const servicesLine = servicesText
    ? servicesText
    : "Não informado pelo usuário — INFERIR segmento e serviços com base no site, Instagram, bio e pesquisa na web. No relatório, deixe claro quando for inferência (não apresente como fato confirmado pelo cliente).";
  const objectiveLine = objectiveText
    ? objectiveText
    : "Não informado pelo usuário — INFERIR objetivos plausíveis e gargalos a partir da análise. No relatório, deixe claro quando for hipótese sugerida pela IA.";
  const aiGuidelines = (body.aiBasePromptGuidelines || "").trim();
  const aiGuidelinesBlock = aiGuidelines
    ? `\n**Diretrizes personalizadas da conta (aplicar sempre)**\n${aiGuidelines}\n`
    : "";
  let channelPolicy: AiRecommendedChannelsPolicy =
    body.aiRecommendedChannelsPolicy === "restricted" ? "restricted" : "open";
  const channelIds = sanitizeAiRecommendedChannelIds(body.aiRecommendedChannelIds);
  if (channelPolicy === "restricted" && channelIds.length === 0) {
    channelPolicy = "open";
  }
  const openChannelCount = sanitizeAiOpenRecommendedChannelCount(body.aiOpenRecommendedChannelCount);
  const channelsPolicyBlock = `\n${buildRecommendedChannelsPolicyPromptSection(
    channelPolicy,
    channelIds,
    openChannelCount,
  )}\n`;

  let servicesPolicy: AiServicesFocusPolicy =
    body.aiServicesFocusPolicy === "restricted" ? "restricted" : "open";
  const serviceOfferingIds = sanitizeAiServiceOfferingIds(body.aiServiceOfferingIds);
  const customServiceLabels = sanitizeAiCustomServiceLabels(body.aiCustomServiceLabels);
  if (servicesPolicy === "restricted" && serviceOfferingIds.length === 0 && customServiceLabels.length === 0) {
    servicesPolicy = "open";
  }
  const servicesFocusBlock = `\n${buildServicesFocusPromptSection(servicesPolicy, serviceOfferingIds, customServiceLabels)}\n`;
  const scoringStrictness = sanitizeAiScoringStrictness(body.aiScoringStrictness);
  const scoringStrictnessBlock = `\n${buildScoringStrictnessPromptSection(scoringStrictness)}\n`;

  return `Você é um estrategista de marketing digital senior. Faça análise profunda com foco comercial.
Use pesquisa na web quando necessário para enriquecer a análise (site da empresa, instagram e contexto competitivo).
${aiGuidelinesBlock}${channelsPolicyBlock}${servicesFocusBlock}${scoringStrictnessBlock}
**Dados do lead**
- Nome: ${body.name}
- Empresa: ${body.company}
- E-mail: ${body.email || "Não informado"}
- Telefone: ${body.phone || "Não informado"}
- Status: ${body.status}
- Site: ${body.websiteUrl || "Não informado"}
- Instagram / redes: ${body.instagramUrl || "Não informado"}
- Serviços oferecidos: ${servicesLine}
- Objetivo: ${objectiveLine}

**Evidências coletadas automaticamente (fonte prioritária)**
- Imagem do website enviada ao modelo (visão IA nesta execução): ${
    body.hasWebsiteScreenshot ? "sim" : "não"
  }
- Snapshot do site disponível no relatório (URL de captura gerada): ${
    body.websiteSnapshotForReport ? "sim" : "não"
  }
- Imagem do Instagram enviada ao modelo (visão IA nesta execução): ${
    body.hasInstagramScreenshot ? "sim" : "não"
  }
- Snapshot do perfil Instagram disponível no relatório (URL de captura gerada): ${
    body.instagramSnapshotForReport ? "sim" : "não"
  }
- Captura visual do destino do link da bio (enviada ao modelo): ${
    body.hasInstagramBioLinkScreenshot ? "disponível" : "não disponível"
  }
- Website status: ${siteEvidence?.status ?? "não verificado"}
- Website título: ${siteEvidence?.title || "não encontrado"}
- Website H1: ${siteEvidence?.h1 || "não encontrado"}
- Website diretório/listagem: ${siteEvidence?.isDirectoryListing ? "sim" : "não"}
- Website placeholder: ${siteEvidence?.isPlaceholder ? "sim" : "não"}
- HTML automático (fetch) parece shell/carregamento ou documento WordPress muito “magro”: ${
    siteEvidence?.htmlTextualLikelyShell ? "sim" : "não"
  } (quando "sim", o título/H1 desta lista podem não refletir o que o navegador renderiza; priorize CAPTURA 1 e/ou snapshot do relatório se estiverem disponíveis)
- Instagram status: ${instaEvidence?.status ?? "não verificado"}
- Instagram handle: ${instaEvidence?.handle || "não verificado"}
- Instagram seguidores: ${
    typeof instaEvidence?.followers === "number"
      ? instaEvidence.followers
      : "não verificado"
  }
- Instagram bio: ${instaEvidence?.bio || "não verificada"}
- Instagram link na bio (texto): ${instaEvidence?.bioLinkTitle || "não verificado"}
- Instagram link na bio (URL original): ${instaEvidence?.bioLinkUrl || "não verificado"}
- Instagram link na bio (destino final verificado): ${
    instaEvidence?.bioLinkResolvedUrl || "não verificado"
  }
${body.placesBlock?.trim() ? `\n${body.placesBlock.trim()}\n` : ""}
**Tarefas**
${buildReportCopyVoicePromptSection()}
0) Escreva em linguagem simples, direta e humana. Frases curtas. Evite linguagem formal/corporativa exagerada. Siga o bloco **Voz do relatório** acima em todos os campos de texto do JSON (e no HTML da proposta).
0.0) Não use markdown no texto (sem **negrito**, sem listas com *), apenas texto limpo.
0.1) Se serviços ou objetivo não vierem preenchidos pelo usuário, deduza com base nas evidências (site, Instagram, pesquisa). Em "companyProfile", indique brevemente o que foi inferido versus o que foi observado diretamente. Não use o "executiveSummary" para listar inferências longas — ele deve ser curto (veja regra de "executiveSummary" abaixo).
0.2) Escreva como alguém explicando com clareza para um cliente comum — tom profissional acolhedor, sem jargão nem “voz de agência”.
0.3) Evite tom excessivamente analítico, professoral ou "consultoria engessada". Não use frases infladas como "presença digital robusta", "sinergia entre canais", "alavancar resultados", "ecossistema digital" ou parecidas.
0.4) Prefira frases concretas, como: "o perfil passa confiança", "a proposta está clara", "faltam provas visuais", "o CTA pode ficar mais forte".
0.5) Não repita a mesma ideia em campos diferentes. Cada campo deve acrescentar algo novo.
1) Analise alinhamento entre posicionamento atual e o objetivo (informado ou inferido).
1.1) Se o site estiver vazio, quebrado, em placeholder (ex.: "hello world") ou sem conteúdo útil, deixe isso explícito e reduza as notas relacionadas a website.
1.2) Se o Instagram estiver vazio/sem consistência, deixe explícito e ajuste as notas.
1.3) Em "websiteResearchNote" e "instagramResearchNote": **exatamente 2 parágrafos curtos cada**, separados por \\n\\n no JSON. Meta **total ~520–780 caracteres** por campo (soma dos dois): parágrafo 1 = fatos verificáveis e leitura do cenário; parágrafo 2 = conclusão prática. **Proibido** terceiro parágrafo ou texto corrido sem quebra. Seja objetivo — sem enrolação.
1.4) Em "instagramResearchNote": sintetize a ideia da bio (ex.: "a bio deixa claro que…"). PROIBIDO transcrever a bio entre aspas ou colar emojis. NÃO comece citando seguidores, posts ou outras métricas (essas já aparecem nas evidências). Fale de posicionamento, clareza, consistência visual, destaques, link na bio e CTA quando fizer sentido com o que foi verificado.
1.5) Ao comentar o link da bio, use o "destino final verificado". Se ele levar direto para WhatsApp, diga isso claramente. Não invente Linktree, menu com várias opções ou múltiplos destinos se isso não estiver verificado.
1.6) Descreva paleta, estética do feed e detalhes visuais finos **apenas** quando "Imagem do Instagram enviada ao modelo" = "sim" (ou equivalente para o website). Se só existir snapshot no relatório sem imagem na IA, não invente o visual — remeta à imagem nas evidências.
1.7) Só diga "não foi possível analisar visualmente o website" se **ambos** estiverem "não": "Imagem do website enviada ao modelo" e "Snapshot do site disponível no relatório". Se o snapshot existir no relatório mas a imagem não tiver sido enviada ao modelo, não negue a existência da captura — diga que a imagem aparece nas evidências e que a análise automática por texto pode estar incompleta.
1.8) Só diga "não foi possível analisar visualmente o Instagram" se **ambos** estiverem "não": "Imagem do Instagram enviada ao modelo" e "Snapshot do perfil Instagram disponível no relatório". Se o snapshot existir no relatório mas a imagem não tiver sido enviada ao modelo nesta execução, **não** escreva que o perfil não foi acessado: a captura existe para o leitor; explique que bio/métricas em texto podem não ter vindo da API e que vale olhar a imagem nas evidências.
1.9) Quando houver captura do Instagram (CAPTURA 2), ANALISE A IMAGEM CUIDADOSAMENTE mesmo que ela tenha fundo escuro ou overlay parcial. O perfil do Instagram pode estar visível por trás de um overlay leve. Se conseguir ler qualquer informação (nome do perfil, bio, número de seguidores, posts, avatar, thumbnails do feed), USE essas informações na análise. A CAPTURA 2 é a fonte prioritária.
1.10) Tente extrair da captura: nome do perfil, quantidade de posts, seguidores, seguindo, texto da bio, link visível na bio, avatar/foto de perfil, estética/cores do feed, tipo de conteúdo visível nos posts.
1.11) Se algum desses itens específicos não estiver legível na captura, escreva "não legível na captura" apenas para aquele item — não descarte a análise inteira por causa de um overlay parcial.
1.12) Quando "Imagem do Instagram enviada ao modelo" = "sim", priorize a CAPTURA 2. Quando for "não" mas o snapshot existir no relatório, siga a regra 1.8 (não negue a captura). Só diga "não foi possível analisar visualmente" se **ambos** forem "não" (imagem na IA e snapshot no relatório), ou se a imagem enviada à IA estiver totalmente ilegível (sem conteúdo).
1.13) NUNCA diga que a captura mostra "tela de login" se houver conteúdo de perfil visível (foto, bio, posts). Um overlay de login por cima de conteúdo de perfil NÃO invalida a análise — extraia o que for possível.
1.14) Quando a "Captura visual do destino do link da bio" estiver disponível (CAPTURA 3), use essa imagem para avaliar a experiência pós-clique: clareza da proposta, consistência com o Instagram, facilidade de uso e convites para contato na página de destino.
1.15) Se "Imagem do website enviada ao modelo" = "sim" **ou** "Snapshot do site disponível no relatório" = "sim", é **proibido** concluir que o site estava "inacessível", "somente tela de carregamento do WordPress" ou "impossível avaliar conteúdo/UX" **só** por causa do HTML/título/H1 da coleta automática (incluindo quando a linha "HTML automático… shell/carregamento" = "sim"). Nesse caso, descreva o que a CAPTURA 1 (ou a captura nas evidências) mostra e avalie estrutura, mensagem e conversão com base nisso.
1.16) A política de canais da agência (lista restrita) define **apenas** quais nomes entram em "recommendedChannels" e o foco comercial — **não** significa ignorar o site do lead, a CAPTURA 1 nem as notas de website quando o URL existir e houver captura.
2) Avalie pontos com nota 0-10: posicionamento, identidade visual, clareza da proposta, consistência da comunicação, funil/CTA, presença digital geral.
2.1) Em cada item de "diagnosticScores" com nota < 10, diga com critérios concretos o que falta evoluir (sem frases vazias). A orientação para a nota máxima entra **uma única vez** no comentário — ver regra de "diagnosticScores.comment" abaixo. **Densidade:** comentários curtos, mas cada frase deve carregar dado verificável ou uma ação clara — nada de enrolação nem parágrafos longos só para “parecer análise”.
2.2) Nunca use frases vagas como "há espaço para melhorar" ou "há espaço para otimizações técnicas" sem explicar exatamente o que deve ser ajustado.
2.3) Em "Identidade Visual", analise harmonia visual, paleta, contraste, hierarquia, espaçamento, alinhamento, legibilidade e coerência entre site e Instagram.
3) Faça comentários práticos e acionáveis.
4) Em "proposalPageHtml", gere HTML5 completo e elegante (CSS no <style>), em português, voltado ao cliente final (${body.company}), com proposta comercial convincente, próximos passos claros e convite claro para fechar (contato ou próximo passo). Não inclua <script>.
4.1) No texto visível de "proposalPageHtml" (títulos, parágrafos, botões), aplique a **Voz do relatório**: linguagem natural, sem siglas nem jargão de agência.

**Tom obrigatório por campo**
- "executiveSummary": **exatamente 2 parágrafos curtos**, separados por \\n\\n (proibido terceiro parágrafo). **Meta: no máximo ~520 caracteres no total** (soma dos dois): 1º = leitura objetiva do que a empresa já mostra no digital; 2º = por que o **resultado global** (síntese das notas dos tópicos) faz sentido, **sem** listar cada tópico nem repetir números que já vêm no JSON. Frases curtas. **Não** repita listas de canais, forças ou tópicos do diagnóstico — isso vai em outros campos.
- **Coerência de maturidade:** quando houver pelo menos um item em "diagnosticScores", faça "digitalMaturityScore" **numericamente igual** à média aritmética dos "score" desses itens (uma casa decimal) e "digitalMaturityLevel" coerente: **<4** Iniciante; **≥4 e <7** Intermediário; **≥7** Avançado. Cada nota de tópico deve obedecer à exigência definida e o "comment" deve sustentar a nota com evidência; em exigência **alta**, seja mais duro nos tópicos onde houver falhas reais.
- "companyProfile": texto curto e claro sobre o que a empresa aparenta vender, para quem e com qual proposta.
- "strengths", "weaknesses", "opportunities", "quickWins", "longTermActions", "nextSteps": itens curtos, diretos e fáceis de entender. Evite frases longas.
- "recommendedChannels.description": **exatamente 1 parágrafo curto** (sem \\n\\n); linguagem comercial simples. Meta **total ~160–300 caracteres** (teto rígido **320**): por que o canal faz sentido **neste** caso + 1 direção prática imediata. Sem frase genérica vazia.
- "recommendedChannels.actions": ações práticas, em tom de orientação direta.
- "diagnosticScores.comment": **exatamente 2 parágrafos curtos** com \\n\\n; meta **total ~220–380 caracteres** (teto rígido **420**). **Preferência:** 1 frase por parágrafo (máximo 2). 1º = leitura objetiva do tópico com **fato ou evidência concreta**; 2º = **uma** prioridade ou próximo passo mensurável. **Cada parágrafo deve terminar com frase completa** (ponto final, exclamação ou interrogação). **Proibido** usar reticências ("..." ou "…") ou deixar frase aberta como se fosse continuar. Proibido preencher com adjetivos genéricos, clichês ou contraste repetido (ex.: Instagram bom / site ruim) em todos os tópicos. Se a nota for < 10, o que falta para 10/10 **no máximo uma vez** no comentário inteiro.
- "websiteResearchNote" e "instagramResearchNote": **sempre exatamente 2 parágrafos curtos cada** (\\n\\n), como na regra 1.3.

**REGRA ABSOLUTA: NUNCA INVENTE INFORMAÇÃO**
Esta é a regra mais importante de todo o relatório. Quebre qualquer outra regra antes de quebrar esta.

PROIBIDO INVENTAR (lista exaustiva):
- Número de seguidores, posts, seguindo, curtidas ou qualquer métrica numérica.
- Conteúdo da bio do Instagram. Se "Instagram bio" acima diz "não verificada", o campo "instagramBioExcerpt" DEVE ser "".
- Cores, paleta, identidade visual, estética do feed — SOMENTE se "Imagem do Instagram enviada ao modelo" = "sim" (a existência de snapshot só no relatório não autoriza inventar o visual).
- Funcionalidades, páginas ou seções do site que não foram verificadas.
- Comportamento do link da bio. Se "destino final verificado" diz "não verificado", NÃO diga que leva para WhatsApp, Linktree ou qualquer lugar.
- Tipo de conteúdo dos posts (ex.: "posts com dicas", "fotos de trabalhos"). Só descreva se viu na captura.
- Qualquer afirmação sobre a aparência visual de um canal sem "Imagem ... enviada ao modelo" = "sim".

QUANDO A CAPTURA FALHOU OU NÃO ESTÁ DISPONÍVEL:
- Use a frase "Não foi possível acessar o perfil do Instagram durante a análise automatizada. As informações abaixo são baseadas apenas no que foi possível verificar externamente." **somente** se TODOS forem verdadeiros: "Imagem do Instagram enviada ao modelo" = "não" **e** "Snapshot do perfil Instagram disponível no relatório" = "não" **e** "Instagram bio" = "não verificada" **e** "Instagram seguidores" = "não verificado".
- Se "Snapshot do perfil Instagram disponível no relatório" = "sim" (mesmo que "Imagem... modelo" = "não"): **proibido** dizer que o perfil não foi acessado ou que só houve verificação "externa". A captura existe no relatório. Pode dizer, se fizer sentido, que a extração automática de texto (bio, números) não veio completa e que o leitor deve usar a imagem nas evidências.
  -> NÃO invente seguidores, bio ou qualquer dado que não esteja na captura ou nos campos verificados.
  -> A nota de tópicos relacionados ao Instagram deve refletir limitações reais, sem contradizer a existência da imagem.
- Se "Imagem do website enviada ao modelo" = "não" **e** "Snapshot do site disponível no relatório" = "não":
  -> Escreva: "Não foi possível capturar visualmente o site durante a análise."
  -> NÃO descreva cores, layout, hierarquia visual ou design do site.
- Se o snapshot do site existir no relatório mas a imagem não foi enviada ao modelo: não use a frase acima; oriente a olhar a captura nas evidências.

QUANDO O INSTAGRAM NÃO FOI INFORMADO:
- Se "Instagram / redes" = "Não informado", isso significa que o lead não tem (ou não forneceu) Instagram.
- Neste caso, a IA PODE e DEVE comentar sobre a ausência de presença no Instagram como um ponto de melhoria.
- Isso é diferente de "o Instagram foi informado mas não conseguimos acessar" — neste caso, não invente dados.

COMO DIFERENCIAR:
- Instagram informado + dados coletados = use os dados reais.
- Instagram informado + bio/métricas não verificados mas snapshot no relatório = não diga que o perfil não foi acessado; explique limitação da extração textual e remeta à imagem nas evidências. NÃO invente números nem texto de bio.
- Instagram informado + sem snapshot e sem dados = diga que não foi possível verificar, NÃO invente.
- Instagram não informado = comente a ausência como oportunidade de melhoria.

REGRA DE OURO: na dúvida entre afirmar algo e dizer "não verificado", SEMPRE diga "não verificado".

Responda **somente** com um único objeto JSON válido (sem markdown fora do JSON), com esta estrutura:

{
  "executiveSummary": "string — exatamente 2 parágrafos curtos separados por \\n\\n; preferencialmente ≤520 caracteres no total",
  "companyProfile": "string",
  "digitalMaturityLevel": "Iniciante" | "Intermediário" | "Avançado",
  "digitalMaturityScore": number (0 a 10, uma casa decimal; se existir diagnosticScores, igual à média dos score),
  "strengths": ["string"],
  "weaknesses": ["string"],
  "opportunities": ["string"],
  "recommendedChannels": [
    {
      "name": "string",
      "priority": "Alta" | "Média" | "Baixa",
      "description": "string",
      "actions": ["string"]
    }
  ],
  "quickWins": ["string"],
  "longTermActions": ["string"],
  "estimatedTimelineMonths": number,
  "nextSteps": ["string"],
  "diagnosticScores": [
    { "topic": "Posicionamento", "score": number, "comment": "string — 2 parágrafos com \\n\\n; total preferencialmente ≤360 caracteres (máx. 420); ideal 1 frase por parágrafo" }
  ],
  "websiteResearchNote": "string — exatamente 2 parágrafos com \\n\\n; total ~520–780 caracteres; sem repetir métricas das evidências",
  "instagramResearchNote": "string — exatamente 2 parágrafos com \\n\\n; não começar com seguidores/posts; sem bio entre aspas; síntese",
  "instagramBioExcerpt": "string",
  "researchNotes": "string (exatamente 2 blocos separados por \\n\\n: Website (nota X/10): até 2 parágrafos internos com \\n\\n; Instagram (nota X/10): idem; sem markdown)",
  "proposalPageHtml": "string — HTML completo do documento"
}

No executiveSummary: **exatamente** 2 parágrafos curtos (\\n\\n entre eles), preferencialmente até ~520 caracteres no total. **Sem** reenumerar o diagnóstico completo.
Seja específico para "${body.company}".`;
}

export async function POST(req: NextRequest) {
  try {
    const requestStartedAt = Date.now();
    const body = await req.json();
    const {
      mode,
      preparedEvidence,
      leadId,
      userId,
      name,
      email,
      phone,
      company,
      status,
      websiteUrl,
      instagramUrl,
      servicesOffered: rawServices,
      objective: rawObjective,
      aiBasePromptGuidelines: rawAiBasePromptGuidelines,
      aiRecommendedChannelsPolicy: rawAiRecommendedChannelsPolicy,
      aiRecommendedChannelIds: rawAiRecommendedChannelIds,
      aiOpenRecommendedChannelCount: rawAiOpenRecommendedChannelCount,
      aiServicesFocusPolicy: rawAiServicesFocusPolicy,
      aiServiceOfferingIds: rawAiServiceOfferingIds,
      aiCustomServiceLabels: rawAiCustomServiceLabels,
      aiScoringStrictness: rawAiScoringStrictness,
    } = body;
    const servicesOffered =
      typeof rawServices === "string" ? rawServices.trim() : "";
    const objective = typeof rawObjective === "string" ? rawObjective.trim() : "";
    const aiBasePromptGuidelines =
      typeof rawAiBasePromptGuidelines === "string"
        ? rawAiBasePromptGuidelines.trim().slice(0, 3000)
        : "";
    const aiRecommendedChannelsPolicy: AiRecommendedChannelsPolicy =
      rawAiRecommendedChannelsPolicy === "restricted" ? "restricted" : "open";
    const aiRecommendedChannelIds = sanitizeAiRecommendedChannelIds(rawAiRecommendedChannelIds);
    const aiOpenRecommendedChannelCount = sanitizeAiOpenRecommendedChannelCount(
      rawAiOpenRecommendedChannelCount,
    );
    const aiServicesFocusPolicy: AiServicesFocusPolicy =
      rawAiServicesFocusPolicy === "restricted" ? "restricted" : "open";
    const aiServiceOfferingIds = sanitizeAiServiceOfferingIds(rawAiServiceOfferingIds);
    const aiCustomServiceLabels = sanitizeAiCustomServiceLabels(rawAiCustomServiceLabels);
    const aiScoringStrictness = sanitizeAiScoringStrictness(rawAiScoringStrictness);

    if (!leadId || !userId || !name || !company) {
      return NextResponse.json(
        { error: "Dados insuficientes do lead." },
        { status: 400 }
      );
    }

    const adminApp = getFirebaseAdminApp();
    if (!adminApp) {
      return NextResponse.json(
        { error: "Servidor sem Firebase Admin (`FIREBASE_SERVICE_ACCOUNT_JSON`)." },
        { status: 503 },
      );
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!bearerToken) {
      return NextResponse.json({ error: "Token ausente. Faça login novamente." }, { status: 401 });
    }
    let authedUid: string;
    try {
      const decoded = await getAuth(adminApp).verifyIdToken(bearerToken);
      authedUid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    if (authedUid !== String(userId)) {
      return NextResponse.json({ error: "Conta não corresponde ao token." }, { status: 403 });
    }

    const db = getFirestore(adminApp);
    const leadRef = db.collection("leads").doc(String(leadId).trim());
    const leadSnapGate = await leadRef.get();
    if (!leadSnapGate.exists) {
      return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
    }
    const leadOwnerUid = String(leadSnapGate.data()?.userId ?? "");
    if (leadOwnerUid !== authedUid) {
      return NextResponse.json({ error: "Sem permissão para este lead." }, { status: 403 });
    }

    const userSettingsSnap = await db.collection("userSettings").doc(authedUid).get();
    const userSettings = userSettingsSnap.exists
      ? (userSettingsSnap.data() as Record<string, unknown>)
      : {};
    const quota = resolveQuotaLimit(userSettings, "rotas");
    const periodStartMs = resolveCycleStartMs(userSettings, Date.now());
    if (!quota.isUnlimited) {
      const [docsUsed, counterUsed] = await Promise.all([
        countReportsSinceAdmin(authedUid, periodStartMs),
        Promise.resolve(readCycleUsage(userSettings, periodStartMs, "rotas")),
      ]);
      const usedThisCycle = Math.max(docsUsed, counterUsed);
      if (usedThisCycle >= quota.limit) {
        return NextResponse.json(
          {
            error:
              "Você atingiu o limite de Rotas Digital do seu ciclo atual. Amplie a cota para gerar uma nova rota.",
            code: "ROTAS_LIMIT_REACHED",
            plan: quota.plan,
            monthlyLimit: quota.limit,
            usedThisMonth: usedThisCycle,
            addOnPacks: ROTAS_ADD_ON_PACKS,
          },
          { status: 429 },
        );
      }
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Chave da API Gemini não configurada." },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const normalizedWebsiteUrlRaw = normalizeUrl(websiteUrl);
    const splitFromWebsiteField = normalizedWebsiteUrlRaw
      ? splitWebsiteUriForSnapshot(normalizedWebsiteUrlRaw)
      : {};
    const normalizedWebsiteUrl = splitFromWebsiteField.website;
    let normalizedInstagramUrl = normalizeInstagramUrl(instagramUrl);
    if (!normalizedInstagramUrl && splitFromWebsiteField.instagram) {
      normalizedInstagramUrl = splitFromWebsiteField.instagram;
    }
    const websiteFieldWasSocialOnly =
      Boolean(normalizedWebsiteUrlRaw) && !normalizedWebsiteUrl && !splitFromWebsiteField.instagram;
    console.info("[IG_DEBUG][generate-route] Entrada normalizada.", {
      leadId,
      userId,
      websiteUrl: normalizedWebsiteUrl || null,
      websiteUrlIgnoredAsInstagram:
        Boolean(normalizedWebsiteUrlRaw) && Boolean(splitFromWebsiteField.instagram) && !normalizedWebsiteUrl,
      websiteUrlIgnoredAsNonCompanySite: websiteFieldWasSocialOnly,
      instagramUrl: normalizedInstagramUrl || null,
    });
    if (mode === "collectEvidence") {
      const prepared = await prepareEvidencePayload({
        normalizedWebsiteUrl,
        normalizedInstagramUrl,
      });
      return NextResponse.json({ preparedEvidence: prepared });
    }

    const prepared: PreparedEvidencePayload =
      mode === "generateFromEvidence" && preparedEvidence
        ? (preparedEvidence as PreparedEvidencePayload)
        : await prepareEvidencePayload({
            normalizedWebsiteUrl,
            normalizedInstagramUrl,
          });

    const requestOrigin = req.nextUrl.origin;
    const hasBrowserless = prepared.hasBrowserless;
    const websiteEvidence = prepared.websiteEvidence;
    const instagramEvidence = prepared.instagramEvidence;
    let siteHeroSnapshotUrl = prepared.siteHeroSnapshotUrl;
    let instagramSnapshotUrl = prepared.instagramSnapshotUrl;
    let instagramBioLinkSnapshotUrl = prepared.instagramBioLinkSnapshotUrl;
    const instagramProfileImageUrl = prepared.instagramProfileImageUrl;
    const logoImageUrl = prepared.logoImageUrl;

    const [websiteDownload, instagramDownload, bioLinkDownload] = await Promise.all([
      downloadFirstAvailableImagePart(requestOrigin, prepared.websiteCandidateUrls),
      downloadFirstAvailableImagePart(requestOrigin, prepared.instagramSnapshotCandidates),
      downloadFirstAvailableImagePart(requestOrigin, prepared.bioLinkCandidateUrls),
    ]);
    let { part: websiteImagePart, selectedUrl: selectedWebsiteSnapshotUrl } = websiteDownload;
    let { part: instagramImagePart, selectedUrl: selectedInstagramSnapshotUrl } = instagramDownload;
    const { part: instagramBioLinkImagePart, selectedUrl: selectedBioLinkSnapshotUrl } = bioLinkDownload;

    if (selectedWebsiteSnapshotUrl) siteHeroSnapshotUrl = selectedWebsiteSnapshotUrl;
    if (selectedInstagramSnapshotUrl) instagramSnapshotUrl = selectedInstagramSnapshotUrl;
    if (selectedBioLinkSnapshotUrl) instagramBioLinkSnapshotUrl = selectedBioLinkSnapshotUrl;
    console.info("[IG_DEBUG][generate-route] URLs de evidência selecionadas.", {
      hasBrowserless,
      siteHeroSnapshotUrl: siteHeroSnapshotUrl || null,
      instagramSnapshotUrl: instagramSnapshotUrl || null,
      instagramBioLinkSnapshotUrl: instagramBioLinkSnapshotUrl || null,
      instagramProfileImageUrl: instagramProfileImageUrl || null,
      logoImageUrl: logoImageUrl || null,
      websiteScreenshotSentToAi: Boolean(websiteImagePart),
      instagramScreenshotSentToAi: Boolean(instagramImagePart),
      instagramBioLinkScreenshotSentToAi: Boolean(instagramBioLinkImagePart),
    });

    const plan = await getUserPlanAdmin(authedUid);
    const planFeatures = PLAN_FEATURES[plan];
    let placesAnalysisWarning: string | undefined;
    if (planFeatures.gmbAnalysis) {
      const placesKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
      if (placesKey) {
        try {
          await ensureLeadGmbCacheAdmin(db, placesKey, authedUid, String(leadId));
        } catch (gmbErr) {
          console.warn("[generate-route] Enriquecimento GMB (Places) ignorado.", gmbErr);
          placesAnalysisWarning = "Dados do GMB temporariamente indisponíveis";
        }
        if (planFeatures.competitorAnalysis) {
          try {
            await ensureLeadCompetitorsCacheAdmin(db, placesKey, authedUid, String(leadId));
          } catch (compErr) {
            console.warn("[generate-route] Enriquecimento de concorrentes (Places) ignorado.", compErr);
          }
        }
      } else {
        placesAnalysisWarning = "Dados do GMB temporariamente indisponíveis";
      }
    }
    const leadSnapAfterPlaces = await leadRef.get();
    const leadPlacesForPrompt = readLeadPlacesFromData(
      (leadSnapAfterPlaces.data() as Record<string, unknown>) ?? {},
    );
    const placesBlock = buildPlacesContextPromptBlock({
      places: leadPlacesForPrompt,
      features: planFeatures,
      company,
      leadWebsiteUrl: prepared.normalizedWebsiteUrl,
      leadInstagramUrl: prepared.normalizedInstagramUrl,
    });

    const prompt = buildPrompt({
      name,
      email,
      phone,
      company,
      status,
      websiteUrl: prepared.normalizedWebsiteUrl,
      instagramUrl: prepared.normalizedInstagramUrl,
      servicesOffered,
      objective,
      aiBasePromptGuidelines,
      aiRecommendedChannelsPolicy,
      aiRecommendedChannelIds,
      aiOpenRecommendedChannelCount,
      aiServicesFocusPolicy,
      aiServiceOfferingIds,
      aiCustomServiceLabels,
      aiScoringStrictness,
      websiteEvidence,
      instagramEvidence,
      hasWebsiteScreenshot: Boolean(websiteImagePart),
      hasInstagramScreenshot: Boolean(instagramImagePart),
      hasInstagramBioLinkScreenshot: Boolean(instagramBioLinkImagePart),
      instagramSnapshotForReport: Boolean(instagramSnapshotUrl),
      websiteSnapshotForReport: Boolean(siteHeroSnapshotUrl),
      placesBlock,
    });
    const generateContentInput = buildGenerateContentInput(prompt, {
      websiteImagePart,
      instagramImagePart,
      instagramBioLinkImagePart,
    });

    const discoveredModels = await listGeminiGenerateContentModels(process.env.GEMINI_API_KEY);
    const candidateModels = discoveredModels.length ? discoveredModels : ["gemini-2.5-flash"];

    let responseText = "";
    let selectedModelName = "";
    let selectedUsage: GeminiUsageMetadata | undefined;
    let lastError: unknown = null;
    const elapsedMs = Date.now() - requestStartedAt;
    const lowTimeBudget = elapsedMs > 35_000;

    // 1) Se ainda há orçamento de tempo, tenta com grounding (pesquisa web).
    if (!lowTimeBudget) {
      for (const modelName of candidateModels) {
        try {
          const model = genAI.getGenerativeModel(
            {
              model: modelName,
              tools: [
                {
                  googleSearchRetrieval: {
                    dynamicRetrievalConfig: {
                      mode: DynamicRetrievalMode.MODE_DYNAMIC,
                      dynamicThreshold: 0.25,
                    },
                  },
                },
              ],
            },
            { apiVersion: "v1" }
          );
          const result = await withGeminiCallTimeout(
            model.generateContent(generateContentInput),
            GEMINI_GENERATE_TIMEOUT_MS
          );
          responseText = result.response.text();
          selectedModelName = modelName;
          selectedUsage = result.response.usageMetadata as GeminiUsageMetadata | undefined;
          break;
        } catch (err) {
          lastError = err;
        }
      }
    }

    // 2) Se grounding falhar (ou foi pulado por orçamento), tenta sem grounding.
    if (!responseText) {
      for (const modelName of candidateModels) {
        try {
          const model = genAI.getGenerativeModel(
            {
              model: modelName,
            },
            { apiVersion: "v1" }
          );
          const result = await withGeminiCallTimeout(
            model.generateContent(generateContentInput),
            GEMINI_GENERATE_TIMEOUT_MS
          );
          responseText = result.response.text();
          selectedModelName = modelName;
          selectedUsage = result.response.usageMetadata as GeminiUsageMetadata | undefined;
          break;
        } catch (err) {
          lastError = err;
        }
      }
    }

    if (!responseText) {
      throw new Error(
        `Nenhum modelo Gemini disponível para generateContent. Último erro: ${
          lastError instanceof Error ? lastError.message : "desconhecido"
        }`
      );
    }

    let aiData: Record<string, unknown>;
    try {
      aiData = parseModelJson(responseText);
    } catch (parseError) {
      console.warn("[AI_JSON_PARSE] Resposta inválida, tentando reparo automático.", {
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      aiData = await repairModelJsonWithGemini(
        genAI,
        responseText,
        candidateModels,
        parseError
      );
    }

    const proposalRaw =
      typeof aiData.proposalPageHtml === "string"
        ? aiData.proposalPageHtml
        : "";
    const proposalHtml = sanitizeProposalHtml(
      proposalRaw ||
        `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Proposta</title></head><body><p>Conteúdo da proposta em elaboração para ${company}.</p></body></html>`
    );

    const publicSlug = newPublicSlug();

    const diagnosticScores = Array.isArray(aiData.diagnosticScores)
      ? (aiData.diagnosticScores as DiagnosticScore[]).map((item) =>
          ensureDiagnosticCommentActionability(
            {
              topic: String(item.topic || "Tópico"),
              score: Math.max(0, Math.min(10, Number(item.score) || 0)),
              comment: (() => {
                const comment = String(item.comment || "");
                const timeline = websiteEvidence.detectedTimeline;
                if (!timeline) return comment;
                return comment.replace(
                  /\b(?:\d{1,2}\s*(?:a|-)\s*\d{1,2}|\d{1,2})\s*mes(?:es)?\b/gi,
                  timeline
                );
              })(),
              evidenceTitle: typeof item.evidenceTitle === "string" ? item.evidenceTitle : undefined,
              evidenceImageUrl:
                typeof item.evidenceImageUrl === "string" ? item.evidenceImageUrl : undefined,
              evidenceNote: typeof item.evidenceNote === "string" ? item.evidenceNote : undefined,
            },
            websiteEvidence,
            instagramEvidence
          )
        )
      : [];

    const enrichedDiagnosticScores = diagnosticScores.map((item) => {
      if (item.evidenceImageUrl) return item;
      const topic = item.topic.toLowerCase();
      const isInstagramTopic =
        topic.includes("instagram") ||
        topic.includes("rede") ||
        topic.includes("identidade visual") ||
        topic.includes("consistência");
      const fallbackImage = isInstagramTopic
        ? instagramSnapshotUrl
        : siteHeroSnapshotUrl || instagramSnapshotUrl;
      const fallbackTitle = isInstagramTopic
        ? "Exemplo no perfil do Instagram analisado"
        : "Exemplo na home do site analisado";
      return {
        ...item,
        evidenceTitle: item.evidenceTitle || fallbackTitle,
        evidenceImageUrl: fallbackImage,
        evidenceNote:
          item.evidenceNote ||
          (isInstagramTopic
            ? "Captura usada na análise visual do perfil do Instagram."
            : "Captura usada na análise de posicionamento e conversão do site."),
      };
    });
    const hasInstagramCapture = Boolean(instagramImagePart) || Boolean(instagramSnapshotUrl);
    const hasWebsiteCapture = Boolean(websiteImagePart) || Boolean(siteHeroSnapshotUrl);

    const topicKeyForGate = (raw: string) =>
      raw
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const gatedDiagnosticScores = enrichedDiagnosticScores.map((item) => {
      const topic = item.topic.toLowerCase();
      const topicAscii = topicKeyForGate(item.topic);
      const isCrossChannelConsistency =
        topicAscii.includes("consistencia") && topicAscii.includes("comunicacao");
      const isInstagramOnlyTopic =
        (topic.includes("instagram") || topic.includes("rede")) &&
        !isCrossChannelConsistency;
      const isWebsiteTopic = topic.includes("site") || topic.includes("website");
      if (isInstagramOnlyTopic && !hasInstagramCapture) {
        return {
          ...item,
          score: Math.min(item.score, 3),
          comment:
            "Sem captura real do Instagram nesta execução, não dá para avaliar o visual com precisão.\n\nRecapture o perfil para pontuar com segurança.",
          evidenceImageUrl: undefined,
          evidenceNote: "Sem captura visual real de Instagram nesta execução.",
        };
      }
      if (isWebsiteTopic && !hasWebsiteCapture) {
        return {
          ...item,
          score: Math.min(item.score, 3),
          comment:
            "Sem captura real do site nesta execução, não dá para avaliar layout e conversão com precisão.\n\nRecapture a home para pontuar com segurança.",
          evidenceImageUrl: undefined,
          evidenceNote: "Sem captura visual real de website nesta execução.",
        };
      }
      return item;
    });
    const harmonizedDiagnosticScores = gatedDiagnosticScores.map((item) => {
      const topic = item.topic.toLowerCase();
      const isInstagramTopic =
        topic.includes("instagram") ||
        topic.includes("rede") ||
        topic.includes("consist");
      if (!isInstagramTopic) return item;
      return {
        ...item,
        comment: alignInstagramTextWithEvidence(item.comment || "", instagramEvidence),
      };
    });

    const websiteTopic = harmonizedDiagnosticScores.find((item) =>
      item.topic.toLowerCase().includes("site") ||
      item.topic.toLowerCase().includes("website")
    );
    const instaTopic = harmonizedDiagnosticScores.find((item) =>
      item.topic.toLowerCase().includes("instagram") ||
      item.topic.toLowerCase().includes("rede")
    );

    const maturityFromTopics = maturityFromDiagnosticScores(harmonizedDiagnosticScores);

    const rawMaturityScore = Number(aiData.digitalMaturityScore) || 0;
    const normalizedMaturityScore = rawMaturityScore > 10 ? rawMaturityScore / 10 : rawMaturityScore;
    const fallbackOverall = Math.max(0, Math.min(10, normalizedMaturityScore));
    const defaultScoreText = `${(maturityFromTopics
      ? maturityFromTopics.digitalMaturityScore
      : fallbackOverall
    ).toFixed(1)}/10`;
    const websiteScoreText = websiteTopic
      ? `${websiteTopic.score.toFixed(1)}/10`
      : defaultScoreText;
    const instagramScoreText = instaTopic
      ? `${instaTopic.score.toFixed(1)}/10`
      : defaultScoreText;

    const websiteNote = buildScoredResearchNote(
      "Website",
      websiteScoreText,
      aiData.websiteResearchNote,
      websiteImagePart
        ? buildWebsiteResearchNote(websiteEvidence)
        : buildVisualAnalysisUnavailableNote("website", Boolean(siteHeroSnapshotUrl))
    );
    const instagramEvidenceNote = instagramImagePart
      ? buildInstagramResearchNote(instagramEvidence)
      : buildVisualAnalysisUnavailableNote("instagram", Boolean(instagramSnapshotUrl));
    const instagramNote = alignInstagramTextWithEvidence(buildScoredResearchNote(
      "Instagram",
      instagramScoreText,
      sanitizeInstagramAiBody(aiData.instagramResearchNote, instagramEvidence),
      instagramEvidenceNote
    ), instagramEvidence);
    const researchNotes = normalizeResearchNotesText(
      `${websiteNote}\n\n${instagramNote}`
    );

    const generationEstimatedCostUsd = estimateCostUsdFromUsage(selectedModelName, selectedUsage);
    const generationEstimatedCostBrl =
      typeof generationEstimatedCostUsd === "number"
        ? Number((generationEstimatedCostUsd * USD_TO_BRL_ESTIMATE).toFixed(6))
        : undefined;
    const generationTotalTokens = Number(selectedUsage?.totalTokenCount || 0) || undefined;

    const report: Omit<RotaDigitalReport, "id"> = {
      leadId,
      userId,
      createdAt: Date.now(),
      leadName: name,
      leadCompany: company,
      leadEmail: email || "",
      executiveSummary: String(aiData.executiveSummary || ""),
      companyProfile: String(aiData.companyProfile || ""),
      digitalMaturityLevel:
        maturityFromTopics?.digitalMaturityLevel ??
        ((aiData.digitalMaturityLevel as RotaDigitalReport["digitalMaturityLevel"]) || "Iniciante"),
      digitalMaturityScore: maturityFromTopics
        ? maturityFromTopics.digitalMaturityScore
        : (() => {
            const raw = Number(aiData.digitalMaturityScore) || 0;
            const normalized = raw > 10 ? raw / 10 : raw;
            return Math.max(0, Math.min(10, Number(normalized.toFixed(1))));
          })(),
      strengths: (aiData.strengths as string[]) || [],
      weaknesses: (aiData.weaknesses as string[]) || [],
      opportunities: (aiData.opportunities as string[]) || [],
      recommendedChannels: normalizeRecommendedChannels(
        aiData.recommendedChannels,
        aiRecommendedChannelsPolicy,
        aiRecommendedChannelIds,
        aiRecommendedChannelsPolicy === "open" ? aiOpenRecommendedChannelCount : undefined,
      ),
      quickWins: (aiData.quickWins as string[]) || [],
      longTermActions: (aiData.longTermActions as string[]) || [],
      estimatedTimelineMonths: Number(aiData.estimatedTimelineMonths) || 6,
      nextSteps: (aiData.nextSteps as string[]) || [],
      publicSlug,
      proposalHtml,
      brief: {
        websiteUrl: prepared.normalizedWebsiteUrl,
        instagramUrl: prepared.normalizedInstagramUrl,
        servicesOffered,
        objective,
      },
      diagnosticScores: harmonizedDiagnosticScores,
      evidences: {
        logoImageUrl,
        instagramProfileImageUrl,
        instagramSnapshotUrl,
        instagramBioLinkSnapshotUrl,
        siteHeroSnapshotUrl: siteHeroSnapshotUrl,
        instagramBioExcerpt: sanitizeInstagramBioExcerpt(instagramEvidence.bio || ""),
        instagramBioLinkTitle: instagramEvidence.bioLinkTitle,
        instagramBioLinkUrl: instagramEvidence.bioLinkUrl,
        instagramBioLinkResolvedUrl: instagramEvidence.bioLinkResolvedUrl,
        researchNotes,
      },
      aiUsage: {
        generation: {
          model: selectedModelName || undefined,
          promptTokens: Number(selectedUsage?.promptTokenCount || 0) || undefined,
          candidateTokens: Number(selectedUsage?.candidatesTokenCount || 0) || undefined,
          totalTokens: generationTotalTokens,
          estimatedCostUsd: generationEstimatedCostUsd,
          estimatedCostBrl: generationEstimatedCostBrl,
          createdAt: Date.now(),
        },
        reanalysis: [],
        totalTokens: generationTotalTokens,
        totalEstimatedCostUsd: generationEstimatedCostUsd,
        totalEstimatedCostBrl: generationEstimatedCostBrl,
      },
      billingPlanSnapshot: plan,
      gmbSnapshot: planFeatures.gmbAnalysis
        ? {
            gmbFetchedAt: leadPlacesForPrompt.gmbFetchedAt,
            gmbRating: leadPlacesForPrompt.gmbRating,
            gmbReviewCount: leadPlacesForPrompt.gmbReviewCount,
            gmbHasListing: leadPlacesForPrompt.gmbHasListing,
            gmbPhotoCount: leadPlacesForPrompt.gmbPhotoCount,
            gmbBusinessStatus: leadPlacesForPrompt.gmbBusinessStatus,
            gmbOpenNow: leadPlacesForPrompt.gmbOpenNow,
            gmbGoogleMapsUri: leadPlacesForPrompt.gmbGoogleMapsUri,
            gmbPlaceId: leadPlacesForPrompt.gmbPlaceId,
            gmbFormattedAddress: leadPlacesForPrompt.gmbFormattedAddress,
            gmbCity: leadPlacesForPrompt.gmbCity,
            gmbSubLocality: leadPlacesForPrompt.gmbSubLocality,
            gmbListingWebsiteUrl: leadPlacesForPrompt.gmbListingWebsiteUrl,
            gmbListingInstagramUrl: leadPlacesForPrompt.gmbListingInstagramUrl,
          }
        : null,
      competitorsSnapshot: planFeatures.competitorAnalysis
        ? (leadPlacesForPrompt.competitors ?? null)
        : null,
      competitorsFetchedAt: planFeatures.competitorAnalysis
        ? leadPlacesForPrompt.competitorsFetchedAt
        : undefined,
      placesAnalysisWarning: placesAnalysisWarning,
    };

    const debug = {
      instagram: {
        inputUrl: prepared.normalizedInstagramUrl || null,
        handle: instagramEvidence.handle || null,
        dataSource: instagramEvidence.dataSource || null,
        authCookiesConfigured: hasInstagramAuthCookies(),
        isAccessible: instagramEvidence.isAccessible !== false,
        accessLimited: Boolean(instagramEvidence.accessLimited),
        hasBio: Boolean(instagramEvidence.bio),
        followers: instagramEvidence.followers ?? null,
        following: instagramEvidence.following ?? null,
        posts: instagramEvidence.posts ?? null,
        hasProfileImage: Boolean(instagramEvidence.profileImageUrl),
        hasRecentPostImage: Boolean(instagramEvidence.recentPostImageUrl),
      },
      selectedEvidenceUrls: {
        instagramSnapshotUrl: instagramSnapshotUrl || null,
        instagramBioLinkSnapshotUrl: instagramBioLinkSnapshotUrl || null,
        instagramProfileImageUrl: instagramProfileImageUrl || null,
        siteHeroSnapshotUrl: siteHeroSnapshotUrl || null,
      },
      multimodal: {
        websiteScreenshotSentToAi: Boolean(websiteImagePart),
        instagramScreenshotSentToAi: Boolean(instagramImagePart),
        instagramBioLinkScreenshotSentToAi: Boolean(instagramBioLinkImagePart),
      },
      usage: {
        model: selectedModelName || null,
        promptTokens: selectedUsage?.promptTokenCount ?? null,
        candidateTokens: selectedUsage?.candidatesTokenCount ?? null,
        totalTokens: selectedUsage?.totalTokenCount ?? null,
        estimatedCostUsd: generationEstimatedCostUsd ?? null,
        estimatedCostBrl: generationEstimatedCostBrl ?? null,
      },
    };
    if (!quota.isUnlimited) {
      try {
        const docsUsed = await countReportsSinceAdmin(authedUid, periodStartMs);
        await incrementCycleUsageAdmin({
          uid: authedUid,
          resource: "rotas",
          cycleStartMs: periodStartMs,
          by: 1,
          /** Reports são gravados client-side; o contador persistente garante que
           *  exclusões no painel não devolvem cota. Seed preserva valor já existente. */
          seed: Math.max(0, docsUsed),
        });
      } catch (counterErr) {
        console.error("[generate-route] falha ao incrementar cycleUsage", counterErr);
      }
    }

    return NextResponse.json({ report, debug });
  } catch (error: unknown) {
    console.error("Error generating route:", error);
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json(
      { error: `Falha ao gerar Rota Digital: ${message}` },
      { status: 500 }
    );
  }
}
