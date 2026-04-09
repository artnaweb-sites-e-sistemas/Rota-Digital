import { chromium, type Page, type Browser } from "playwright";

type WebsiteCaptureResult = {
  screenshot: Buffer;
  mimeType: string;
  finalUrl: string;
};

type CachedWebsiteCapture = WebsiteCaptureResult & {
  expiresAt: number;
};

const websiteCaptureCache = new Map<string, CachedWebsiteCapture>();
const websiteCaptureInFlight = new Map<string, Promise<WebsiteCaptureResult | null>>();
const WEBSITE_CAPTURE_CACHE_TTL_MS = 15 * 60 * 1000;

function getCachedWebsiteCapture(url: string): WebsiteCaptureResult | null {
  const hit = websiteCaptureCache.get(url);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    websiteCaptureCache.delete(url);
    return null;
  }
  return {
    screenshot: hit.screenshot,
    mimeType: hit.mimeType,
    finalUrl: hit.finalUrl,
  };
}

function setCachedWebsiteCapture(url: string, result: WebsiteCaptureResult): void {
  websiteCaptureCache.set(url, {
    ...result,
    expiresAt: Date.now() + WEBSITE_CAPTURE_CACHE_TTL_MS,
  });
}

async function dismissCommonBanners(page: Page): Promise<void> {
  const selectors = [
    "button:has-text('Aceitar')",
    "button:has-text('Accept')",
    "button:has-text('Concordo')",
    "button:has-text('Entendi')",
    "button:has-text('Continuar')",
    "button[aria-label='Fechar']",
    "button[aria-label='Close']",
    "[id*='cookie'] button",
    "[class*='cookie'] button",
  ];

  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0) {
        await locator.click({ timeout: 500, force: true }).catch(() => undefined);
      }
    } catch {
      // ignora
    }
  }
}

async function takeWebsiteScreenshot(page: Page): Promise<{ screenshot: Buffer; mimeType: string }> {
  const jpeg80 = Buffer.from(
    await page.screenshot({
      type: "jpeg",
      quality: 80,
      fullPage: true,
    })
  );
  if (jpeg80.length <= 4 * 1024 * 1024) {
    return { screenshot: jpeg80, mimeType: "image/jpeg" };
  }

  const jpeg65 = Buffer.from(
    await page.screenshot({
      type: "jpeg",
      quality: 65,
      fullPage: true,
    })
  );
  return { screenshot: jpeg65, mimeType: "image/jpeg" };
}

function getBrowserlessWsEndpoint(): string | undefined {
  const token = process.env.BROWSERLESS_API_KEY?.trim();
  if (!token) return undefined;
  return `wss://production-sfo.browserless.io?token=${token}`;
}

async function connectBrowser(): Promise<Browser> {
  const wsEndpoint = getBrowserlessWsEndpoint();
  if (wsEndpoint) {
    console.info("[website-playwright] Conectando via Browserless.");
    return chromium.connectOverCDP(wsEndpoint);
  }
  console.info("[website-playwright] Lançando Chromium local.");
  return chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });
}

export async function captureWebsiteFullPageViaPlaywright(
  url: string
): Promise<WebsiteCaptureResult | null> {
  const cached = getCachedWebsiteCapture(url);
  if (cached) return cached;

  const inFlight = websiteCaptureInFlight.get(url);
  if (inFlight) return inFlight;

  const job = (async (): Promise<WebsiteCaptureResult | null> => {
    let browser: Browser | undefined;
    try {
      browser = await connectBrowser();
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1900 },
        locale: "pt-BR",
      });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await Promise.race([page.waitForLoadState("networkidle"), page.waitForTimeout(9000)]).catch(() => undefined);
      await dismissCommonBanners(page);
      await page.waitForTimeout(1000);
      const shot = await takeWebsiteScreenshot(page);
      const result: WebsiteCaptureResult = {
        screenshot: shot.screenshot,
        mimeType: shot.mimeType,
        finalUrl: page.url(),
      };
      setCachedWebsiteCapture(url, result);
      return result;
    } catch (error) {
      console.warn("[website-playwright] Falha na captura full-page.", {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      await browser?.close().catch(() => undefined);
    }
  })();

  websiteCaptureInFlight.set(url, job);
  try {
    return await job;
  } finally {
    websiteCaptureInFlight.delete(url);
  }
}
