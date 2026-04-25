import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { getStripe } from "@/lib/stripe-server";
import { resolvePublicAppBaseUrl } from "@/lib/request-origin";

export const runtime = "nodejs";

type CreateCheckoutSessionBody = {
  accountId: string;
  planName: string;
  amount: number;
  /** Metadados opcionais para conciliação */
  proposalId?: string;
  planId?: string;
};

function humanizeStripeError(error: unknown): string {
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
  if (msg.includes("no valid payment method types")) {
    return "A conta Stripe conectada não tem métodos de pagamento ativos para BRL. Na Stripe da conta conectada, ative ao menos um método (cartão, Pix ou boleto) em Configurações > Métodos de pagamento e tente novamente.";
  }
  if (msg.includes("invalid request: invalid redirect uri")) {
    return "A URL de retorno do Stripe está diferente da configurada no Connect. Verifique se a URI de callback da aplicação Connect corresponde exatamente ao domínio em produção.";
  }
  if (msg.includes("invalid integer")) {
    return "Valor de pagamento inválido para criar o link. Revise os valores do plano e tente novamente.";
  }

  return defaultMessage;
}

export async function POST(req: NextRequest) {
  const adminApp = getFirebaseAdminApp();
  if (!adminApp) {
    return NextResponse.json({ error: "Servidor sem Firebase Admin." }, { status: 503 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe não configurado." }, { status: 503 });
  }

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

  const body = (await req.json().catch(() => ({}))) as CreateCheckoutSessionBody;
  const { accountId, planName, amount, proposalId, planId } = body;

  if (!accountId || !planName || !amount || amount <= 0) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const base = resolvePublicAppBaseUrl(req);
  const meta: Record<string, string> = {};
  if (proposalId) meta.rota_proposalId = proposalId;
  if (planId) meta.rota_planId = planId;

  const requestOptions: Stripe.RequestOptions = { stripeAccount: accountId };

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        adaptive_pricing: { enabled: false },
        locale: "pt-BR",
        line_items: [
          {
            price_data: {
              currency: "brl",
              unit_amount: amount,
              product_data: { name: planName },
            },
            quantity: 1,
          },
        ],
        payment_method_types: ["card"],
        success_url: `${base}/dashboard?spot_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/dashboard?spot_checkout=cancel`,
        metadata: Object.keys(meta).length ? meta : undefined,
        payment_intent_data:
          Object.keys(meta).length > 0
            ? {
                metadata: meta,
              }
            : undefined,
        payment_method_options: {
          card: {
            installments: {
              enabled: true,
            },
          },
        },
      },
      requestOptions,
    );

    if (!session.url) {
      return NextResponse.json({ error: "Stripe não devolveu URL de checkout." }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[create-checkout-session] Error:", e);
    return NextResponse.json({ error: humanizeStripeError(e) }, { status: 500 });
  }
}
