import { chromium, type Page } from "playwright";
import os from "os";
import path from "path";
import { promises as fs } from "fs";

import {
  INSTAGRAM_CHROME_UA,
  buildInstagramRequestHeaders,
  getInstagramCookieHeader,
  isInstagramLoginWallBio,
  sanitizeInstagramAssetUrl,
} from "@/lib/instagram-public-profile";

export type PlaywrightInstagramProfile = {
  fullName?: string;
  bio?: string;
  followers?: number;
  following?: number;
  posts?: number;
  bioLinkTitle?: string;
  bioLinkUrl?: string;
  profileImageUrl?: string;
};

export type PlaywrightInstagramCaptureResult = {
  screenshot?: Buffer;
  mimeType?: string;
  profile?: PlaywrightInstagramProfile;
};

type CachedCapture = {
  screenshot?: Buffer;
  mimeType?: string;
  profile?: PlaywrightInstagramProfile;
  expiresAt: number;
};

const captureCache = new Map<string, CachedCapture>();
const captureInFlight = new Map<string, Promise<PlaywrightInstagramCaptureResult | null>>();
const CAPTURE_CACHE_TTL_MS = 10 * 60 * 1000;

function parseCompactNumber(raw: string): number | undefined {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, "").replace(",", ".");
  const suffix = normalized.slice(-1);
  const numberPart = suffix === "k" || suffix === "m" || suffix === "b"
    ? normalized.slice(0, -1)
    : normalized;
  const base = Number(numberPart.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(base)) return undefined;
  const multiplier =
    suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  return Math.round(base * multiplier);
}

function extractMetaContent(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i"
    ),
  ];
  for (const regex of patterns) {
    const value = html.match(regex)?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

function parseFromMetaDescription(description?: string): {
  posts?: number;
  followers?: number;
  following?: number;
} {
  if (!description) return {};
  const compact = description.replace(/\s+/g, " ");
  const posts = compact.match(/([\d.,kmb]+)\s*(?:posts?|publica(?:ç|c)[õo]es)/i)?.[1];
  const followers = compact.match(/([\d.,kmb]+)\s*seguidores?/i)?.[1];
  const following = compact.match(/([\d.,kmb]+)\s*seguindo/i)?.[1];
  return {
    posts: parseCompactNumber(posts || ""),
    followers: parseCompactNumber(followers || ""),
    following: parseCompactNumber(following || ""),
  };
}

function parseNameFromTitle(title?: string): string | undefined {
  if (!title) return undefined;
  return title
    .replace(/\(@[^)]+\)/i, "")
    .replace(/\s*•\s*Instagram.*$/i, "")
    .trim() || undefined;
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function sanitizeBioText(raw?: string): string | undefined {
  if (!raw) return undefined;
  const decoded = decodeBasicHtmlEntities(raw).replace(/\r/g, "").trim();
  if (!decoded || isInstagramLoginWallBio(decoded)) return undefined;
  const noOuterQuotes = decoded.replace(/^"+|"+$/g, "").trim();
  if (
    /\bseguidores?\b/i.test(noOuterQuotes) &&
    /\bposts?\b/i.test(noOuterQuotes) &&
    /\bno instagram\b/i.test(noOuterQuotes)
  ) {
    const colonIndex = noOuterQuotes.indexOf(":");
    if (colonIndex >= 0) {
      const extracted = noOuterQuotes.slice(colonIndex + 1).replace(/^"+|"+$/g, "").trim();
      return extracted || undefined;
    }
    return undefined;
  }
  return noOuterQuotes || undefined;
}

function readBioFromEmbeddedJson(html: string): string | undefined {
  const match = html.match(/"biography"\s*:\s*"([^"]{1,600})"/i);
  if (!match?.[1]) return undefined;
  const unescaped = match[1]
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/");
  return sanitizeBioText(unescaped);
}

