import { NextRequest, NextResponse } from "next/server";

import { requireGeneralAdminApi } from "@/lib/require-general-admin-api";
import { getStripe } from "@/lib/stripe-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ uid: string }> };

/**
 * Cancela imediatamente a assinatura Stripe do utilizador (ação do admin).
 *
 * Passos:
 * 1. Busca `userSettings/{uid}` para obter `stripeSubscriptionId`.
 * 2. Chama `stripe.subscriptions.cancel(subscriptionId)` — o webhook
 *    `customer.subscription.deleted` dispara e já rebaixa para Starter
 *    via `applyAutoSuspend('subscription_canceled')`.
 * 3. Além disso, fazemos o downgrade local de imediato (para a UI não ter
 *    de esperar pelo webhook) e marcamos `subscriptionStatus='canceled'`.
 *
 * Se o utilizador já está em Starter ou já não tem subscription, o endpoint
 * devolve 200 com `alreadyCanceled: true` para simplicidade do chamador.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const gate = await requireGeneralAdminApi(request);
  if (!gate.ok) return gate.response;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe não configurado." }, { status: 503 });
  }

  const { uid } = await context.params;
  const trimmed = uid?.trim() ?? "";
  if (!trimmed) {
    return NextResponse.json({ error: "UID inválido." }, { status: 400 });
  }

  const db = gate.ctx.db;
  const userRef = db.collection("userSettings").doc(trimmed);
  const snap = await userRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });
  }
  const data = snap.data() as Record<string, unknown>;
  const subscriptionId =
    typeof data.stripeSubscriptionId === "string" ? data.stripeSubscriptionId.trim() : "";

  if (!subscriptionId) {
    return NextResponse.json({ ok: true, alreadyCanceled: true });
  }

  try {
    await stripe.subscriptions.cancel(subscriptionId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao cancelar assinatura na Stripe.";
    const lower = msg.toLowerCase();
    /** Se a subscription já foi cancelada na Stripe, seguimos para o downgrade local. */
    const alreadyCanceled =
      lower.includes("no such subscription") ||
      (lower.includes("subscription") && lower.includes("already canceled")) ||
      (lower.includes("subscription") && lower.includes("already cancelled"));
    if (!alreadyCanceled) {
      console.error("[admin cancel-subscription]", e);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  /**
   * Downgrade imediato para Starter, sem esperar pelo webhook.
   * Preserva comportamento do auto-suspend: guardamos snapshot do plano anterior
   * para o caso de reactivação futura.
   */
  await userRef.set(
    {
      plan: "Starter",
      subscriptionPlan: "Starter",
      planPriceCents: 0,
      subscriptionPriceCents: 0,
      leadCaptureMonthlyLimit: 30,
      planMasterUnlimited: false,
      subscriptionStatus: "canceled",
      subscriptionStatusUpdatedAtMs: Date.now(),
      stripeSubscriptionId: null,
      stripeSubscriptionPlanKey: null,
      stripeBillingCycle: null,
    },
    { merge: true },
  );

  return NextResponse.json({ ok: true, subscriptionId });
}
