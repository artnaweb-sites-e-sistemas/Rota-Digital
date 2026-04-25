import type { NextRequest } from "next/server";

/**
 * Base URL pública (sem / no fim) para OAuth e redirects.
 * Alinha com o que muitos deploys já têm: `NEXT_PUBLIC_BASE_URL` ou as mesmas de Open Graph.
 */
export function getPublicAppBaseUrlFromEnv(): string | null {
  const pick = (v: string | undefined) => v?.trim().replace(/\/$/, "") || null;
  const fromVercel = process.env.VERCEL_URL?.trim();
  const vercelOrigin =
    fromVercel != null && fromVercel !== ""
      ? `https://${fromVercel.replace(/^https?:\/\//, "")}`.replace(/\/$/, "")
      : null;
  return (
    pick(process.env.NEXT_PUBLIC_BASE_URL) ??
    pick(process.env.NEXT_PUBLIC_SITE_URL) ??
    pick(process.env.NEXT_PUBLIC_APP_URL) ??
    vercelOrigin
  );
}

/** Base URL pública: env (ver `getPublicAppBaseUrlFromEnv`) ou origem do pedido (ex.: localhost no dev). */
export function resolvePublicAppBaseUrl(req: NextRequest): string {
  return getPublicAppBaseUrlFromEnv() ?? getAppOriginFromRequest(req).replace(/\/$/, "");
}

/** Origem pública da app (HTTPS em produção). Usada em redirects Stripe. */
export function getAppOriginFromRequest(req: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return new URL(req.url).origin;
}
