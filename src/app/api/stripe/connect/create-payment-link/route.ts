import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { getStripe } from "@/lib/stripe-server";

export const runtime = "nodejs";

type CreatePaymentLinkBody = {
  accountId: string;
  planName: string;
  amount: number;
  currency?: string;
  installments?: number;
  discountAmount?: number;
};

async function createLink(
  stripe: Stripe,
  accountId: string,
  name: string,
  amountCents: number,
  installments?: number,
) {
  const product = await stripe.products.create(
    { name },
    { stripeAccount: accountId },
  );

  const price = await stripe.prices.create(
    {
      product: product.id,
      unit_amount: amountCents,
      currency: "brl",
    },
    { stripeAccount: accountId },
  );

  const lineItems: Stripe.PaymentLinkCreateParams.LineItem[] = [
    { price: price.id, quantity: 1 },
  ];
  const requestOptions: Stripe.RequestOptions = { stripeAccount: accountId };

  // Payment Link `create` only allows a small subset in `payment_intent_data` (metadata, capture_method, etc.).
  // Não suporta `payment_method_options` — a API devolve "unknown parameter" se enviarmos.
  // Parcelas no cartão (BR) seguem a configuração da conta conectada no Dashboard Stripe.
  const params: Stripe.PaymentLinkCreateParams =
    installments && installments > 1
      ? { line_items: lineItems, payment_method_types: ["card"] }
      : { line_items: lineItems };

  const paymentLink = await stripe.paymentLinks.create(params, requestOptions);
  return paymentLink.url;
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

  const body = (await req.json().catch(() => ({}))) as CreatePaymentLinkBody;
  const { accountId, planName, amount, installments, discountAmount } = body;

  if (!accountId || !planName || !amount || amount <= 0) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  try {
    const url = await createLink(
      stripe,
      accountId,
      planName,
      amount,
      installments,
    );

    let urlDiscount: string | undefined;
    if (discountAmount && discountAmount > 0 && discountAmount < amount) {
      urlDiscount = await createLink(
        stripe,
        accountId,
        `${planName} (à vista com desconto)`,
        discountAmount,
      );
    }

    return NextResponse.json({ url, urlDiscount });
  } catch (e) {
    console.error("[create-payment-link] Error:", e);
    const message = e instanceof Error ? e.message : "Erro ao criar link de pagamento.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
