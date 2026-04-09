import { NextRequest, NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  DynamicRetrievalMode,
} from "@google/generative-ai";
import { randomBytes } from "crypto";
import type { DiagnosticScore, RotaDigitalReport } from "@/types/report";
import {
  buildInstagramRequestHeaders,
  fetchInstagramPublicPage,
  hasInstagramAuthCookies,
  isInstagramLoginWallBio,
  isInstagramLoginWallHtml,
  sanitizeInstagramAssetUrl,
} from "@/lib/instagram-public-profile";

export const runtime = "nodejs";
export const maxDuration = 120;

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

type GeminiInlineImagePart = {
  inlineData: {
    mimeType: string;
    data: string;
  };
};

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

async function downloadImageAsInlinePart(
  imageUrl?: string
): Promise<GeminiInlineImagePart | undefined> {
  if (!imageUrl) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ctrl = new AbortController();
    const timeoutMs = imageUrl.includes("/api/") ? 18000 : 10000;
    timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(imageUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (RotaDigitalBot/1.0)",
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!contentType.startsWith("image/")) return undefined;
    const bytes = await res.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 4 * 1024 * 1024) return undefined;
    const base64 = Buffer.from(bytes).toString("base64");
    if (!base64) return undefined;
    return {
      inlineData: {
        mimeType: contentType || "image/jpeg",
        data: base64,
      },
    };
  } catch {
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
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
        "CAPTURA 1 (Website - página completa): use esta imagem como fonte principal para análise visual do site como um todo, incluindo estrutura da página, paleta, contraste, hierarquia, prova social e clareza de CTA.",
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

function normalizeAiResearchBody(text: unknown): string {
  if (typeof text !== "string") return "";
  return normalizeResearchNotesText(text)
    .replace(/^(website|site|instagram)\s*(?:\(.*?\))?\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
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
      .replace(/\s{2,}/g, " ")
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
      .replace(/\s{2,}/g, " ")
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

function parseModelJson(text: string): Record<string, unknown> {
  const stripInvalidControlChars = (raw: string): string =>
    // Remove TODOS os controles ASCII (inclui \n, \r e \t), pois
    // a IA às vezes injeta esses caracteres dentro de strings JSON.
    raw.replace(/[\u0000-\u001F]/g, " ");

  const cleanupCommonJsonIssues = (raw: string): string =>
    stripInvalidControlChars(raw)
      // Remove vírgulas sobrando antes de fechar objeto/array.
      .replace(/,\s*([}\]])/g, "$1")
      // Normaliza aspas “curvas” que podem vir da IA.
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");

  const trimmed = cleanupCommonJsonIssues(text.trim());
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fence) {
      return JSON.parse(cleanupCommonJsonIssues(fence[1].trim())) as Record<
        string,
        unknown
      >;
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(
        cleanupCommonJsonIssues(trimmed.slice(start, end + 1))
      ) as Record<string, unknown>;
    }
    throw new Error("Resposta da IA não é um JSON válido.");
  }
}

