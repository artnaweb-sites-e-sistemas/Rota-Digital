import type { NextRequest } from "next/server";

/** Origem pública da app (HTTPS em produção). Usada em redirects Stripe. */
export function getAppOriginFromRequest(req: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return new URL(req.url).origin;
}
