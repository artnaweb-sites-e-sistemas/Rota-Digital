import { NextRequest, NextResponse } from "next/server";
import { convertImageBufferToWebp } from "@/lib/image-webp";

const ALLOWED_IMAGE_HOSTS = [
  "cdninstagram.com",
  "fbcdn.net",
  "api.microlink.io",
  "iad.microlink.io",
  "google.com",
  "www.google.com",
];

function isAllowedImageUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:") return false;
    const allowedHost = ALLOWED_IMAGE_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`)
    );
    if (!allowedHost) return false;

    // Restringe google.com ao endpoint de favicon para evitar uso indevido do proxy.
    if ((host === "google.com" || host === "www.google.com") && !parsed.pathname.startsWith("/s2/favicons")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");

  if (!target || !isAllowedImageUrl(target)) {
    return new NextResponse("Invalid image URL", { status: 400 });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);

  try {
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (RotaDigitalBot/1.0)",
        Referer: "https://www.instagram.com/",
      },
      signal: ctrl.signal,
      cache: "no-store",
    });

    if (!upstream.ok) {
      return new NextResponse("Upstream image unavailable", { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const converted = await convertImageBufferToWebp(buffer, {
      quality: 74,
      fallbackMimeType: contentType,
    });

    return new NextResponse(Uint8Array.from(converted.buffer), {
      status: 200,
      headers: {
        "Content-Type": converted.mimeType,
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch {
    return new NextResponse("Failed to load image", { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
