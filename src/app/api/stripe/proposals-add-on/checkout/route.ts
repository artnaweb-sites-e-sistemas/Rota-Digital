import { NextRequest, NextResponse } from "next/server";

import { PROPOSALS_ADD_ON_PACKS } from "@/lib/plan-quotas";
import { runStripeAddOnCheckout } from "@/lib/stripe-run-add-on-checkout";
import { getStripe } from "@/lib/stripe-server";

export const runtime = "nodejs";

/**
 * Cria sessão de checkout Stripe para pacote extra de propostas.
 * Credita `propostasQuotaBonus` no webhook.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { packId?: string };
  const packId = typeof body.packId === "string" ? body.packId.trim() : "";
  const pack = PROPOSALS_ADD_ON_PACKS.find((p) => p.id === packId);
  if (!pack) {
    return NextResponse.json({ error: "Pacote inválido." }, { status: 400 });
  }

  if (!getStripe()) {
    return NextResponse.json(
      {
        ok: false,
        setupRequired: true,
        packId: pack.id,
        label: pack.label,
        proposals: pack.proposals,
        price: pack.price,
        message:
          "Configure STRIPE_SECRET_KEY e o webhook `/api/stripe/webhook` com STRIPE_WEBHOOK_SECRET para creditar propostas extras.",
      },
      { status: 503 },
    );
  }

  return runStripeAddOnCheckout(req, "propostas", packId);
}
