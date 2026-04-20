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
};

export type AdminUsersListResponse = {
  users: AdminListedUser[];
  nextPageToken: string | null;
};
