import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { requireGeneralAdminApi } from "@/lib/require-general-admin-api";
import { recordStripeChargeRefunded } from "@/lib/stripe-record-refund";
import { getStripe } from "@/lib/stripe-server";
import type { StoredStripeInvoice } from "@/types/stripe-invoice";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ uid: string; invoiceId: string }> };

type RefundRequestBody = {
  /** Valor a reembolsar em centavos. Se omitido, reembolsa o total ainda disponível. */
  amountCents?: number;
  /** Motivo Stripe: `duplicate | fraudulent | requested_by_customer`. */
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
};

function isValidReason(v: unknown): v is RefundRequestBody["reason"] {
  return (
    typeof v === "string" &&
    (v === "duplicate" || v === "fraudulent" || v === "requested_by_customer")
  );
}

/** Converte a mensagem crua da API Stripe (EN) em texto útil em PT. */
function stripeErrorToUserMessage(raw: string): string {
  const t = raw.toLowerCase();
  if (
    t.includes("test mode") &&
    (t.includes("live mode") || t.includes("similar object exists in live") || t.includes("live key"))
  ) {
    return "A chave STRIPE_SECRET_KEY deste servidor está em ambiente de teste, mas esta fatura/cobrança é de produção (ou o contrário). O estorno tem de ser pedido com a mesma chave (sk_test… ou sk_live…) que originou o pagamento. No painel de deploy (ex.: Vercel), ajusta STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET para o ambiente correcto e volta a tentar.";
  }
  if (t.includes("live mode") && t.includes("test key") && t.includes("similar object")) {
    return "A fatura existe em produção na Stripe, mas a API usou chave de teste. Coloca a chave live (sk_live…) em STRIPE_SECRET_KEY no ambiente do servidor e tenta de novo.";
  }
  return raw;
}

