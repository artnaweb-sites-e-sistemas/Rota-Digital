import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

function bufferToBody(buf: Buffer): Blob {
  return new Blob([Uint8Array.from(buf)]);
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("169.254.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

function normalizePublicUrl(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const parsed = new URL(raw.trim());
    if (!/^https?:$/.test(parsed.protocol)) return undefined;
    if (isPrivateHost(parsed.hostname)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  const url = normalizePublicUrl(rawUrl || undefined);
  if (!url) {
    return new Response("Invalid or private URL", { status: 400 });
  }

  const { captureWebsiteFullPageViaPlaywright } = await import("@/lib/website-playwright");
  const capture = await captureWebsiteFullPageViaPlaywright(url);
  if (!capture?.screenshot) {
    return new Response("Website snapshot unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new Response(bufferToBody(capture.screenshot), {
    status: 200,
    headers: {
      "Content-Type": capture.mimeType || "image/jpeg",
      "Cache-Control": "public, max-age=900, s-maxage=900",
      "X-Snapshot-Final-Url": capture.finalUrl,
    },
  });
}
