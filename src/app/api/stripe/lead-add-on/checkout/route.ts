import { NextRequest, NextResponse } from "next/server";

import { LEAD_CAPTURE_ADD_ON_PACKS } from "@/lib/lead-capture-config";
import { runStripeAddOnCheckout } from "@/lib/stripe-run-add-on-checkout";
import { getStripe } from "@/lib/stripe-server";

export const runtime = "nodejs";

/**
 * Cria sessão de checkout Stripe para pacote extra de leads.
 * Requer `STRIPE_SECRET_KEY` e webhook `checkout.session.*` para creditar `leadCaptureMonthlyLimit`.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { packId?: string };
  const packId = typeof body.packId === "string" ? body.packId.trim() : "";
  const pack = LEAD_CAPTURE_ADD_ON_PACKS.find((p) => p.id === packId);
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
        leads: pack.leads,
        price: pack.price,
        message:
          "Configure STRIPE_SECRET_KEY no ambiente do servidor e o endpoint de webhook `/api/stripe/webhook` com STRIPE_WEBHOOK_SECRET.",
      },
      { status: 503 },
    );
  }

  return runStripeAddOnCheckout(req, "lead_capture", packId);
}
