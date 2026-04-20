import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { ADMIN_PLATFORM_SERIES_MIN_YEAR, type AdminPlatformSeriesQuery } from "@/lib/admin-platform-series-query";
import { readCycleUsage } from "@/lib/cycle-usage";
import { resolveCycleStartMs } from "@/lib/plan-quotas";
import type { PlatformSeriesDay, PlatformSeriesResponse } from "@/types/platform-series";

const USER_SETTINGS_COLLECTION = "userSettings";

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

function seriesUtcBounds(resp: PlatformSeriesResponse): { start: number; end: number } {
  const yEnd = new Date().getUTCFullYear();
  switch (resp.granularity) {
    case "day": {
      const dim = daysInMonthUtc(resp.year, resp.month);
      const first = utcDayMillisRange(resp.year, resp.month, 1).start;
      const last = utcDayMillisRange(resp.year, resp.month, dim).end;
      return { start: first, end: last };
    }
    case "month_in_year":
      return utcYearMillisRange(resp.year);
    case "year_total":
      return {
        start: utcYearMillisRange(ADMIN_PLATFORM_SERIES_MIN_YEAR).start,
        end: utcYearMillisRange(yEnd).end,
      };
    case "fixed_month_by_year": {
      const m = resp.month;
      return {
        start: utcMonthMillisRange(ADMIN_PLATFORM_SERIES_MIN_YEAR, m).start,
        end: utcMonthMillisRange(yEnd, m).end,
      };
    }
    default:
      return utcYearMillisRange(resp.year);
  }
}

function bucketBoundsForEntry(
  resp: PlatformSeriesResponse,
  entry: PlatformSeriesDay,
): { start: number; end: number } {
  switch (resp.granularity) {
    case "day":
      return utcDayMillisRange(resp.year, resp.month, entry.day);
    case "month_in_year":
      return utcMonthMillisRange(resp.year, entry.day);
    case "fixed_month_by_year":
      return utcMonthMillisRange(entry.day, resp.month);
    case "year_total":
      return utcYearMillisRange(entry.day);
    default:
      return utcDayMillisRange(resp.year, resp.month, entry.day);
  }
}

/**
 * Alinha rotas/propostas ao contador persistente do ciclo (`cycleUsage`), como na lista admin.
 * Só aplica quando o período do gráfico cobre todo o intervalo [início do ciclo, agora] em UTC;
 * o delta é somado ao último bucket que intersecta esse intervalo. Leads inalterados (só Firestore).
 */
async function applyUserCycleUsageAdjustment(
  db: Firestore,
  userId: string,
  response: PlatformSeriesResponse,
): Promise<PlatformSeriesResponse> {
  const snap = await db.collection(USER_SETTINGS_COLLECTION).doc(userId).get();
  if (!snap.exists) return response;
  const settings = snap.data() as Record<string, unknown>;
  const nowMs = Date.now();
  const periodStartMs = resolveCycleStartMs(settings, nowMs);
  const { start: seriesStart, end: seriesEnd } = seriesUtcBounds(response);
  if (!(seriesStart <= periodStartMs && nowMs <= seriesEnd)) {
    return response;
  }

  const rotasU = readCycleUsage(settings, periodStartMs, "rotas");
  const proposU = readCycleUsage(settings, periodStartMs, "propostas");

  let sumR = 0;
  let sumP = 0;
  const overlapIdx: number[] = [];
  for (let i = 0; i < response.days.length; i++) {
    const entry = response.days[i]!;
    const { start: bStart, end: bEnd } = bucketBoundsForEntry(response, entry);
    if (bStart < nowMs && bEnd > periodStartMs) {
      overlapIdx.push(i);
      sumR += entry.reports;
      sumP += entry.proposals;
    }
  }

  const deltaR = Math.max(0, rotasU - sumR);
  const deltaP = Math.max(0, proposU - sumP);
  if (deltaR === 0 && deltaP === 0) return response;

  const lastIdx = overlapIdx.length ? overlapIdx[overlapIdx.length - 1]! : -1;
  if (lastIdx < 0) return response;

  const days = response.days.map((d, i) =>
    i === lastIdx
      ? {
          ...d,
          reports: d.reports + deltaR,
          proposals: d.proposals + deltaP,
        }
      : d,
  );
  return { ...response, days };
}

