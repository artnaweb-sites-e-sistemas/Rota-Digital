import type { Timestamp } from "firebase-admin/firestore";

/** Linha de fatura categorizada para agregação admin. */
export type StoredStripeInvoiceLineKind = "subscription" | "add_on" | "other";

export type StoredStripeInvoiceLine = {
  kind: StoredStripeInvoiceLineKind;
  description: string | null;
  amountCents: number;
  currency: string;
  periodStartMs: number | null;
  periodEndMs: number | null;
};

/** Registo de um reembolso aplicado sobre a fatura. */
export type StoredStripeInvoiceRefund = {
  stripeRefundId: string;
  stripeChargeId: string | null;
  amountCents: number;
  /** `charge.refunds.reason`: `duplicate | fraudulent | requested_by_customer | ...` | null. */
  reason: string | null;
  createdAtMs: number;
};

/** Estado agregado de refund de uma fatura. */
export type StoredStripeInvoiceRefundStatus = "partial" | "refunded";

/** Documento persistido em `stripeInvoices/{invoiceId}` após webhook Stripe. */
export type StoredStripeInvoice = {
  uid: string | null;
  stripeInvoiceId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  /**
   * Stripe `Invoice.status`: `draft | open | paid | uncollectible | void`.
   * Guardamos como string para não ter de alinhar com novas enums do Stripe.
   */
  status: string;
  /** Preenchido em `invoice.paid`: `invoice.amount_paid` (centavos). */
  amountPaidCents: number;
  /** `invoice.amount_due` (centavos). */
  amountDueCents: number;
  /** `invoice.amount_remaining` (centavos), em caso de falha parcial. */
  amountRemainingCents: number;
  currency: string;
  billingReason: string | null;
  number: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  periodStartMs: number | null;
  periodEndMs: number | null;
  paidAtMs: number | null;
  createdAtMs: number;
  /** Mensagem da Stripe em caso de `invoice.payment_failed`. */
  failureMessage: string | null;
  /** Tipos de linhas (plano / add-on) e somas — útil para o painel de receita. */
  lines: StoredStripeInvoiceLine[];
  /** `event.id` do webhook que originou este registo (auditoria). */
  rawEventId: string | null;
  /** Timestamp de servidor Firestore (quando gravámos este documento). */
  webhookReceivedAt: Timestamp;
  /** Total estornado para esta fatura (monotónico). Ausente / 0 em faturas sem reembolso. */
  refundedCents?: number;
  /** Timestamp do último reembolso aplicado. */
  refundedAtMs?: number | null;
  /** `"partial"` se `refundedCents < amountPaidCents`, `"refunded"` se total. */
  refundStatus?: StoredStripeInvoiceRefundStatus | null;
  /** Histórico de reembolsos processados — idempotente por `stripeRefundId`. */
  refunds?: StoredStripeInvoiceRefund[];
  /**
   * Charge Stripe associado — gravado para permitir estorno de documentos sintéticos
   * (add-ons comprados via Checkout Session em `mode=payment`, que não geram `Invoice` na Stripe).
   */
  stripeChargeId?: string | null;
  /** PaymentIntent Stripe associado (utilizado como fallback para resolver o charge). */
  stripePaymentIntentId?: string | null;
  /** Se este registo foi criado a partir de uma Checkout Session (add-on avulso). */
  stripeCheckoutSessionId?: string | null;
};
