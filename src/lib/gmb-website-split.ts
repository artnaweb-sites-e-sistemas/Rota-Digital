/**
 * Classificação de URLs do GMB / cadastro: site próprio vs. Instagram vs. redes/mensagens
 * (não contam como “site da empresa” para ranking, coluna “Tem site” ou ícone globo).
 */

/** Host exato (sem www.) que nunca é considerado site próprio. */
const NON_COMPANY_SITE_HOSTS_EXACT = new Set<string>([
  "instagram.com",
  "instagr.am",
  "facebook.com",
  "fb.com",
  "m.facebook.com",
  "l.facebook.com",
  "lm.facebook.com",
  "m.me",
  "fb.watch",
  "wa.me",
  "api.whatsapp.com",
  "web.whatsapp.com",
  "chat.whatsapp.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "snapchat.com",
  "pinterest.com",
  "threads.net",
  "telegram.me",
  "t.me",
  "linktr.ee",
  "linktree.com",
  "beacons.ai",
  "bio.link",
  "carrd.co",
  "taplink.cc",
  "goo.gl",
  "maps.app.goo.gl",
  "g.co",
  "business.google.com",
  /** Encurtadores — não são site próprio da empresa. */
  "bit.ly",
  "bitly.com",
  "tinyurl.com",
  "tiny.one",
  "ow.ly",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "t.co",
  "rb.gy",
  "is.gd",
  "short.link",
]);

function normalizedHost(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function isInstagramHost(hostNorm: string): boolean {
  return hostNorm === "instagram.com" || hostNorm === "instagr.am" || hostNorm.endsWith(".instagram.com");
}

/** Rede / mensagem / agregador / Maps curto — não é site da empresa. */
export function isNonCompanyWebsiteHost(hostname: string): boolean {
  const h = normalizedHost(hostname);
  if (NON_COMPANY_SITE_HOSTS_EXACT.has(h)) return true;
  if (isInstagramHost(h)) return true;
  if (h.endsWith(".facebook.com") || h.endsWith(".tiktok.com")) return true;
  if (h.startsWith("maps.") && h.endsWith("google.com")) return true;
  if (h.endsWith(".bit.ly")) return true;
  return false;
}

function urlIsNonCompanyWebsite(url: URL): boolean {
  if (isNonCompanyWebsiteHost(url.hostname)) return true;
  const h = normalizedHost(url.hostname);
  if (h === "google.com" && url.pathname.toLowerCase().startsWith("/maps")) return true;
  return false;
}

/**
 * O GMB / Places devolve um único `websiteUri`.
 * - instagram.com → `instagram`
 * - facebook, wa.me, TikTok, link-in-bio, Maps curto, etc. → descartado (não é site nem Instagram útil aqui)
 * - demais → `website` (site próprio presumido)
 */
export function splitWebsiteUriForSnapshot(uri: string | undefined): {
  website?: string;
  instagram?: string;
} {
  const raw = typeof uri === "string" ? uri.trim() : "";
  if (!raw) return {};

  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(withProto);
    const hostNorm = normalizedHost(url.hostname);

    if (isInstagramHost(hostNorm)) {
      return { instagram: withProto };
    }
    if (urlIsNonCompanyWebsite(url)) {
      return {};
    }
    return { website: withProto };
  } catch {
    const lower = raw.toLowerCase();
    if (lower.includes("instagram.com") || lower.includes("instagr.am")) return { instagram: withProto };
    if (
      lower.includes("facebook.com") ||
      lower.includes("fb.com") ||
      lower.includes("wa.me") ||
      lower.includes("whatsapp.com") ||
      lower.includes("tiktok.com") ||
      lower.includes("linkedin.com/") ||
      lower.includes("youtube.com") ||
      lower.includes("youtu.be") ||
      lower.includes("linktr.ee") ||
      lower.includes("linktree.com") ||
      lower.includes("bit.ly") ||
      lower.includes("bitly.com") ||
      lower.includes("tinyurl.com") ||
      lower.includes("ow.ly") ||
      lower.includes("buff.ly")
    ) {
      return {};
    }
    return { website: withProto };
  }
}

export function hasPublicWebPresence(website?: string, instagram?: string): boolean {
  return Boolean(website?.trim() || instagram?.trim());
}

/**
 * Reaplica `split` ao gravado no Firestore (ex.: bit.ly antigo no campo `website`)
 * para coluna “Tem site”, ícones e `hasWebPresence`.
 */
export function normalizeListingUrlsForDisplay(
  website?: string,
  instagram?: string,
): { websiteUrl?: string; instagramUrl?: string; hasWebPresence: boolean } {
  const splitFromSite = splitWebsiteUriForSnapshot(website);
  const ig =
    (typeof instagram === "string" ? instagram.trim() : "") ||
    splitFromSite.instagram?.trim() ||
    undefined;
  const w = splitFromSite.website?.trim() || undefined;
  return {
    websiteUrl: w || undefined,
    instagramUrl: ig || undefined,
    hasWebPresence: hasPublicWebPresence(w, ig),
  };
}

/**
 * Normaliza URLs do brief do lead: campo “site” pode trazer Instagram, Facebook ou wa.me;
 * só `websiteUrl` de saída é site próprio; Instagram vem do campo Instagram ou detectado no campo site.
 */
export function normalizeLeadBriefUrls(args: {
  websiteUrl?: string;
  instagramUrl?: string;
}): { websiteUrl?: string; instagramUrl?: string } {
  const siteRaw = args.websiteUrl?.trim();
  const igRaw = args.instagramUrl?.trim();

  let website: string | undefined;
  let instagram: string | undefined;

  if (igRaw) {
    const s = splitWebsiteUriForSnapshot(igRaw);
    if (s.instagram) instagram = s.instagram;
  }

  if (siteRaw) {
    const s = splitWebsiteUriForSnapshot(siteRaw);
    if (s.instagram) {
      if (!instagram) instagram = s.instagram;
    } else if (s.website) {
      website = s.website;
    }
  }

  return {
    websiteUrl: website,
    instagramUrl: instagram,
  };
}
