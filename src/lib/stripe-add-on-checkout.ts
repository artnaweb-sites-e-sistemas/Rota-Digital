import type Stripe from "stripe";

import {
  LEAD_CAPTURE_ADD_ON_PACKS,
  type LeadCaptureAddOnPack,
} from "@/lib/lead-capture-config";
import {
  PROPOSALS_ADD_ON_PACKS,
  ROTAS_ADD_ON_PACKS,
  type ProposalsAddOnPack,
  type RotasAddOnPack,
} from "@/lib/plan-quotas";

export type StripeAddOnKind = "lead_capture" | "rotas" | "propostas";

type PackLine =
  | { kind: "lead_capture"; pack: LeadCaptureAddOnPack }
  | { kind: "rotas"; pack: RotasAddOnPack }
  | { kind: "propostas"; pack: ProposalsAddOnPack };

function resolvePack(kind: StripeAddOnKind, packId: string): PackLine | null {
  if (kind === "lead_capture") {
    const pack = LEAD_CAPTURE_ADD_ON_PACKS.find((p) => p.id === packId);
    return pack ? { kind, pack } : null;
  }
  if (kind === "rotas") {
    const pack = ROTAS_ADD_ON_PACKS.find((p) => p.id === packId);
    return pack ? { kind, pack } : null;
  }
  const pack = PROPOSALS_ADD_ON_PACKS.find((p) => p.id === packId);
  return pack ? { kind, pack } : null;
}

function productName(line: PackLine): string {
  if (line.kind === "lead_capture") {
    return `Leads — ${line.pack.label} (+${line.pack.leads})`;
  }
  if (line.kind === "rotas") {
    return `Rotas Digital — ${line.pack.label} (+${line.pack.rotas})`;
  }
  return `Propostas — ${line.pack.label} (+${line.pack.proposals})`;
}

function successCancelPaths(kind: StripeAddOnKind): { success: string; cancel: string } {
  if (kind === "lead_capture") {
    return {
      success: "/dashboard/leads?checkout=success",
      cancel: "/dashboard/leads?checkout=cancel",
    };
  }
  if (kind === "rotas") {
    return {
      success: "/dashboard?checkout=success",
      cancel: "/dashboard?checkout=cancel",
    };
  }
  return {
    success: "/dashboard/propostas?checkout=success",
    cancel: "/dashboard/propostas?checkout=cancel",
  };
}

export async function createAddOnCheckoutSession(params: {
  stripe: Stripe;
  origin: string;
  uid: string;
  email: string | null;
  kind: StripeAddOnKind;
  packId: string;
}): Promise<{ url: string } | { error: string }> {
  const line = resolvePack(params.kind, params.packId);
  if (!line) {
    return { error: "Pacote inválido." };
  }

  const unitAmount = Math.round(line.pack.price * 100);
  if (unitAmount < 50) {
    return { error: "Valor do pacote inválido." };
  }

  const { success, cancel } = successCancelPaths(params.kind);
  const base = params.origin.replace(/\/$/, "");

  const meta = {
    uid: params.uid,
    addOnKind: params.kind,
    packId: line.pack.id,
  };

  try {
    const session = await params.stripe.checkout.sessions.create({
      mode: "payment",
      /** Só BRL; sem seletor USD/BRL (Adaptive Pricing). */
      adaptive_pricing: { enabled: false },
      client_reference_id: params.uid,
      customer_email: params.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: "brl",
            unit_amount: unitAmount,
            product_data: {
              name: productName(line),
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${base}${success}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}${cancel}`,
      metadata: meta,
      payment_intent_data: {
        metadata: meta,
      },
    });

    if (!session.url) {
      return { error: "Stripe não devolveu URL de checkout." };
    }
    return { url: session.url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar sessão Stripe.";
    console.error("[stripe checkout]", e);
    return { error: msg };
  }
}
