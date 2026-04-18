export type PlatformSeriesDay = {
  day: number;
  label: string;
  reports: number;
  proposals: number;
  leads: number;
};

/** `day`: por dia no mês · `month_in_year`: 12 meses num ano · `year_total`: um ponto por ano · `fixed_month_by_year`: o mesmo mês em cada ano. */
export type PlatformSeriesGranularity =
  | "day"
  | "month_in_year"
  | "year_total"
  | "fixed_month_by_year";

export type PlatformSeriesResponse = {
  year: number;
  month: number;
  granularity: PlatformSeriesGranularity;
  days: PlatformSeriesDay[];
};
