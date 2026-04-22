import type { Firestore } from "firebase-admin/firestore";

import { ADMIN_PLATFORM_SERIES_MIN_YEAR, type AdminPlatformSeriesQuery } from "@/lib/admin-platform-series-query";
import type {
  AdminRevenueSeriesPoint,
  AdminRevenueSeriesResponse,
} from "@/types/admin-revenue-series";
import type { StoredStripeInvoice, StoredStripeInvoiceLine } from "@/types/stripe-invoice";

const INVOICES = "stripeInvoices";

/**
 * Receita real agregada a partir de `stripeInvoices` (status "paid") — inclui adiciona/subscrição.
 * Agregação feita em memória num única query Firestore por intervalo, para permitir breakdown por tipo.
 */

type InvoiceAggregate = {
  amountPaidCents: number;
  subscriptionCents: number;
  addOnCents: number;
  invoicesCount: number;
};

function monthShortLabelPt(month1To12: number): string {
  try {
    return new Date(2000, month1To12 - 1, 1).toLocaleDateString("pt-BR", { month: "short" });
  } catch {
    return String(month1To12);
  }
}

function daysInMonthUtc(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

function lineBreakdownForInvoice(lines: StoredStripeInvoiceLine[] | undefined): {
  subscriptionCents: number;
  addOnCents: number;
} {
  if (!lines || lines.length === 0) return { subscriptionCents: 0, addOnCents: 0 };
  let subscriptionCents = 0;
  let addOnCents = 0;
  for (const l of lines) {
    const amount = typeof l.amountCents === "number" && Number.isFinite(l.amountCents) ? l.amountCents : 0;
    if (l.kind === "subscription") subscriptionCents += amount;
    else addOnCents += amount;
  }
  return { subscriptionCents, addOnCents };
}

/**
 * Distribui o `amountPaidCents` da fatura pelas duas categorias:
 * - se `subscriptionCents + addOnCents === amountPaidCents`, usa o breakdown das linhas;
 * - caso contrário (ajustes/descontos), aplica proporcionalmente.
 */
function splitAmountPaid(
  amountPaidCents: number,
  lines: StoredStripeInvoiceLine[] | undefined,
): { subscriptionCents: number; addOnCents: number } {
  if (amountPaidCents <= 0) return { subscriptionCents: 0, addOnCents: 0 };
  const { subscriptionCents, addOnCents } = lineBreakdownForInvoice(lines);
  const lineSum = subscriptionCents + addOnCents;
  if (lineSum === amountPaidCents) return { subscriptionCents, addOnCents };
  if (lineSum <= 0) {
    return { subscriptionCents: amountPaidCents, addOnCents: 0 };
  }
  const subShare = Math.round((subscriptionCents / lineSum) * amountPaidCents);
  return {
    subscriptionCents: subShare,
    addOnCents: Math.max(0, amountPaidCents - subShare),
  };
}

async function fetchPaidInvoicesInRange(
  db: Firestore,
  startMs: number,
  endMsExclusive: number,
): Promise<StoredStripeInvoice[]> {
  /** Evita filtro por status (índice composto) — `paidAtMs !== null` é suficiente e já corresponde a `status === "paid"` na gravação. */
  const snap = await db
    .collection(INVOICES)
    .where("paidAtMs", ">=", startMs)
    .where("paidAtMs", "<", endMsExclusive)
    .get();
  const out: StoredStripeInvoice[] = [];
  snap.forEach((doc) => {
    const data = doc.data() as StoredStripeInvoice;
    if (typeof data?.paidAtMs !== "number") return;
    out.push(data);
  });
  return out;
}

function emptyAggregate(): InvoiceAggregate {
  return { amountPaidCents: 0, subscriptionCents: 0, addOnCents: 0, invoicesCount: 0 };
}

function accumulate(agg: InvoiceAggregate, inv: StoredStripeInvoice): void {
  const paid = typeof inv.amountPaidCents === "number" ? inv.amountPaidCents : 0;
  if (paid <= 0) return;
  const refunded = typeof inv.refundedCents === "number" ? inv.refundedCents : 0;
  const net = Math.max(0, paid - refunded);
  if (net <= 0) return;
  const { subscriptionCents, addOnCents } = splitAmountPaid(net, inv.lines);
  agg.amountPaidCents += net;
  agg.subscriptionCents += subscriptionCents;
  agg.addOnCents += addOnCents;
  agg.invoicesCount += 1;
}

function aggregateToPoint(label: string, agg: InvoiceAggregate): AdminRevenueSeriesPoint {
  return {
    label,
    totalCents: agg.amountPaidCents,
    subscriptionCents: agg.subscriptionCents,
    addOnCents: agg.addOnCents,
    invoicesCount: agg.invoicesCount,
  };
}

function totalsFromPoints(points: AdminRevenueSeriesPoint[]) {
  return points.reduce(
    (acc, p) => ({
      totalCents: acc.totalCents + p.totalCents,
      subscriptionCents: acc.subscriptionCents + p.subscriptionCents,
      addOnCents: acc.addOnCents + p.addOnCents,
      invoicesCount: acc.invoicesCount + p.invoicesCount,
    }),
    { totalCents: 0, subscriptionCents: 0, addOnCents: 0, invoicesCount: 0 },
  );
}

export async function getAdminRevenueSeries(
  db: Firestore,
  query: AdminPlatformSeriesQuery,
): Promise<AdminRevenueSeriesResponse> {
  const yEnd = new Date().getUTCFullYear();

  switch (query.kind) {
    case "daily": {
      const { year, month } = query;
      const dim = daysInMonthUtc(year, month);
      const rangeStart = Date.UTC(year, month - 1, 1);
      const rangeEnd = Date.UTC(year, month, 1);
      const invoices = await fetchPaidInvoicesInRange(db, rangeStart, rangeEnd);
      const buckets: InvoiceAggregate[] = Array.from({ length: dim }, () => emptyAggregate());
      for (const inv of invoices) {
        const d = new Date(inv.paidAtMs!);
        if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month) continue;
        const day = d.getUTCDate();
        const idx = Math.max(0, Math.min(dim - 1, day - 1));
        accumulate(buckets[idx]!, inv);
      }
      const points = buckets.map((agg, i) => aggregateToPoint(String(i + 1), agg));
      return { year, month, granularity: "day", points, totals: totalsFromPoints(points) };
    }
    case "month_in_year": {
      const { year } = query;
      const rangeStart = Date.UTC(year, 0, 1);
      const rangeEnd = Date.UTC(year + 1, 0, 1);
      const invoices = await fetchPaidInvoicesInRange(db, rangeStart, rangeEnd);
      const buckets: InvoiceAggregate[] = Array.from({ length: 12 }, () => emptyAggregate());
      for (const inv of invoices) {
        const d = new Date(inv.paidAtMs!);
        if (d.getUTCFullYear() !== year) continue;
        const idx = d.getUTCMonth();
        accumulate(buckets[idx]!, inv);
      }
      const points = buckets.map((agg, i) => aggregateToPoint(monthShortLabelPt(i + 1), agg));
      return { year, month: 0, granularity: "month_in_year", points, totals: totalsFromPoints(points) };
    }
    case "fixed_month_by_year": {
      const fixedMonth = query.month;
      const rangeStart = Date.UTC(ADMIN_PLATFORM_SERIES_MIN_YEAR, 0, 1);
      const rangeEnd = Date.UTC(yEnd + 1, 0, 1);
      const invoices = await fetchPaidInvoicesInRange(db, rangeStart, rangeEnd);
      const years: number[] = [];
      for (let y = ADMIN_PLATFORM_SERIES_MIN_YEAR; y <= yEnd; y++) years.push(y);
      const buckets: InvoiceAggregate[] = years.map(() => emptyAggregate());
      for (const inv of invoices) {
        const d = new Date(inv.paidAtMs!);
        if (d.getUTCMonth() + 1 !== fixedMonth) continue;
        const idx = years.indexOf(d.getUTCFullYear());
        if (idx >= 0) accumulate(buckets[idx]!, inv);
      }
      const points = buckets.map((agg, i) => aggregateToPoint(String(years[i]), agg));
      return {
        year: 0,
        month: fixedMonth,
        granularity: "fixed_month_by_year",
        points,
        totals: totalsFromPoints(points),
      };
    }
    case "year_total": {
      const rangeStart = Date.UTC(ADMIN_PLATFORM_SERIES_MIN_YEAR, 0, 1);
      const rangeEnd = Date.UTC(yEnd + 1, 0, 1);
      const invoices = await fetchPaidInvoicesInRange(db, rangeStart, rangeEnd);
      const years: number[] = [];
      for (let y = ADMIN_PLATFORM_SERIES_MIN_YEAR; y <= yEnd; y++) years.push(y);
      const buckets: InvoiceAggregate[] = years.map(() => emptyAggregate());
      for (const inv of invoices) {
        const d = new Date(inv.paidAtMs!);
        const idx = years.indexOf(d.getUTCFullYear());
        if (idx >= 0) accumulate(buckets[idx]!, inv);
      }
      const points = buckets.map((agg, i) => aggregateToPoint(String(years[i]), agg));
      return {
        year: 0,
        month: 0,
        granularity: "year_total",
        points,
        totals: totalsFromPoints(points),
      };
    }
  }
}
