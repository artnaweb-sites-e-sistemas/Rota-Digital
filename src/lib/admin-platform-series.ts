import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { ADMIN_PLATFORM_SERIES_MIN_YEAR, type AdminPlatformSeriesQuery } from "@/lib/admin-platform-series-query";
import type { PlatformSeriesDay, PlatformSeriesResponse } from "@/types/platform-series";

function daysInMonthUtc(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

function utcDayMillisRange(year: number, month1To12: number, day: number): { start: number; end: number } {
  const start = Date.UTC(year, month1To12 - 1, day, 0, 0, 0, 0);
  const end = Date.UTC(year, month1To12 - 1, day + 1, 0, 0, 0, 0);
  return { start, end };
}

async function countCreatedNumberRange(
  db: Firestore,
  collection: string,
  start: number,
  end: number,
  userId?: string | null,
): Promise<number> {
  const col = db.collection(collection);
  const scoped = userId?.trim() ? col.where("userId", "==", userId.trim()) : col;
  const snap = await scoped
    .where("createdAt", ">=", start)
    .where("createdAt", "<", end)
    .count()
    .get();
  return snap.data().count;
}

async function countCreatedTimestampRange(
  db: Firestore,
  collection: string,
  start: number,
  end: number,
  userId?: string | null,
): Promise<number> {
  const col = db.collection(collection);
  const scoped = userId?.trim() ? col.where("userId", "==", userId.trim()) : col;
  const snap = await scoped
    .where("createdAt", ">=", Timestamp.fromMillis(start))
    .where("createdAt", "<", Timestamp.fromMillis(end))
    .count()
    .get();
  return snap.data().count;
}

function utcMonthMillisRange(year: number, month1To12: number): { start: number; end: number } {
  const start = Date.UTC(year, month1To12 - 1, 1, 0, 0, 0, 0);
  const end = Date.UTC(year, month1To12, 1, 0, 0, 0, 0);
  return { start, end };
}

function utcYearMillisRange(year: number): { start: number; end: number } {
  const start = Date.UTC(year, 0, 1, 0, 0, 0, 0);
  const end = Date.UTC(year + 1, 0, 1, 0, 0, 0, 0);
  return { start, end };
}

function monthShortLabelPt(month1To12: number): string {
  try {
    return new Date(2000, month1To12 - 1, 1).toLocaleDateString("pt-BR", { month: "short" });
  } catch {
    return String(month1To12);
  }
}

async function countTriplet(
  db: Firestore,
  start: number,
  end: number,
  userId?: string | null,
): Promise<Pick<PlatformSeriesDay, "reports" | "proposals" | "leads">> {
  const [reports, proposals, leads] = await Promise.all([
    countCreatedNumberRange(db, "reports", start, end, userId),
    countCreatedNumberRange(db, "proposals", start, end, userId),
    countCreatedTimestampRange(db, "leads", start, end, userId),
  ]);
  return { reports, proposals, leads };
}

/** Contagens por dia (UTC) no mês; leads usam Timestamp, reports/proposals número (ms). */
export async function getPlatformSeriesForMonth(
  db: Firestore,
  year: number,
  month: number,
  userId?: string | null,
): Promise<PlatformSeriesResponse> {
  const dim = daysInMonthUtc(year, month);
  const ranges = Array.from({ length: dim }, (_, i) => {
    const day = i + 1;
    return { day, ...utcDayMillisRange(year, month, day) };
  });

  const reportsByDay = await Promise.all(
    ranges.map(({ start, end }) => countCreatedNumberRange(db, "reports", start, end, userId)),
  );
  const proposalsByDay = await Promise.all(
    ranges.map(({ start, end }) => countCreatedNumberRange(db, "proposals", start, end, userId)),
  );
  const leadsByDay = await Promise.all(
    ranges.map(({ start, end }) => countCreatedTimestampRange(db, "leads", start, end, userId)),
  );

  const days = ranges.map((r, i) => ({
    day: r.day,
    label: String(r.day),
    reports: reportsByDay[i] ?? 0,
    proposals: proposalsByDay[i] ?? 0,
    leads: leadsByDay[i] ?? 0,
  }));

  return { year, month, granularity: "day", days };
}

/** Um ponto por mês civil (UTC) no ano. */
export async function getPlatformSeriesMonthsInYear(
  db: Firestore,
  year: number,
  userId?: string | null,
): Promise<PlatformSeriesResponse> {
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const triplets = await Promise.all(
    months.map((m) => {
      const { start, end } = utcMonthMillisRange(year, m);
      return countTriplet(db, start, end, userId);
    }),
  );

  const days: PlatformSeriesDay[] = months.map((m, i) => {
    const t = triplets[i]!;
    return {
      day: m,
      label: monthShortLabelPt(m),
      reports: t.reports,
      proposals: t.proposals,
      leads: t.leads,
    };
  });

  return { year, month: 0, granularity: "month_in_year", days };
}

/** O mesmo mês em cada ano (UTC), de MIN_YEAR ao ano civil UTC atual. */
export async function getPlatformSeriesFixedMonthAcrossYears(
  db: Firestore,
  month: number,
  userId?: string | null,
): Promise<PlatformSeriesResponse> {
  const yEnd = new Date().getUTCFullYear();
  const years: number[] = [];
  for (let y = ADMIN_PLATFORM_SERIES_MIN_YEAR; y <= yEnd; y++) {
    years.push(y);
  }

  const triplets = await Promise.all(
    years.map((y) => {
      const { start, end } = utcMonthMillisRange(y, month);
      return countTriplet(db, start, end, userId);
    }),
  );

  const days: PlatformSeriesDay[] = years.map((y, i) => {
    const t = triplets[i]!;
    return {
      day: y,
      label: String(y),
      reports: t.reports,
      proposals: t.proposals,
      leads: t.leads,
    };
  });

  return { year: 0, month, granularity: "fixed_month_by_year", days };
}

/** Um ponto por ano civil (UTC), de MIN_YEAR ao ano atual. */
export async function getPlatformSeriesYearTotals(
  db: Firestore,
  userId?: string | null,
): Promise<PlatformSeriesResponse> {
  const yEnd = new Date().getUTCFullYear();
  const years: number[] = [];
  for (let y = ADMIN_PLATFORM_SERIES_MIN_YEAR; y <= yEnd; y++) {
    years.push(y);
  }

  const triplets = await Promise.all(
    years.map((y) => {
      const { start, end } = utcYearMillisRange(y);
      return countTriplet(db, start, end, userId);
    }),
  );

  const days: PlatformSeriesDay[] = years.map((y, i) => {
    const t = triplets[i]!;
    return {
      day: y,
      label: String(y),
      reports: t.reports,
      proposals: t.proposals,
      leads: t.leads,
    };
  });

  return { year: 0, month: 0, granularity: "year_total", days };
}

export async function getPlatformSeriesForAdminQuery(
  db: Firestore,
  query: AdminPlatformSeriesQuery,
  userId?: string | null,
): Promise<PlatformSeriesResponse> {
  switch (query.kind) {
    case "daily":
      return getPlatformSeriesForMonth(db, query.year, query.month, userId);
    case "month_in_year":
      return getPlatformSeriesMonthsInYear(db, query.year, userId);
    case "fixed_month_by_year":
      return getPlatformSeriesFixedMonthAcrossYears(db, query.month, userId);
    case "year_total":
      return getPlatformSeriesYearTotals(db, userId);
  }
}