/**
 * Reembolso (parcial ou total) de uma fatura Stripe, iniciado pelo admin.
 *
 * Fluxo:
 * 1. Valida admin + URLs (uid + invoiceId).
 * 2. Busca fatura no Firestore e pede o Charge associado na Stripe.
 * 3. Calcula montante restante disponível para refund (`amountPaid - refundedCents`).
 * 4. Chama `stripe.refunds.create` com `charge` + `amount` + `reason`.
 * 5. Reconcilia localmente via `recordStripeChargeRefunded` (sem esperar o webhook),
 *    para que a UI e os agregados fiquem actualizados de imediato. O webhook que chegar
 *    a seguir será idempotente (mesmo `refundId`).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const gate = await requireGeneralAdminApi(request);
  if (!gate.ok) return gate.response;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe não configurado." }, { status: 503 });
  }

  const { uid, invoiceId } = await context.params;
  if (!uid?.trim() || !invoiceId?.trim()) {
    return NextResponse.json({ error: "UID ou invoiceId inválidos." }, { status: 400 });
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido." }, { status: 400 });
  }
  const payload = (body ?? {}) as RefundRequestBody;

  const invoiceRef = gate.ctx.db.collection("stripeInvoices").doc(invoiceId.trim());
  const invoiceSnap = await invoiceRef.get();
  if (!invoiceSnap.exists) {
    return NextResponse.json({ error: "Fatura não encontrada." }, { status: 404 });
  }
  const stored = invoiceSnap.data() as StoredStripeInvoice;
  if (stored.uid && stored.uid !== uid.trim()) {
    return NextResponse.json(
      { error: "Fatura não pertence a este utilizador." },
      { status: 400 },
    );
  }

  const amountPaid = typeof stored.amountPaidCents === "number" ? stored.amountPaidCents : 0;
  const refundedSoFar = typeof stored.refundedCents === "number" ? stored.refundedCents : 0;
  const remaining = Math.max(0, amountPaid - refundedSoFar);
  if (remaining <= 0) {
    return NextResponse.json(
      { error: "Fatura já foi totalmente reembolsada." },
      { status: 409 },
    );
  }

  let amountCents: number = remaining;
  if (payload.amountCents != null) {
    const raw = Number(payload.amountCents);
    if (!Number.isFinite(raw) || raw <= 0 || !Number.isInteger(raw)) {
      return NextResponse.json(
        { error: "`amountCents` deve ser inteiro positivo em centavos." },
        { status: 400 },
      );
    }
    if (raw > remaining) {
      return NextResponse.json(
        {
          error: "`amountCents` excede o montante reembolsável.",
          remainingCents: remaining,
        },
        { status: 400 },
      );
    }
    amountCents = raw;
  }

  const reason = payload.reason;
  if (payload.reason != null && !isValidReason(payload.reason)) {
    return NextResponse.json(
      { error: "`reason` inválido (use duplicate | fraudulent | requested_by_customer)." },
      { status: 400 },
    );
  }

  /**
   * Localiza o Charge associado:
   * 1. Se o documento tem `stripeChargeId` gravado (add-on sintético OU fatura enriquecida),
   *    usa directamente — evita chamar `stripe.invoices.retrieve(cs_...)` que dá 404.
   * 2. Senão, faz fallback para `stripe.invoices.retrieve` e extrai via `invoice.charge`
   *    ou `payment_intent.latest_charge`.
   * 3. Último recurso: `stripePaymentIntentId` gravado + `paymentIntents.retrieve`.
   */
  let chargeId: string | null =
    typeof stored.stripeChargeId === "string" && stored.stripeChargeId.trim()
      ? stored.stripeChargeId.trim()
      : null;

  const isSyntheticDoc = invoiceId.trim().startsWith("cs_");

  if (!chargeId && !isSyntheticDoc) {
    let invoice: Stripe.Invoice;
    try {
      invoice = await stripe.invoices.retrieve(invoiceId.trim(), {
        expand: ["charge", "payment_intent", "payments.data.payment.payment_intent"],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fatura inacessível na Stripe.";
      return NextResponse.json({ error: stripeErrorToUserMessage(msg) }, { status: 502 });
    }

    const asUnknown = invoice as unknown as {
      charge?: string | { id?: string } | null;
      payment_intent?: string | { latest_charge?: string | { id?: string } | null } | null;
      payments?: {
        data?: Array<{
          payment?: {
            payment_intent?:
              | string
              | { id?: string; latest_charge?: string | { id?: string } | null }
              | null;
            charge?: string | { id?: string } | null;
          } | null;
        }>;
      } | null;
    };
    if (typeof asUnknown.charge === "string") chargeId = asUnknown.charge;
    else if (asUnknown.charge && typeof asUnknown.charge === "object" && asUnknown.charge.id)
      chargeId = asUnknown.charge.id;

    if (!chargeId) {
      const pi = asUnknown.payment_intent;
      if (pi && typeof pi === "object") {
        const lc = pi.latest_charge;
        if (typeof lc === "string") chargeId = lc;
        else if (lc && typeof lc === "object" && lc.id) chargeId = lc.id;
      } else if (typeof pi === "string") {
        try {
          const piObj = await stripe.paymentIntents.retrieve(pi);
          const lc = (piObj as unknown as { latest_charge?: string | { id?: string } | null })
            .latest_charge;
          if (typeof lc === "string") chargeId = lc;
          else if (lc && typeof lc === "object" && lc.id) chargeId = lc.id;
        } catch {
          /** ignore: falha a resolver PI mas segue sem charge */
        }
      }
    }

    /** API 2025+: o Charge sai em `invoice.payments.data[].payment.payment_intent.latest_charge`. */
    if (!chargeId) {
      const entries = asUnknown.payments?.data ?? [];
      for (const entry of entries) {
        const payment = entry?.payment;
        if (!payment) continue;
        if (typeof payment.charge === "string") {
          chargeId = payment.charge;
          break;
        }
        if (payment.charge && typeof payment.charge === "object" && payment.charge.id) {
          chargeId = payment.charge.id;
          break;
        }
        const pp = payment.payment_intent;
        if (pp && typeof pp === "object") {
          const lc = pp.latest_charge;
          if (typeof lc === "string") {
            chargeId = lc;
            break;
          }
          if (lc && typeof lc === "object" && lc.id) {
            chargeId = lc.id;
            break;
          }
        }
        if (typeof pp === "string") {
          try {
            const piObj = await stripe.paymentIntents.retrieve(pp);
            const lc = (piObj as unknown as { latest_charge?: string | { id?: string } | null })
              .latest_charge;
            if (typeof lc === "string") {
              chargeId = lc;
              break;
            }
            if (lc && typeof lc === "object" && lc.id) {
              chargeId = lc.id;
              break;
            }
          } catch {
            /** ignore: continua a próxima entry */
          }
        }
      }
    }
  }

  if (!chargeId && typeof stored.stripePaymentIntentId === "string" && stored.stripePaymentIntentId.trim()) {
    try {
      const piObj = await stripe.paymentIntents.retrieve(stored.stripePaymentIntentId.trim());
      const lc = (piObj as unknown as { latest_charge?: string | { id?: string } | null })
        .latest_charge;
      if (typeof lc === "string") chargeId = lc;
      else if (lc && typeof lc === "object" && lc.id) chargeId = lc.id ?? null;
    } catch {
      /** ignore: último fallback */
    }
  }

  if (!chargeId) {
    return NextResponse.json(
      { error: "Não foi possível localizar o pagamento (charge) associado à fatura." },
      { status: 409 },
    );
  }

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create({
      charge: chargeId,
      amount: amountCents,
      ...(reason ? { reason } : {}),
      metadata: {
        uid: uid.trim(),
        invoiceId: invoiceId.trim(),
        initiatedBy: "admin",
        adminEmail: gate.ctx.callerEmail ?? "",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao criar reembolso na Stripe.";
    console.error("[admin refund]", e);
    return NextResponse.json({ error: stripeErrorToUserMessage(msg) }, { status: 502 });
  }

  /** Reconcilia já: busca o charge actualizado com a lista de refunds e grava. */
  try {
    const freshCharge = await stripe.charges.retrieve(chargeId, { expand: ["refunds"] });
    await recordStripeChargeRefunded(freshCharge, null);
  } catch (e) {
    console.error("[admin refund] reconcile", e);
    /** Não falha o request — o webhook charge.refunded garante a reconciliação. */
  }

  return NextResponse.json({
    refundId: refund.id,
    amountCents,
    status: refund.status,
    chargeId,
  });
}
