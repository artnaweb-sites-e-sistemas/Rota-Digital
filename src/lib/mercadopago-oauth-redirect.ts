import type { NextRequest } from "next/server";
import { resolvePublicAppBaseUrl } from "@/lib/request-origin";

/**
 * URL de callback do OAuth. Deve ser idêntica no authorize e no token exchange.
 * Defina `MP_OAUTH_REDIRECT_URI` (ex.: https://www.routlab.com.br/api/mercadopago/connect/callback)
 * se o painel do MP tiver somente o host com `www` e a app resolver outro host.
 */
export function getMercadoPagoOAuthRedirectUri(req: NextRequest): string {
  const fromEnv = process.env.MP_OAUTH_REDIRECT_URI?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  const base = resolvePublicAppBaseUrl(req);
  return `${base}/api/mercadopago/connect/callback`;
}
