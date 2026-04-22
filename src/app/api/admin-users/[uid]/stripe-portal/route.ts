import { NextRequest, NextResponse } from "next/server";

import { requireGeneralAdminApi } from "@/lib/require-general-admin-api";
import { getStripe } from "@/lib/stripe-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ uid: string }> };

/**
 * Cria uma sessão do **Stripe Customer Portal** para o utilizador indicado e
 * devolve o URL para o admin abrir (gere cartão, cancela, vê faturas, etc.).
 * Requer `userSettings.stripeCustomerId` preenchido.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const gate = await requireGeneralAdminApi(request);
  if (!gate.ok) return gate.response;

  const { uid } = await context.params;
  if (!uid?.trim()) {
    return NextResponse.json({ error: "UID inválido." }, { status: 400 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe não configurado no servidor (`STRIPE_SECRET_KEY`)." },
      { status: 503 },
    );
  }

  const snap = await gate.ctx.db.collection("userSettings").doc(uid.trim()).get();
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
  const customerId =
    typeof data.stripeCustomerId === "string" && data.stripeCustomerId.trim()
      ? data.stripeCustomerId.trim()
      : null;
  if (!customerId) {
    return NextResponse.json(
      { error: "Este utilizador ainda não tem um cliente Stripe associado (sem stripeCustomerId)." },
      { status: 404 },
    );
  }

  const origin = request.nextUrl.origin;
  const returnUrl = `${origin}/dashboard/usuarios/${encodeURIComponent(uid.trim())}`;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    if (!session.url) {
      return NextResponse.json({ error: "Stripe não devolveu URL do portal." }, { status: 502 });
    }
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao abrir portal Stripe.";
    console.error("[admin-users stripe-portal]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