/**
 * Gráficos globais (sem userId): a série por dia só conta documentos ainda no Firestore;
 * somamos Σ max(0, cycleUsage − docs na coleção) por utilizador e aplicamos ao último dia
 * do mês visível (quando "agora" cai nesse mês), alinhando o total com a lógica da tabela admin.
 */
async function sumGlobalPhantomPair(db: Firestore): Promise<{ deltaR: number; deltaP: number }> {
  const settingsSnap = await db.collection(USER_SETTINGS_COLLECTION).get();
  let deltaR = 0;
  let deltaP = 0;
  const CHUNK = 15;
  for (let i = 0; i < settingsSnap.docs.length; i += CHUNK) {
    const slice = settingsSnap.docs.slice(i, i + CHUNK);
    const batch = await Promise.all(
      slice.map(async (docSnap) => {
        const uid = docSnap.id;
        const data = docSnap.data() as Record<string, unknown>;
        const periodStart = resolveCycleStartMs(data, Date.now());
        const rotasU = readCycleUsage(data, periodStart, "rotas");
        const proposU = readCycleUsage(data, periodStart, "propostas");
        const [rSnap, pSnap] = await Promise.all([
          db.collection("reports").where("userId", "==", uid).count().get(),
          db.collection("proposals").where("userId", "==", uid).count().get(),
        ]);
        const rCount = rSnap.data().count ?? 0;
        const pCount = pSnap.data().count ?? 0;
        return {
          dr: Math.max(0, rotasU - rCount),
          dp: Math.max(0, proposU - pCount),
        };
      }),
    );
    for (const b of batch) {
      deltaR += b.dr;
      deltaP += b.dp;
    }
  }
  return { deltaR, deltaP };
}

async function applyGlobalPhantomAdjustment(
  db: Firestore,
  response: PlatformSeriesResponse,
): Promise<PlatformSeriesResponse> {
  if (response.granularity !== "day") {
    return response;
  }
  const nowMs = Date.now();
  const { start: seriesStart, end: seriesEnd } = seriesUtcBounds(response);
  if (!(nowMs >= seriesStart && nowMs <= seriesEnd)) {
    return response;
  }

  const { deltaR, deltaP } = await sumGlobalPhantomPair(db);
  if (deltaR === 0 && deltaP === 0) return response;

  const y = response.year;
  const m = response.month;
  const monthStart = utcMonthMillisRange(y, m).start;
  const overlapIdx: number[] = [];
  for (let i = 0; i < response.days.length; i++) {
    const entry = response.days[i]!;
    const { start: bStart, end: bEnd } = utcDayMillisRange(y, m, entry.day);
    if (bStart < nowMs && bEnd > monthStart) {
      overlapIdx.push(i);
    }
  }
  const lastIdx = overlapIdx.length ? overlapIdx[overlapIdx.length - 1]! : -1;
  if (lastIdx < 0) return response;

  const days = response.days.map((d, i) =>
    i === lastIdx
      ? {
          ...d,
          reports: d.reports + deltaR,
          proposals: d.proposals + deltaP,
        }
      : d,
  );
  return { ...response, days };
}

export async function getPlatformSeriesForAdminQuery(
  db: Firestore,
  query: AdminPlatformSeriesQuery,
  userId?: string | null,
): Promise<PlatformSeriesResponse> {
  let response: PlatformSeriesResponse;
  switch (query.kind) {
    case "daily":
      response = await getPlatformSeriesForMonth(db, query.year, query.month, userId);
      break;
    case "month_in_year":
      response = await getPlatformSeriesMonthsInYear(db, query.year, userId);
      break;
    case "fixed_month_by_year":
      response = await getPlatformSeriesFixedMonthAcrossYears(db, query.month, userId);
      break;
    case "year_total":
      response = await getPlatformSeriesYearTotals(db, userId);
      break;
  }

  const uid = userId?.trim();
  if (uid) {
    return applyUserCycleUsageAdjustment(db, uid, response);
  }
  return applyGlobalPhantomAdjustment(db, response);
}
