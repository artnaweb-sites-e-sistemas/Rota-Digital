import type { NextRequest } from "next/server";

import { getSiteOrigin } from "@/lib/report-open-graph";

/**
 * Origem pública para links enviados ao utilizador.
 * 1) Host do pedido (domínio em que o admin está) — inclui domínio próprio na Vercel.
 * 2) `NEXT_PUBLIC_SITE_URL` / `VERCEL_URL` via `getSiteOrigin()` (ex.: cron ou pedidos sem Host).
 */
export function getPublicOriginFromRequest(req: NextRequest): string | null {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = (forwardedHost ?? req.headers.get("host"))?.split(",")[0]?.trim();
  if (host) {
    const forwardedProto = req.headers.get("x-forwarded-proto");
    const defaultProto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
    const proto =
      (forwardedProto ?? defaultProto).split(",")[0]?.trim() || defaultProto;
    return `${proto}://${host}`;
  }

  return getSiteOrigin() ?? null;
}

/**
 * Reescreve o URL `*.firebaseapp.com/__/auth/action?...` para uma rota na nossa app,
 * preservando `mode`, `oobCode`, `apiKey`, etc. O cliente Firebase valida o código na mesma.
 */
export function rewriteFirebaseAuthActionUrlToAppPath(
  firebaseActionUrl: string,
  appOrigin: string,
  appPath: string,
): string {
  const origin = appOrigin.replace(/\/$/, "");
  const path = appPath.startsWith("/") ? appPath : `/${appPath}`;

  let url: URL;
  try {
    url = new URL(firebaseActionUrl);
  } catch {
    return firebaseActionUrl;
  }

  const mode = url.searchParams.get("mode");
  if (mode !== "resetPassword") {
    return firebaseActionUrl;
  }

  return `${origin}${path}${url.search}`;
}
