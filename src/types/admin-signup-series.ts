import type { PlatformSeriesGranularity } from "@/types/platform-series";

export type AdminSignupSeriesPoint = {
  label: string;
  signups: number;
  /** Soma de planPriceCents/subscriptionPriceCents em userSettings das contas criadas neste bucket (centavos BRL). */
  revenueCents: number;
};

export type AdminSignupSeriesResponse = {
  granularity: PlatformSeriesGranularity;
  year: number;
  month: number;
  points: AdminSignupSeriesPoint[];
};
