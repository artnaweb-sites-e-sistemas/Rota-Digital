import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { getMpAccessToken } from "@/lib/mercadopago-token";
import { resolvePublicAppBaseUrl } from "@/lib/request-origin";

export const runtime = "nodejs";

type CreatePreferenceBody = {
  planName: string;
  /** Valor em centavos (BRL) */
  amount: number;
  maxInstallments?: number;
  proposalId?: string;
  planId?: string;
};

function humanizeMpError(error: unknown): string {
  const defaultMessage = "Não foi possível gerar o link de pagamento agora. Tente novamente em instantes.";
  const raw =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";
  if (!raw) return defaultMessage;

  const msg = raw.toLowerCase();
  if (msg.includes("invalid_token") || msg.includes("unauthorized")) {
    return "Token do Mercado Pago inválido ou expirado. Reconecte sua conta em Configurações > Pagamentos.";
  }
  if (msg.includes("invalid_items")) {
    return "Valor do plano inválido para o Mercado Pago. Revise os valores e tente novamente.";
  }
  return defaultMessage;
}

export async function POST(req: NextRequest) {
  const adminApp = getFirebaseAdminApp();
  if (!adminApp) {
    return NextResponse.json({ error: "Servidor sem Firebase Admin." }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Token ausente." }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await getAuth(adminApp).verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as CreatePreferenceBody;
  const { planName, amount, maxInstallments, proposalId, planId } = body;

  if (!planName || !amount || amount <= 0) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const mpResult = await getMpAccessToken(adminApp, uid);
  if (!mpResult.ok) {
    return NextResponse.json({ error: mpResult.error }, { status: 400 });
  }

  const base = resolvePublicAppBaseUrl(req);
  const externalRef = [proposalId, planId].filter(Boolean).join("_") || undefined;
  const installments = maxInstallments && maxInstallments >= 1 && maxInstallments <= 36
    ? maxInstallments
    : 12;

  const preferenceBody = {
    items: [
      {
        title: planName,
        quantity: 1,
        unit_price: amount / 100,
        currency_id: "BRL",
      },
    ],
    payment_methods: {
      installments,
    },
    back_urls: {
      success: `${base}/dashboard?mp_checkout=success`,
      failure: `${base}/dashboard?mp_checkout=failure`,
      pending: `${base}/dashboard?mp_checkout=pending`,
    },
    auto_return: "approved",
    ...(externalRef ? { external_reference: externalRef } : {}),
  };

  try {
    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mpResult.accessToken}`,
      },
      body: JSON.stringify(preferenceBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[mp-create-preference] Error response:", errText);
      throw new Error(errText);
    }

    const data = (await res.json()) as { init_point?: string; sandbox_init_point?: string };
    const url = data.init_point ?? data.sandbox_init_point;

    if (!url) {
      return NextResponse.json(
        { error: "Mercado Pago não devolveu URL de checkout." },
        { status: 500 },
      );
    }

    return NextResponse.json({ url });
  } catch (e) {
    console.error("[mp-create-preference] Error:", e);
    return NextResponse.json({ error: humanizeMpError(e) }, { status: 500 });
  }
}
