/** User-Agent de desktop para reduzir respostas de “login wall” em páginas públicas do Instagram. */
export const INSTAGRAM_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type InstagramCookieEntry = {
  name: string;
  value?: string;
};

const INSTAGRAM_COOKIE_ENV_KEYS: InstagramCookieEntry[] = [
  { name: "sessionid", value: process.env.INSTAGRAM_SESSIONID },
  { name: "csrftoken", value: process.env.INSTAGRAM_CSRFTOKEN },
  { name: "ds_user_id", value: process.env.INSTAGRAM_DS_USER_ID },
  { name: "mid", value: process.env.INSTAGRAM_MID },
  { name: "ig_did", value: process.env.INSTAGRAM_IG_DID },
  { name: "rur", value: process.env.INSTAGRAM_RUR },
];

const INVALID_INSTAGRAM_ASSET_HOSTS = [
  "inflact.com",
  "picuki.com",
  "gramhir.com",
  "dumpor.io",
  "imginn.com",
  "tikvib.com",
  "instapv.io",
];

const INVALID_INSTAGRAM_ASSET_PATH_SNIPPETS = [
  "/static/pages/profile-analyzer/",
  "/images/dumpor-logo",
  "/favicon",
  "info-icon",
  "dumpor-logo",
  "profile-analyzer",
];

/** HTML típico quando o Instagram exige login em vez do perfil público. */
export function isInstagramLoginWallHtml(html: string): boolean {
  const sample = html.slice(0, 100_000).toLowerCase();
  const hasProfileData =
    sample.includes("edge_followed_by") ||
    sample.includes("edge_owner_to_timeline_media") ||
    sample.includes('"biography"');
  if (hasProfileData) return false;

  if (sample.includes("welcome back to instagram")) return true;
  if (sample.includes("sign in to check out what")) return true;
  if (sample.includes("log in to instagram")) return true;
  if (sample.includes("create an account") && sample.includes("log in")) return true;
  if (sample.includes("entrar") && sample.includes("cadastre-se") && !sample.includes("<header"))
    return true;
  return false;
}

/** Meta description / texto que não é bio de perfil. */
export function isInstagramLoginWallBio(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (t.includes("welcome back to instagram")) return true;
  if (t.includes("sign in to check out")) return true;
  if (t.includes("log in to instagram")) return true;
  if (t.includes("create an account") && t.includes("instagram") && t.length < 500) return true;
  return false;
}

export function hasInstagramAuthCookies(): boolean {
  return INSTAGRAM_COOKIE_ENV_KEYS.some((entry) => Boolean(entry.value?.trim()));
}

export function getInstagramCookieHeader(): string | undefined {
  const cookies = INSTAGRAM_COOKIE_ENV_KEYS
    .map((entry) => {
      const value = entry.value?.trim();
      return value ? `${entry.name}=${value}` : "";
    })
    .filter(Boolean);
  return cookies.length > 0 ? cookies.join("; ") : undefined;
}

export function buildInstagramRequestHeaders(
  extraHeaders?: Record<string, string>
): Record<string, string> {
  const cookie = getInstagramCookieHeader();
  return {
    "User-Agent": INSTAGRAM_CHROME_UA,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: "https://www.instagram.com/",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    ...(cookie ? { Cookie: cookie } : {}),
    ...(extraHeaders || {}),
  };
}

/** Cabeçalhos para APIs públicas do Instagram (GraphQL embutido na página). */
export function buildInstagramPublicHeaders(): Record<string, string> {
  return buildInstagramRequestHeaders({
    "x-ig-app-id": "936619743392459",
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  });
}

export function sanitizeInstagramAssetUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return undefined;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (!/^https?:$/.test(parsed.protocol)) return undefined;
    if (INVALID_INSTAGRAM_ASSET_HOSTS.some((candidate) => host.includes(candidate))) {
      return undefined;
    }
    if (
      INVALID_INSTAGRAM_ASSET_PATH_SNIPPETS.some((snippet) => pathname.includes(snippet))
    ) {
      return undefined;
    }

    return parsed.toString();
  } catch {
    return undefined;
  }
}

export async function fetchInstagramPublicPage(
  profileUrl: string
): Promise<{ status: number; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(profileUrl, {
      method: "GET",
      headers: buildInstagramRequestHeaders(),
      signal: ctrl.signal,
      cache: "no-store",
      redirect: "follow",
    });
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}