function readBioLinkFromEmbeddedJson(html: string): { title?: string; url?: string } {
  const urlHit = html.match(/"bio_links"\s*:\s*\[\s*\{[\s\S]{0,300}?"url"\s*:\s*"([^"]+)"/i)?.[1];
  const titleHit = html.match(/"bio_links"\s*:\s*\[\s*\{[\s\S]{0,300}?"title"\s*:\s*"([^"]*)"/i)?.[1];
  if (!urlHit) return {};
  const decode = (value: string) =>
    value
      .replace(/\\u0026/g, "&")
      .replace(/\\\//g, "/")
      .replace(/\\"/g, '"')
      .trim();
  return {
    title: titleHit ? decode(titleHit) : undefined,
    url: decode(urlHit),
  };
}

function getCachedCapture(handle: string): PlaywrightInstagramCaptureResult | null {
  const cached = captureCache.get(handle);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    captureCache.delete(handle);
    return null;
  }
  return {
    screenshot: cached.screenshot,
    mimeType: cached.mimeType,
    profile: cached.profile,
  };
}

function setCachedCapture(handle: string, result: PlaywrightInstagramCaptureResult): void {
  captureCache.set(handle, {
    screenshot: result.screenshot,
    mimeType: result.mimeType,
    profile: result.profile,
    expiresAt: Date.now() + CAPTURE_CACHE_TTL_MS,
  });
}

function readHeadlessFlag(): boolean {
  const raw = (process.env.INSTAGRAM_PLAYWRIGHT_HEADLESS || "true").toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "no";
}

function getChromeProfileConfig(): { userDataDir: string; profileDirectory?: string } | null {
  const explicitUserDataDir = process.env.CHROME_USER_DATA_DIR?.trim();
  if (explicitUserDataDir) {
    return {
      userDataDir: explicitUserDataDir,
      profileDirectory: process.env.CHROME_PROFILE_DIRECTORY?.trim() || undefined,
    };
  }

  const userProfile = process.env.USERPROFILE?.trim();
  if (!userProfile) return null;

  const defaultUserDataDir = `${userProfile}\\AppData\\Local\\Google\\Chrome\\User Data`;
  return {
    userDataDir: defaultUserDataDir,
    profileDirectory: process.env.CHROME_PROFILE_DIRECTORY?.trim() || "Default",
  };
}

async function copyDirSkippingLockedFiles(
  src: string,
  dest: string
): Promise<{ copied: number; skipped: number }> {
  let copied = 0;
  let skipped = 0;
  await fs.mkdir(dest, { recursive: true });

  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(src, { withFileTypes: true });
  } catch {
    skipped++;
    return { copied, skipped };
  }

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      const skipDirs = ["Cache", "Code Cache", "GPUCache", "DawnCache", "GrShaderCache", "ShaderCache", "Service Worker"];
      if (skipDirs.includes(entry.name)) {
        skipped++;
        continue;
      }
      const sub = await copyDirSkippingLockedFiles(srcPath, destPath);
      copied += sub.copied;
      skipped += sub.skipped;
    } else {
      try {
        await fs.copyFile(srcPath, destPath);
        copied++;
      } catch {
        const isCritical = /Cookies|Login Data|Local State/i.test(entry.name);
        if (isCritical) {
          try {
            const buf = await fs.readFile(srcPath);
            await fs.writeFile(destPath, buf);
            copied++;
            continue;
          } catch { /* still skip */ }
        }
        skipped++;
      }
    }
  }
  return { copied, skipped };
}

async function createEphemeralUserDataDirSnapshot(config: {
  userDataDir: string;
  profileDirectory?: string;
}): Promise<string | null> {
  const profileDirName = config.profileDirectory || "Default";
  const sourceProfilePath = path.join(config.userDataDir, profileDirName);
  const sourceLocalStatePath = path.join(config.userDataDir, "Local State");
  const tempRoot = path.join(os.tmpdir(), `rd-ig-profile-${Date.now()}`);

  try {
    await fs.mkdir(tempRoot, { recursive: true });
    const { copied, skipped } = await copyDirSkippingLockedFiles(
      sourceProfilePath,
      path.join(tempRoot, profileDirName)
    );
    await fs.copyFile(sourceLocalStatePath, path.join(tempRoot, "Local State")).catch(() => undefined);
    console.info("[IG_DEBUG][instagram-playwright] Snapshot do perfil criado.", {
      copied,
      skipped,
    });
    if (copied < 5) {
      await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
      return null;
    }
    return tempRoot;
  } catch (error) {
    console.warn("[IG_DEBUG][instagram-playwright] Falha ao criar snapshot do perfil Chrome.", {
      sourceProfilePath,
      error: error instanceof Error ? error.message : String(error),
    });
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
    return null;
  }
}

