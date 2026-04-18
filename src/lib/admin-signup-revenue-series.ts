import type { Auth, UserRecord } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

import { ADMIN_PLATFORM_SERIES_MIN_YEAR, type AdminPlatformSeriesQuery } from "@/lib/admin-platform-series-query";
import type { AdminSignupSeriesPoint, AdminSignupSeriesResponse } from "@/types/admin-signup-series";

const USER_SETTINGS = "userSettings";

function daysInMonthUtc(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

function monthShortLabelPt(month1To12: number): string {
  try {
    return new Date(2000, month1To12 - 1, 1).toLocaleDateString("pt-BR", { month: "short" });
  } catch {
    return String(month1To12);
  }
}

function parseCreationMs(u: UserRecord): number | null {
  const raw = u.metadata?.creationTime;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

function utcYmd(ms: number): { y: number; m: number; d: number } {
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

function pickPlanPriceCents(data: Record<string, unknown> | undefined): number {
  if (!data) return 0;
  for (const k of ["subscriptionPriceCents", "planPriceCents"]) {
    const v = data[k];
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  }
  return 0;
}

async function sumPlanPriceCentsForUids(db: Firestore, uids: string[]): Promise<number> {
  if (!uids.length) return 0;
  const CHUNK = 10;
  let sum = 0;
  for (let i = 0; i < uids.length; i += CHUNK) {
    const slice = uids.slice(i, i + CHUNK);
    const refs = slice.map((uid) => db.collection(USER_SETTINGS).doc(uid));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      sum += pickPlanPriceCents(snap.data() as Record<string, unknown>);
    }
  }
  return sum;
}

async function listAllUsers(auth: Auth): Promise<UserRecord[]> {
  const out: UserRecord[] = [];
  let pageToken: string | undefined;
  for (;;) {
    const res = await auth.listUsers(1000, pageToken);
    out.push(...res.users);
    if (!res.pageToken) break;
    pageToken = res.pageToken;
  }
  return out;
}

async function finalizePoints(
  db: Firestore,
  labelsAndUids: { label: string; uids: string[] }[],
): Promise<AdminSignupSeriesPoint[]> {
  return Promise.all(
    labelsAndUids.map(async ({ label, uids }) => ({
      label,
      signups: uids.length,
      revenueCents: await sumPlanPriceCentsForUids(db, uids),
    })),
  );
}

export async function getAdminSignupRevenueSeries(
  auth: Auth,
  db: Firestore,
  query: AdminPlatformSeriesQuery,
): Promise<AdminSignupSeriesResponse> {
  const users = await listAllUsers(auth);
  const yEnd = new Date().getUTCFullYear();

  switch (query.kind) {
    case "daily": {
      const { year, month } = query;
      const dim = daysInMonthUtc(year, month);
      const uidsPerDay: string[][] = Array.from({ length: dim }, () => []);
      for (const u of users) {
        const t = parseCreationMs(u);
        if (t == null) continue;
        const { y, m, d } = utcYmd(t);
        if (y !== year || m !== month) continue;
        uidsPerDay[d - 1]!.push(u.uid);
      }
      const labelsAndUids = uidsPerDay.map((uids, i) => ({
        label: String(i + 1),
        uids,
      }));
      const points = await finalizePoints(db, labelsAndUids);
      return { year, month, granularity: "day", points };
    }
    case "month_in_year": {
      const { year } = query;
      const uidsPerMonth: string[][] = Array.from({ length: 12 }, () => []);
      for (const u of users) {
        const t = parseCreationMs(u);
        if (t == null) continue;
        const { y, m } = utcYmd(t);
        if (y !== year) continue;
        uidsPerMonth[m - 1]!.push(u.uid);
      }
      const labelsAndUids = uidsPerMonth.map((uids, i) => ({
        label: monthShortLabelPt(i + 1),
        uids,
      }));
      const points = await finalizePoints(db, labelsAndUids);
      return { year, month: 0, granularity: "month_in_year", points };
    }
    case "fixed_month_by_year": {
      const { month: fixedMonth } = query;
      const years: number[] = [];
      for (let y = ADMIN_PLATFORM_SERIES_MIN_YEAR; y <= yEnd; y++) {
        years.push(y);
      }
      const uidsPerYear: string[][] = years.map(() => []);
      for (const u of users) {
        const t = parseCreationMs(u);
        if (t == null) continue;
        const { y, m } = utcYmd(t);
        if (m !== fixedMonth) continue;
        const yi = years.indexOf(y);
        if (yi >= 0) uidsPerYear[yi]!.push(u.uid);
      }
      const labelsAndUids = years.map((y, i) => ({ label: String(y), uids: uidsPerYear[i]! }));
      const points = await finalizePoints(db, labelsAndUids);
      return { year: 0, month: fixedMonth, granularity: "fixed_month_by_year", points };
    }
    case "year_total": {
      const years: number[] = [];
      for (let y = ADMIN_PLATFORM_SERIES_MIN_YEAR; y <= yEnd; y++) {
        years.push(y);
      }
      const uidsPerYear: string[][] = years.map(() => []);
      for (const u of users) {
        const t = parseCreationMs(u);
        if (t == null) continue;
        const { y } = utcYmd(t);
        const yi = years.indexOf(y);
        if (yi >= 0) uidsPerYear[yi]!.push(u.uid);
      }
      const labelsAndUids = years.map((y, i) => ({ label: String(y), uids: uidsPerYear[i]! }));
      const points = await finalizePoints(db, labelsAndUids);
      return { year: 0, month: 0, granularity: "year_total", points };
    }
  }
}
