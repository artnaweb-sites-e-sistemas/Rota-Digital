import type { PlatformSeriesGranularity } from "@/types/platform-series";

export type AdminRevenueSeriesPoint = {
  label: string;
  /** Receita real paga no bucket (sum `amountPaidCents` de faturas Stripe com status "paid"). */
  totalCents: number;
  /** Parcela de assinaturas (linhas de fatura `kind === "subscription"`). */
  subscriptionCents: number;
  /** Parcela de add-ons / outras linhas (checkout one-time pagos). */
  addOnCents: number;
  /** N.º de faturas pagas no bucket (KPI secundário). */
  invoicesCount: number;
};

export type AdminRevenueSeriesResponse = {
  granularity: PlatformSeriesGranularity;
  year: number;
  month: number;
  points: AdminRevenueSeriesPoint[];
  totals: {
    totalCents: number;
    subscriptionCents: number;
    addOnCents: number;
    invoicesCount: number;
  };
};