function buildProfileFromHtml(html: string): PlaywrightInstagramProfile {
  const description = extractMetaContent(html, "og:description") || extractMetaContent(html, "description");
  const title = extractMetaContent(html, "og:title") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const bioRaw = readBioFromEmbeddedJson(html) || extractMetaContent(html, "description");
  const profileImageUrl = sanitizeInstagramAssetUrl(extractMetaContent(html, "og:image"));
  const counts = parseFromMetaDescription(description);
  const bioLink = readBioLinkFromEmbeddedJson(html);
  return {
    fullName: parseNameFromTitle(title),
    bio: sanitizeBioText(bioRaw),
    followers: counts.followers,
    following: counts.following,
    posts: counts.posts,
    bioLinkTitle: bioLink.title,
    bioLinkUrl: bioLink.url,
    profileImageUrl,
  };
}

function isScreenshotMostlyBlank(pngBuffer: Buffer): boolean {
  // PNG muito pequeno para um viewport 1280x1700 costuma indicar frame vazio.
  return pngBuffer.length < 20_000;
}

function mergeProfiles(
  a: PlaywrightInstagramProfile,
  b: PlaywrightInstagramProfile
): PlaywrightInstagramProfile {
  return {
    fullName: a.fullName || b.fullName,
    bio: a.bio || b.bio,
    followers: a.followers ?? b.followers,
    following: a.following ?? b.following,
    posts: a.posts ?? b.posts,
    bioLinkTitle: a.bioLinkTitle || b.bioLinkTitle,
    bioLinkUrl: a.bioLinkUrl || b.bioLinkUrl,
    profileImageUrl: a.profileImageUrl || b.profileImageUrl,
  };
}

async function waitForInstagramProfileToRender(page: Page, handle: string): Promise<void> {
  await page.waitForFunction(
    (expectedHandle) => {
      const bodyText = (document.body?.innerText || "").toLowerCase();
      const hasHandleInText = bodyText.includes(`@${expectedHandle}`) || bodyText.includes(expectedHandle);
      const imageCount = document.querySelectorAll("img").length;
      const main = document.querySelector("main");
      return Boolean(main) && imageCount >= 2 && hasHandleInText;
    },
    handle,
    { timeout: 15000 }
  ).catch(() => undefined);
}

async function waitForInstagramHighlights(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const labels = ["destaques", "highlights", "stories"];
      const text = (document.body?.innerText || "").toLowerCase();
      const circles = document.querySelectorAll("canvas, [role='button'] img, li img").length;
      const hasLabel = labels.some((label) => text.includes(label));
      return circles >= 6 || hasLabel;
    },
    { timeout: 9000 }
  ).catch(() => undefined);
}

