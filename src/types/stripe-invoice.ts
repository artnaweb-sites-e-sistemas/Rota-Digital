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
};
