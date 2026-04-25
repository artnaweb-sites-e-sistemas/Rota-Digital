import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { resolvePublicAppBaseUrl } from "@/lib/request-origin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const adminApp = getFirebaseAdminApp();
  if (!adminApp) {
    return NextResponse.json({ error: "Servidor sem Firebase Admin." }, { status: 503 });
  }

  const appId = process.env.MP_APP_ID?.trim();
  if (!appId) {
    return NextResponse.json(
      {
        error:
          "MP_APP_ID não configurado. Crie uma aplicação no painel de desenvolvedores do Mercado Pago e adicione o Application ID no .env ou nas variáveis de ambiente da Vercel.",
      },
      { status: 503 },
    );
  }

  const baseUrl = resolvePublicAppBaseUrl(req);

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Token ausente." }, { status: 401 });
  }

  try {
    await getAuth(adminApp).verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const redirectUri = `${baseUrl}/api/mercadopago/connect/callback`;
  const url = new URL("https://auth.mercadopago.com.br/authorization");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", token);

  return NextResponse.json({ url: url.toString() });
}