async function captureWithPersistentChrome(handle: string): Promise<PlaywrightInstagramCaptureResult | null> {
  const config = getChromeProfileConfig();
  if (!config) return null;

  const profileUrl = `https://www.instagram.com/${encodeURIComponent(handle)}/`;
  const headless = readHeadlessFlag();
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  let tempUserDataDir: string | null = null;
  try {
    const launchArgs = {
      channel: "chrome" as const,
      headless,
      viewport: { width: 1280, height: 1700 },
      userAgent: INSTAGRAM_CHROME_UA,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        ...(config.profileDirectory ? [`--profile-directory=${config.profileDirectory}`] : []),
      ],
    };

    try {
      context = await chromium.launchPersistentContext(config.userDataDir, launchArgs);
    } catch (firstError) {
      console.warn("[IG_DEBUG][instagram-playwright] Perfil em uso. Tentando snapshot local temporário.", {
        handle,
        error: firstError instanceof Error ? firstError.message : String(firstError),
      });
      tempUserDataDir = await createEphemeralUserDataDirSnapshot(config);
      if (!tempUserDataDir) return null;
      context = await chromium.launchPersistentContext(tempUserDataDir, launchArgs);
    }

    const page = context.pages()[0] || await context.newPage();
    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
    await waitForInstagramProfileToRender(page, handle);
    await waitForInstagramHighlights(page);

    const currentUrl = page.url();
    if (currentUrl.includes("/accounts/login") || currentUrl.includes("/accounts/signup")) {
      return null;
    }

    await dismissInstagramOverlays(page);

    await Promise.race([
      page.waitForLoadState("networkidle"),
      page.waitForTimeout(8000),
    ]).catch(() => undefined);
    await page.waitForTimeout(1000);

    await dismissInstagramOverlays(page);

    const html = await page.content();
    const profile = buildProfileFromHtml(html);
    const screenshot = await page.screenshot({ type: "jpeg", quality: 82, fullPage: true });
    const buf = Buffer.from(screenshot);

    if (isScreenshotMostlyBlank(buf)) {
      console.warn("[IG_DEBUG][instagram-playwright] Screenshot parece estar em branco/preto. Tentando novamente...", { handle });
      await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => undefined);
      await page.waitForTimeout(3000);
      await waitForInstagramProfileToRender(page, handle);
      await waitForInstagramHighlights(page);
      await dismissInstagramOverlays(page);
      await page.waitForTimeout(1000);
      const retryShot = await page.screenshot({ type: "jpeg", quality: 78, fullPage: true });
      const retryBuf = Buffer.from(retryShot);
      const retryHtml = await page.content();
      const retryProfile = buildProfileFromHtml(retryHtml);
      if (isScreenshotMostlyBlank(retryBuf)) {
        return null;
      }
      return { screenshot: retryBuf, mimeType: "image/jpeg", profile: mergeProfiles(profile, retryProfile) };
    }

    return { screenshot: buf, mimeType: "image/jpeg", profile };
  } catch (error) {
    console.warn("[IG_DEBUG][instagram-playwright] Falha na captura via perfil do Chrome.", {
      handle,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    await context?.close().catch(() => undefined);
    if (tempUserDataDir) {
      await fs.rm(tempUserDataDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function captureWithCookieContext(handle: string): Promise<PlaywrightInstagramCaptureResult | null> {
  const profileUrl = `https://www.instagram.com/${encodeURIComponent(handle)}/`;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-sandbox",
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 1700 },
      userAgent: INSTAGRAM_CHROME_UA,
      locale: "pt-BR",
      extraHTTPHeaders: {
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    await context.addCookies([
      { name: "ig_nrcb", value: "1", domain: ".instagram.com", path: "/" },
      { name: "ig_cb", value: "2", domain: ".instagram.com", path: "/" },
    ]);

    const cookieHeader = getInstagramCookieHeader();
    if (cookieHeader) {
      const cookies = cookieHeader
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((pair) => {
          const [name, ...rest] = pair.split("=");
          return {
            name: name.trim(),
            value: rest.join("=").trim(),
            domain: ".instagram.com",
            path: "/",
          };
        });
      await context.addCookies(cookies);
    }

    const page = await context.newPage();
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.includes("/accounts/login") || url.includes("/accounts/signup")) {
        route.abort("blockedbyclient");
        return;
      }
      route.continue();
    });

    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
    await waitForInstagramProfileToRender(page, handle);
    await waitForInstagramHighlights(page);

    const currentUrl = page.url();
    if (currentUrl.includes("/accounts/login") || currentUrl.includes("/accounts/signup")) {
      return null;
    }

    await dismissInstagramOverlays(page);
    await Promise.race([
      page.waitForLoadState("networkidle"),
      page.waitForTimeout(8000),
    ]).catch(() => undefined);
    await page.waitForTimeout(1000);

    await dismissInstagramOverlays(page);

    const html = await page.content();
    const profile = buildProfileFromHtml(html);
    const screenshot = await page.screenshot({ type: "jpeg", quality: 82, fullPage: true });
    const buf = Buffer.from(screenshot);

    if (isScreenshotMostlyBlank(buf)) {
      console.warn("[IG_DEBUG][instagram-playwright] Cookie context: screenshot em branco. Tentando novamente...", { handle });
      await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => undefined);
      await page.waitForTimeout(3000);
      await waitForInstagramProfileToRender(page, handle);
      await waitForInstagramHighlights(page);
      await dismissInstagramOverlays(page);
      await page.waitForTimeout(1000);
      const retryShot = await page.screenshot({ type: "jpeg", quality: 78, fullPage: true });
      const retryBuf = Buffer.from(retryShot);
      const retryHtml = await page.content();
      const retryProfile = buildProfileFromHtml(retryHtml);
      if (isScreenshotMostlyBlank(retryBuf)) {
        return null;
      }
      return { screenshot: retryBuf, mimeType: "image/jpeg", profile: mergeProfiles(profile, retryProfile) };
    }

    return { screenshot: buf, mimeType: "image/jpeg", profile };
  } catch (error) {
    console.warn("[IG_DEBUG][instagram-playwright] Falha na captura via contexto com cookies.", {
      handle,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export async function captureInstagramProfileViaPlaywright(
  handle: string
): Promise<PlaywrightInstagramCaptureResult | null> {
  const normalizedHandle = handle.replace(/^@+/, "").trim().toLowerCase();
  if (!normalizedHandle) return null;
  const cached = getCachedCapture(normalizedHandle);
  if (cached?.screenshot || cached?.profile) {
    return cached;
  }

  const inFlight = captureInFlight.get(normalizedHandle);
  if (inFlight) {
    return inFlight;
  }

  const job = (async (): Promise<PlaywrightInstagramCaptureResult | null> => {
    const persistent = await captureWithPersistentChrome(normalizedHandle);
    if (persistent) {
      console.info("[IG_DEBUG][instagram-playwright] Captura via perfil do Chrome concluída.", {
        handle: normalizedHandle,
        hasBio: Boolean(persistent.profile?.bio),
        followers: persistent.profile?.followers ?? null,
      });
      setCachedCapture(normalizedHandle, persistent);
      return persistent;
    }

    const cookieBased = await captureWithCookieContext(normalizedHandle);
    if (cookieBased) {
      console.info("[IG_DEBUG][instagram-playwright] Captura via contexto com cookies concluída.", {
        handle: normalizedHandle,
        hasBio: Boolean(cookieBased.profile?.bio),
        followers: cookieBased.profile?.followers ?? null,
      });
      setCachedCapture(normalizedHandle, cookieBased);
      return cookieBased;
    }

    return null;
  })();

  captureInFlight.set(normalizedHandle, job);
  try {
    return await job;
  } finally {
    captureInFlight.delete(normalizedHandle);
  }
}

export function buildInstagramPublicHeaders(): Record<string, string> {
  return buildInstagramRequestHeaders({
    "x-ig-app-id": "936619743392459",
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  });
}

async function dismissInstagramOverlays(page: Page): Promise<void> {
  const closeSelectors = [
    "button[aria-label='Fechar']",
    "button[aria-label='Close']",
    "button:has-text('Agora não')",
    "button:has-text('Not now')",
    "button:has-text('Not Now')",
    "button:has-text('Decline')",
    "button:has-text('Recusar')",
    "[role='dialog'] button:has-text('Agora não')",
    "[role='dialog'] button:has-text('Not now')",
    "svg[aria-label='Fechar']",
    "svg[aria-label='Close']",
  ];
  for (let pass = 0; pass < 3; pass += 1) {
    for (const selector of closeSelectors) {
      try {
        const locator = page.locator(selector).first();
        if ((await locator.count()) > 0) {
          await locator.click({ timeout: 900, force: true }).catch(() => undefined);
          await page.waitForTimeout(200);
        }
      } catch {
        // ignora
      }
    }

    await page.evaluate(() => {
    const loginKeywords = [
      "Entrar", "Log in", "Sign up", "Cadastre-se",
      "Criar nova conta", "Not now", "Agora não",
      "Create new account", "Log into", "Sign Up",
    ];

    document.querySelectorAll("[role='dialog'], [role='alertdialog'], [aria-modal='true']").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      el.remove();
    });

    document.querySelectorAll("div, section, aside").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      const style = window.getComputedStyle(el);
      if (style.position !== "fixed") return;
      const zIndex = Number(style.zIndex || "0");
      if (!Number.isFinite(zIndex) || zIndex < 1000) return;
      const rect = el.getBoundingClientRect();
      const coversViewport = rect.width >= window.innerWidth * 0.5 && rect.height >= window.innerHeight * 0.2;
      if (!coversViewport) return;
      const text = (el.textContent || "").slice(0, 3000);
      const hasLoginHint = loginKeywords.some((kw) => text.includes(kw));
      if (hasLoginHint) {
        el.remove();
      }

      // Remove backdrop escuro mesmo sem texto.
      const bg = style.backgroundColor || "";
      const opacity = Number(style.opacity || "1");
      const isTransparentDarkRgba = bg.startsWith("rgba")
        && Number(bg.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)/)?.[1] || "0") >= 0.15;
      const isSolidDarkRgb = bg.startsWith("rgb(")
        && Number(bg.match(/rgb\(\s*(\d+)/)?.[1] || "255") <= 30;
      const hasNoUsefulContent =
        el.querySelectorAll("img, video, article, main").length === 0
        && (el.textContent || "").trim().length < 80;

      if ((isTransparentDarkRgba || isSolidDarkRgb || opacity < 0.95) && hasNoUsefulContent) {
        el.remove();
      }
    });
    });
    await page.waitForTimeout(220);
  }
}
