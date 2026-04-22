/**
 * Status de subscrição Stripe replicado em `userSettings.subscriptionStatus`.
 * `none` = nunca assinou (Starter ou conta nova).
 */
export type AdminUserSubscriptionStatus =
  | "none"
  | "active"
  | "trialing"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete"
  | "incomplete_expired";

/** Utilizador Auth exposto à listagem admin (sem o UserRecord completo). */
export type AdminListedUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  /** Firestore `userSettings.companyName` (Sobre a Empresa). */
  companyName: string | null;
  disabled: boolean;
  emailVerified: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  /** Texto livre: `subscriptionPlan` ou `plan` em userSettings; senão "Pro". */
  plan: string;
  reportsCount: number;
  proposalsCount: number;
  leadsCount: number;
  /** Centavos (BRL), só preenchido no detalhe admin. Firestore: `subscriptionPriceCents` ou `planPriceCents`. */
  planPriceCents?: number | null;
  /** Centavos (BRL), só preenchido no detalhe admin. Firestore: `lifetimePaidCents` ou `totalPaidCents`. */
  lifetimePaidCents?: number | null;
  /** Centavos de add-ons por mês no formato `YYYY-MM` (quando disponível em userSettings). */
  addOnPaidByMonthCents?: Record<string, number>;
  /**
   * Centavos de renovações de assinatura por mês (`YYYY-MM`) — incrementado no webhook `invoice.paid`.
   * Separado de `addOnPaidByMonthCents` para o painel de receita distinguir plano vs. pacotes.
   */
  subscriptionPaidByMonthCents?: Record<string, number>;
  /**
   * Ms desde epoch: quando a assinatura paga (Stripe) foi aplicada (userSettings `subscriptionCycleAnchorAt`).
   * Usado no admin para não mostrar "referência" de plano em meses anteriores à cobrança.
   */
  subscriptionCycleAnchorAtMs?: number | null;
  /** Sincronizado do Stripe via webhook (`customer.subscription.*` e `invoice.*`). */
  subscriptionStatus?: AdminUserSubscriptionStatus;
  /** Ms: quando `subscriptionStatus` foi atualizado por webhook. */
  subscriptionStatusUpdatedAtMs?: number | null;
  /** Ms: fim do período atual da subscrição (próxima renovação). */
  subscriptionCurrentPeriodEndMs?: number | null;
  /** Conta desativada automaticamente pelo sistema (pagamento em falta) — distinto de desativação manual do admin. */
  autoSuspended?: boolean;
  /** Ms: quando a suspensão automática ocorreu. */
  autoSuspendedAtMs?: number | null;
  /** Motivo da suspensão automática (`subscription_unpaid`, `subscription_canceled`, `subscription_incomplete_expired`). */
  autoSuspendedReason?: string | null;
  /** Ms: última falha de cobrança (`invoice.payment_failed`). */
  lastPaymentFailureAtMs?: number | null;
  lastPaymentFailureMessage?: string | null;
  /** `userSettings.stripeCustomerId` (quando existe) — usado para abrir o portal Stripe do cliente. */
  stripeCustomerId?: string | null;
};

export type AdminUsersListResponse = {
  users: AdminListedUser[];
  nextPageToken: string | null;
};