async function repairModelJsonWithGemini(
  genAI: GoogleGenerativeAI,
  rawText: string
): Promise<Record<string, unknown>> {
  const repairModel = genAI.getGenerativeModel(
    {
      model: "gemini-2.0-flash-lite",
    },
    { apiVersion: "v1" }
  );

  const repairPrompt = [
    "Converta o conteúdo abaixo para um JSON VÁLIDO.",
    "Regras:",
    "- Preserve os mesmos campos e valores sempre que possível.",
    "- Não adicione comentários.",
    "- Não adicione texto fora do JSON.",
    "- Retorne apenas um único objeto JSON válido.",
    "",
    rawText,
  ].join("\n");

  const repaired = await repairModel.generateContent(repairPrompt);
  return parseModelJson(repaired.response.text());
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
  const parts: string[] = [];
  if (typeof e.followers === "number" && !isNaN(e.followers))
    parts.push(`${e.followers.toLocaleString("pt-BR")} seguidores`);
  if (typeof e.following === "number" && !isNaN(e.following))
    parts.push(`seguindo ${e.following.toLocaleString("pt-BR")}`);
  if (typeof e.posts === "number" && !isNaN(e.posts))
    parts.push(`${e.posts.toLocaleString("pt-BR")} publicações`);
  const metrics = parts.length > 0 ? parts.join(", ") : "métricas não coletadas";
  const bioText = e.bio
    ? "a bio deixa claro o posicionamento principal do perfil."
    : "a bio não foi coletada automaticamente.";
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
  return `perfil ${handle}. ${bioText} ${linkText} Indicadores públicos: ${metrics}.`;
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
    return "Para chegar a 10/10, vale ajustar com mais cuidado hierarquia visual, contraste entre blocos, respiro entre seções, alinhamento dos elementos e consistência entre a estética do site e do Instagram.";
  }
  if (lower.includes("presença")) {
    const websitePart = technicalHints.length
      ? `No site, os principais ajustes técnicos são: ${technicalHints.slice(0, 3).join(", ")}.`
      : "No site, vale melhorar SEO básico, distribuição de CTAs e pontos de prova social.";
    const funnelPart = hasWhatsappLink
      ? "Também vale amarrar melhor a jornada entre Instagram, site e WhatsApp para a conversão ficar mais fluida."
      : "Também vale amarrar melhor a jornada entre Instagram e site para a conversão ficar mais fluida.";
    return `Para chegar a 10/10, ${websitePart} ${funnelPart}`;
  }
  if (lower.includes("funil") || lower.includes("cta")) {
    return hasWhatsappLink
      ? "Para chegar a 10/10, os CTAs precisam deixar mais claro o próximo passo, reduzir fricção entre conteúdo e WhatsApp e mostrar melhor o que acontece depois do clique."
      : "Para chegar a 10/10, os CTAs precisam ficar mais claros, mais visíveis e mais conectados com a próxima etapa de conversão.";
  }
  if (lower.includes("clareza da proposta")) {
    return "Para chegar a 10/10, a proposta precisa aparecer ainda mais rápido no primeiro bloco, com benefício principal, diferenciais e CTA no mesmo fluxo visual.";
  }
  if (lower.includes("consist")) {
    return "Para chegar a 10/10, vale alinhar ainda mais o tom de voz, os gatilhos de confiança, os destaques e a promessa principal entre site e Instagram.";
  }
  if (lower.includes("posicionamento")) {
    return "Para chegar a 10/10, vale deixar o diferencial principal ainda mais explícito, repetir essa mensagem nos pontos nobres da página e conectar melhor a promessa com a oferta.";
  }
  return "Para chegar a 10/10, vale deixar mais claro o que está funcionando, corrigir os pontos de atrito e transformar essa percepção em ação prática no site e no Instagram.";
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
    return { ...item, comment: improvement };
  }

  if (/para chegar a 10\/10|para ficar 10\/10|para melhorar|o que falta|vale ajustar|precisa/i.test(comment)) {
    return item;
  }

  return {
    ...item,
    comment: `${comment} ${improvement}`.trim(),
  };
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
  websiteEvidence?: WebsiteEvidence;
  instagramEvidence?: InstagramEvidence;
  hasWebsiteScreenshot?: boolean;
  hasInstagramScreenshot?: boolean;
  hasInstagramBioLinkScreenshot?: boolean;
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
  return `Você é um estrategista de marketing digital senior. Faça análise profunda com foco comercial.
Use pesquisa na web quando necessário para enriquecer a análise (site da empresa, instagram e contexto competitivo).

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
- Captura visual do website antes da análise: ${
    body.hasWebsiteScreenshot ? "disponível" : "não disponível"
  }
- Captura visual do Instagram antes da análise: ${
    body.hasInstagramScreenshot ? "disponível" : "não disponível"
  }
- Captura visual do destino do link da bio: ${
    body.hasInstagramBioLinkScreenshot ? "disponível" : "não disponível"
  }
- Website status: ${siteEvidence?.status ?? "não verificado"}
- Website título: ${siteEvidence?.title || "não encontrado"}
- Website H1: ${siteEvidence?.h1 || "não encontrado"}
- Website diretório/listagem: ${siteEvidence?.isDirectoryListing ? "sim" : "não"}
- Website placeholder: ${siteEvidence?.isPlaceholder ? "sim" : "não"}
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

**Tarefas**
0) Escreva em linguagem simples, direta e humana. Frases curtas. Evite linguagem formal/corporativa exagerada.
0.0) Não use markdown no texto (sem **negrito**, sem listas com *), apenas texto limpo.
0.1) Se serviços ou objetivo não vierem preenchidos pelo usuário, deduza com base nas evidências (site, Instagram, pesquisa). Em "companyProfile" ou "executiveSummary", indique brevemente o que foi inferido versus o que foi observado diretamente.
0.2) Escreva como um especialista explicando para um cliente comum. O texto precisa ser fácil de ler, claro e natural.
0.3) Evite tom excessivamente analítico, professoral ou "consultoria engessada". Não use frases infladas como "presença digital robusta", "sinergia entre canais", "alavancar resultados", "ecossistema digital" ou parecidas.
0.4) Prefira frases concretas, como: "o perfil passa confiança", "a proposta está clara", "faltam provas visuais", "o CTA pode ficar mais forte".
0.5) Não repita a mesma ideia em campos diferentes. Cada campo deve acrescentar algo novo.
1) Analise alinhamento entre posicionamento atual e o objetivo (informado ou inferido).
1.1) Se o site estiver vazio, quebrado, em placeholder (ex.: "hello world") ou sem conteúdo útil, deixe isso explícito e reduza as notas relacionadas a website.
1.2) Se o Instagram estiver vazio/sem consistência, deixe explícito e ajuste as notas.
1.3) Em "websiteResearchNote" e "instagramResearchNote", escreva observações curtas, específicas e naturais sobre o que foi avaliado. Não seja genérico.
1.4) Em "instagramResearchNote", fale de posicionamento, clareza da bio, consistência visual, destaques, link na bio, prova social e CTA. Não copie a bio literalmente e não repita o texto inteiro da bio.
1.5) Ao comentar o link da bio, use o "destino final verificado". Se ele levar direto para WhatsApp, diga isso claramente. Não invente Linktree, menu com várias opções ou múltiplos destinos se isso não estiver verificado.
1.6) Use análise VISUAL apenas quando houver captura real do canal.
1.7) Se "Captura visual do website antes da análise" estiver "não disponível", não faça análise visual do website; escreva explicitamente "não foi possível analisar visualmente o website".
1.8) Se "Captura visual do Instagram antes da análise" estiver "não disponível", não faça análise visual do Instagram; escreva explicitamente "não foi possível analisar visualmente o Instagram".
1.9) Quando houver captura do Instagram (CAPTURA 2), ANALISE A IMAGEM CUIDADOSAMENTE mesmo que ela tenha fundo escuro ou overlay parcial. O perfil do Instagram pode estar visível por trás de um overlay leve. Se conseguir ler qualquer informação (nome do perfil, bio, número de seguidores, posts, avatar, thumbnails do feed), USE essas informações na análise. A CAPTURA 2 é a fonte prioritária.
1.10) Tente extrair da captura: nome do perfil, quantidade de posts, seguidores, seguindo, texto da bio, link visível na bio, avatar/foto de perfil, estética/cores do feed, tipo de conteúdo visível nos posts.
1.11) Se algum desses itens específicos não estiver legível na captura, escreva "não legível na captura" apenas para aquele item — não descarte a análise inteira por causa de um overlay parcial.
1.12) Para Instagram, priorize SEMPRE a CAPTURA 2 como fonte principal. Somente diga "não foi possível analisar visualmente" se a CAPTURA 2 não foi fornecida OU se a imagem estiver totalmente ilegível (completamente preta/branca sem qualquer conteúdo visível).
1.13) NUNCA diga que a captura mostra "tela de login" se houver conteúdo de perfil visível (foto, bio, posts). Um overlay de login por cima de conteúdo de perfil NÃO invalida a análise — extraia o que for possível.
1.14) Quando a "Captura visual do destino do link da bio" estiver disponível (CAPTURA 3), use essa imagem para avaliar a experiência pós-clique: clareza da proposta, consistência com o Instagram, fricção e CTA da página de destino.
2) Avalie pontos com nota 0-10: posicionamento, identidade visual, clareza da proposta, consistência da comunicação, funil/CTA, presença digital geral.
2.1) Em cada item de "diagnosticScores", se a nota for menor que 10, diga sempre o que falta para chegar a 10/10. Seja específico.
2.2) Nunca use frases vagas como "há espaço para melhorar" ou "há espaço para otimizações técnicas" sem explicar exatamente o que deve ser ajustado.
2.3) Em "Identidade Visual", analise harmonia visual, paleta, contraste, hierarquia, espaçamento, alinhamento, legibilidade e coerência entre site e Instagram.
3) Faça comentários práticos e acionáveis.
4) Em "proposalPageHtml", gere HTML5 completo e elegante (CSS no <style>), em português, voltado ao cliente final (${body.company}), com proposta comercial convincente, próximos passos claros e CTA para fechamento. Não inclua <script>. 

**Tom obrigatório por campo**
- "executiveSummary": 1 parágrafo, tom humano, claro e objetivo. Explique o motivo da nota sem soar acadêmico.
- "companyProfile": texto curto e claro sobre o que a empresa aparenta vender, para quem e com qual proposta.
- "strengths", "weaknesses", "opportunities", "quickWins", "longTermActions", "nextSteps": itens curtos, diretos e fáceis de entender. Evite frases longas.
- "recommendedChannels.description": explique em linguagem comercial simples por que aquele canal faz sentido.
- "recommendedChannels.actions": ações práticas, em tom de orientação direta.
- "diagnosticScores.comment": comentário humano, específico e acionável. Se a nota for menor que 10, termine dizendo o que precisa ser feito para chegar a 10/10.
- Quando o texto de "diagnosticScores.comment", "websiteResearchNote", "instagramResearchNote" ou "recommendedChannels.description" ficar longo, divida em 2 parágrafos curtos para facilitar a leitura.

**REGRA ABSOLUTA: NUNCA INVENTE INFORMAÇÃO**
Esta é a regra mais importante de todo o relatório. Quebre qualquer outra regra antes de quebrar esta.

PROIBIDO INVENTAR (lista exaustiva):
- Número de seguidores, posts, seguindo, curtidas ou qualquer métrica numérica.
- Conteúdo da bio do Instagram. Se "Instagram bio" acima diz "não verificada", o campo "instagramBioExcerpt" DEVE ser "".
- Cores, paleta, identidade visual, estética do feed — SOMENTE se houver captura visual real.
- Funcionalidades, páginas ou seções do site que não foram verificadas.
- Comportamento do link da bio. Se "destino final verificado" diz "não verificado", NÃO diga que leva para WhatsApp, Linktree ou qualquer lugar.
- Tipo de conteúdo dos posts (ex.: "posts com dicas", "fotos de trabalhos"). Só descreva se viu na captura.
- Qualquer afirmação sobre a aparência visual de um canal sem captura.

QUANDO A CAPTURA FALHOU OU NÃO ESTÁ DISPONÍVEL:
- Se "Captura visual do Instagram antes da análise" = "não disponível" E "Instagram bio" = "não verificada" E "Instagram seguidores" = "não verificado":
  -> Escreva explicitamente: "Não foi possível acessar o perfil do Instagram durante a análise automatizada. As informações abaixo são baseadas apenas no que foi possível verificar externamente."
  -> NÃO descreva o feed, a estética, o tipo de conteúdo ou a qualidade visual do perfil.
  -> NÃO invente seguidores, bio ou qualquer dado.
  -> A nota de tópicos relacionados ao Instagram deve refletir essa limitação.
- Se "Captura visual do website antes da análise" = "não disponível":
  -> Escreva: "Não foi possível capturar visualmente o site durante a análise."
  -> NÃO descreva cores, layout, hierarquia visual ou design do site.

QUANDO O INSTAGRAM NÃO FOI INFORMADO:
- Se "Instagram / redes" = "Não informado", isso significa que o lead não tem (ou não forneceu) Instagram.
- Neste caso, a IA PODE e DEVE comentar sobre a ausência de presença no Instagram como um ponto de melhoria.
- Isso é diferente de "o Instagram foi informado mas não conseguimos acessar" — neste caso, não invente dados.

COMO DIFERENCIAR:
- Instagram informado + dados coletados = use os dados reais.
- Instagram informado + coleta falhou = diga que não foi possível verificar, NÃO invente.
- Instagram não informado = comente a ausência como oportunidade de melhoria.

REGRA DE OURO: na dúvida entre afirmar algo e dizer "não verificado", SEMPRE diga "não verificado".

Responda **somente** com um único objeto JSON válido (sem markdown fora do JSON), com esta estrutura:

{
  "executiveSummary": "string",
  "companyProfile": "string",
  "digitalMaturityLevel": "Iniciante" | "Intermediário" | "Avançado",
  "digitalMaturityScore": number (0 a 10, usar casa decimal se necessário),
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
    { "topic": "Posicionamento", "score": number, "comment": "string" }
  ],
  "websiteResearchNote": "string",
  "instagramResearchNote": "string",
  "instagramBioExcerpt": "string",
  "researchNotes": "string (2 parágrafos completos e claros: 1) Website: UX/diagramação/paleta/CTA/SEO/prova social 2) Instagram: bio/linha editorial/engajamento/apelo visual/CTA; sem markdown)",
  "proposalPageHtml": "string — HTML completo do documento"
}

Mínimo 3 canais recomendados. 
No executiveSummary, explique claramente o motivo da nota de maturidade digital em 1 parágrafo único.
Seja específico para "${body.company}".`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
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
    } = body;
    const servicesOffered =
      typeof rawServices === "string" ? rawServices.trim() : "";
    const objective = typeof rawObjective === "string" ? rawObjective.trim() : "";

    if (!leadId || !userId || !name || !company) {
      return NextResponse.json(
        { error: "Dados insuficientes do lead." },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Chave da API Gemini não configurada." },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const normalizedWebsiteUrlRaw = normalizeUrl(websiteUrl);
    const normalizedInstagramUrl = normalizeInstagramUrl(instagramUrl);
    const normalizedWebsiteUrl =
      normalizedWebsiteUrlRaw && !isInstagramDomainUrl(normalizedWebsiteUrlRaw)
        ? normalizedWebsiteUrlRaw
        : undefined;
    console.info("[IG_DEBUG][generate-route] Entrada normalizada.", {
      leadId,
      userId,
      websiteUrl: normalizedWebsiteUrl || null,
      websiteUrlIgnoredAsInstagram:
        Boolean(normalizedWebsiteUrlRaw) && !normalizedWebsiteUrl && isInstagramDomainUrl(normalizedWebsiteUrlRaw),
      instagramUrl: normalizedInstagramUrl || null,
    });
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

    const requestOrigin = req.nextUrl.origin;
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
    const proxiedInstagramRecentPostImageUrl = buildImageProxyUrl(instagramEvidence.recentPostImageUrl);
    const logoImageUrl = normalizedWebsiteUrl
      ? `https://www.google.com/s2/favicons?sz=256&domain_url=${encodeURIComponent(normalizedWebsiteUrl)}`
      : undefined;

    const [externalWebsiteSnapshotUrl, externalInstagramScreenshotUrl, externalInstagramBioLinkSnapshotUrl] =
      await Promise.all([
        resolveScreenshotUrl(normalizedWebsiteUrl, 1400, true, { denyInstagram: true, fullPage: true }),
        normalizedInstagramUrl ? resolveScreenshotUrl(normalizedInstagramUrl, 1200, false) : Promise.resolve(undefined),
        resolveScreenshotUrl(instagramBioLinkTargetUrl, 1400, true, { denyInstagram: true, fullPage: true }),
      ]);

    let siteHeroSnapshotUrl = hasBrowserless
      ? (internalWebsiteSnapshotUrl || externalWebsiteSnapshotUrl)
      : (externalWebsiteSnapshotUrl || internalWebsiteSnapshotUrl);
    const instagramSnapshotCandidates = hasBrowserless
      ? [
          internalInstagramSnapshotUrl,
          proxiedInstagramRecentPostImageUrl,
          proxiedInstagramProfileImageUrl,
          externalInstagramScreenshotUrl,
        ]
      : [
          proxiedInstagramRecentPostImageUrl,
          proxiedInstagramProfileImageUrl,
          externalInstagramScreenshotUrl,
          internalInstagramSnapshotUrl,
        ];
    let instagramSnapshotUrl = instagramSnapshotCandidates.find(Boolean);
    if (siteHeroSnapshotUrl && siteHeroSnapshotUrl === instagramSnapshotUrl) {
      siteHeroSnapshotUrl = undefined;
    }
    let instagramBioLinkSnapshotUrl = hasBrowserless
      ? (internalInstagramBioLinkSnapshotUrl || externalInstagramBioLinkSnapshotUrl)
      : (externalInstagramBioLinkSnapshotUrl || internalInstagramBioLinkSnapshotUrl);
    const instagramProfileImageUrl = proxiedInstagramProfileImageUrl || undefined;

    const websiteCandidateUrls = hasBrowserless
      ? [internalWebsiteSnapshotUrl, externalWebsiteSnapshotUrl]
      : [externalWebsiteSnapshotUrl, internalWebsiteSnapshotUrl];
    const bioLinkCandidateUrls = hasBrowserless
      ? [internalInstagramBioLinkSnapshotUrl, externalInstagramBioLinkSnapshotUrl]
      : [externalInstagramBioLinkSnapshotUrl, internalInstagramBioLinkSnapshotUrl];

    const [websiteDownload, instagramDownload, bioLinkDownload] = await Promise.all([
      downloadFirstAvailableImagePart(requestOrigin, websiteCandidateUrls),
      downloadFirstAvailableImagePart(requestOrigin, instagramSnapshotCandidates),
      downloadFirstAvailableImagePart(requestOrigin, bioLinkCandidateUrls),
    ]);
    const { part: websiteImagePart, selectedUrl: selectedWebsiteSnapshotUrl } = websiteDownload;
    const { part: instagramImagePart, selectedUrl: selectedInstagramSnapshotUrl } = instagramDownload;
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

    const prompt = buildPrompt({
      name,
      email,
      phone,
      company,
      status,
      websiteUrl: normalizedWebsiteUrl,
      instagramUrl: normalizedInstagramUrl,
      servicesOffered,
      objective,
      websiteEvidence,
      instagramEvidence,
      hasWebsiteScreenshot: Boolean(websiteImagePart),
      hasInstagramScreenshot: Boolean(instagramImagePart),
      hasInstagramBioLinkScreenshot: Boolean(instagramBioLinkImagePart),
    });
    const generateContentInput = buildGenerateContentInput(prompt, {
      websiteImagePart,
      instagramImagePart,
      instagramBioLinkImagePart,
    });

    const candidateModels = [
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-flash-latest",
    ];

    let responseText = "";
    let lastError: unknown = null;

    // 1) Tenta com grounding (pesquisa web) nos modelos disponíveis.
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
        const result = await model.generateContent(generateContentInput);
        responseText = result.response.text();
        break;
      } catch (err) {
        lastError = err;
      }
    }

    // 2) Se grounding falhar, tenta sem grounding (mais compatível).
    if (!responseText) {
      for (const modelName of candidateModels) {
        try {
          const model = genAI.getGenerativeModel(
            {
              model: modelName,
            },
            { apiVersion: "v1" }
          );
          const result = await model.generateContent(generateContentInput);
          responseText = result.response.text();
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
      aiData = await repairModelJsonWithGemini(genAI, responseText);
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
    const gatedDiagnosticScores = enrichedDiagnosticScores.map((item) => {
      const topic = item.topic.toLowerCase();
      const isInstagramTopic =
        topic.includes("instagram") ||
        topic.includes("rede") ||
        topic.includes("consistência");
      const isWebsiteTopic = topic.includes("site") || topic.includes("website");
      if (isInstagramTopic && !instagramImagePart) {
        return {
          ...item,
          score: Math.min(item.score, 3),
          comment:
            "Não foi possível analisar visualmente o Instagram porque a captura real não ficou disponível. Recomendado recapturar para uma nota precisa.",
          evidenceImageUrl: undefined,
          evidenceNote: "Sem captura visual real de Instagram nesta execução.",
        };
      }
      if (isWebsiteTopic && !websiteImagePart) {
        return {
          ...item,
          score: Math.min(item.score, 3),
          comment:
            "Não foi possível analisar visualmente o website porque a captura real não ficou disponível. Recomendado recapturar para uma nota precisa.",
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

    const rawMaturityScore = Number(aiData.digitalMaturityScore) || 0;
    const normalizedMaturityScore = rawMaturityScore > 10 ? rawMaturityScore / 10 : rawMaturityScore;
    const defaultScoreText = `${Math.max(
      0,
      Math.min(10, normalizedMaturityScore)
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
        : "não foi possível analisar visualmente o website porque a captura real não ficou disponível."
    );
    const instagramEvidenceNote = instagramImagePart
      ? `${buildInstagramResearchNote(instagramEvidence)} IMPORTANTE: a CAPTURA 2 do Instagram foi enviada — use-a como fonte principal da análise visual. Mesmo com overlay parcial, extraia o que estiver legível.`
      : "não foi possível analisar visualmente o Instagram porque a captura real não ficou disponível.";
    const instagramNote = alignInstagramTextWithEvidence(buildScoredResearchNote(
      "Instagram",
      instagramScoreText,
      sanitizeInstagramAiBody(aiData.instagramResearchNote, instagramEvidence),
      instagramEvidenceNote
    ), instagramEvidence);
    const researchNotes = normalizeResearchNotesText(
      `${websiteNote}\n\n${instagramNote}`
    );

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
        (aiData.digitalMaturityLevel as RotaDigitalReport["digitalMaturityLevel"]) ||
        "Iniciante",
      digitalMaturityScore: (() => {
        const raw = Number(aiData.digitalMaturityScore) || 0;
        const normalized = raw > 10 ? raw / 10 : raw;
        return Math.max(0, Math.min(10, Number(normalized.toFixed(1))));
      })(),
      strengths: (aiData.strengths as string[]) || [],
      weaknesses: (aiData.weaknesses as string[]) || [],
      opportunities: (aiData.opportunities as string[]) || [],
      recommendedChannels:
        (aiData.recommendedChannels as RotaDigitalReport["recommendedChannels"]) ||
        [],
      quickWins: (aiData.quickWins as string[]) || [],
      longTermActions: (aiData.longTermActions as string[]) || [],
      estimatedTimelineMonths: Number(aiData.estimatedTimelineMonths) || 6,
      nextSteps: (aiData.nextSteps as string[]) || [],
      publicSlug,
      proposalHtml,
      brief: {
        websiteUrl: normalizedWebsiteUrl,
        instagramUrl: normalizedInstagramUrl,
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
    };

    const debug = {
      instagram: {
        inputUrl: normalizedInstagramUrl || null,
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
    };
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
