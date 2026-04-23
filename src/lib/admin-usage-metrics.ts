import { FieldPath, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";

import { monthStartUtcMs } from "@/lib/lead-capture-config";
import {
  PLAN_QUOTAS,
  UNLIMITED_QUOTA,
  normalizedSubscriptionPlanKey,
  resolveQuotaLimit,
  type PlanKey,
} from "@/lib/plan-quotas";
import type { AdminPlanUsageMetricsRow, AdminUsageMetricsResponse, CommercialPlanKey } from "@/types/admin-usage-metrics";

const USER_SETTINGS_COLLECTION = "userSettings";
const REPORTS_COLLECTION = "reports";
const PROPOSALS_COLLECTION = "proposals";

const COMMERCIAL_PLANS: readonly CommercialPlanKey[] = ["starter", "pro", "agency"];

type Bucket = {
  totalUsers: number;
  usersWithAtLeastOneReport: number;
  usersAtReportLimit: number;
  sumReports: number;
  usersWithAtLeastOneProposal: number;
  usersAtProposalLimit: number;
  sumProposals: number;
};

function emptyBucket(): Bucket {
  return {
    totalUsers: 0,
    usersWithAtLeastOneReport: 0,
    usersAtReportLimit: 0,
    sumReports: 0,
    usersWithAtLeastOneProposal: 0,
    usersAtProposalLimit: 0,
    sumProposals: 0,
  };
}

function roundOneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

async function countByUserIdInDateRange(
  db: Firestore,
  collectionName: string,
  startMs: number,
  endMs: number,
): Promise<Map<string, number>> {
  const byUser = new Map<string, number>();
  const base = db
    .collection(collectionName)
    .where("createdAt", ">=", startMs)
    .where("createdAt", "<", endMs)
    .orderBy("createdAt");

  let last: QueryDocumentSnapshot | undefined;

  for (;;) {
    let q = base.limit(400);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const uid = String(doc.get("userId") ?? "").trim();
      if (!uid) continue;
      byUser.set(uid, (byUser.get(uid) ?? 0) + 1);
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 400) break;
  }

  return byUser;
}

function utcMonthRange(nowMs: number): { startMs: number; endMs: number; year: number; month: number } {
  const startMs = monthStartUtcMs(nowMs);
  const y = new Date(startMs).getUTCFullYear();
  const m0 = new Date(startMs).getUTCMonth();
  const endMs = Date.UTC(y, m0 + 1, 1, 0, 0, 0, 0);
  return { startMs, endMs, year: y, month: m0 + 1 };
}

function isMasterUser(data: Record<string, unknown>): boolean {
  if (data.planMasterUnlimited === true) return true;
  return normalizedSubscriptionPlanKey(data.subscriptionPlan ?? data.plan) === "master";
}

export async function computeAdminUsageMetricsByPlan(
  db: Firestore,
  nowMs: number = Date.now(),
): Promise<AdminUsageMetricsResponse> {
  const { startMs, endMs, year, month } = utcMonthRange(nowMs);

  const [reportCounts, proposalCounts] = await Promise.all([
    countByUserIdInDateRange(db, REPORTS_COLLECTION, startMs, endMs),
    countByUserIdInDateRange(db, PROPOSALS_COLLECTION, startMs, endMs),
  ]);

  const buckets: Record<CommercialPlanKey, Bucket> = {
    starter: emptyBucket(),
    pro: emptyBucket(),
    agency: emptyBucket(),
  };

  let lastSettings: QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db.collection(USER_SETTINGS_COLLECTION).orderBy(FieldPath.documentId()).limit(400);
    if (lastSettings) q = q.startAfter(lastSettings);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;
      if (isMasterUser(data)) continue;

      const plan = normalizedSubscriptionPlanKey(data.subscriptionPlan ?? data.plan) as PlanKey;
      if (plan !== "starter" && plan !== "pro" && plan !== "agency") continue;

      const uid = doc.id.trim();
      if (!uid) continue;

      const rQuota = resolveQuotaLimit(data, "rotas");
      const pQuota = resolveQuotaLimit(data, "propostas");
      const rCount = reportCounts.get(uid) ?? 0;
      const pCount = proposalCounts.get(uid) ?? 0;

      const b = buckets[plan];
      b.totalUsers += 1;
      b.sumReports += rCount;
      b.sumProposals += pCount;
      if (rCount >= 1) b.usersWithAtLeastOneReport += 1;
      if (pCount >= 1) b.usersWithAtLeastOneProposal += 1;
      if (!rQuota.isUnlimited && rCount >= rQuota.limit) b.usersAtReportLimit += 1;
      if (!pQuota.isUnlimited && pCount >= pQuota.limit) b.usersAtProposalLimit += 1;
    }

    lastSettings = snap.docs[snap.docs.length - 1];
    if (snap.size < 400) break;
  }

  const plans: AdminPlanUsageMetricsRow[] = COMMERCIAL_PLANS.map((plan) => {
    const b = buckets[plan];
    const pq = PLAN_QUOTAS[plan];
    const reportsUnlimited = pq.rotas >= UNLIMITED_QUOTA;
    const proposalsUnlimited = pq.propostas >= UNLIMITED_QUOTA;

    return {
      plan,
      totalUsers: b.totalUsers,
      usersWithAtLeastOneReport: b.usersWithAtLeastOneReport,
      usersAtReportLimit: b.usersAtReportLimit,
      avgReportsUsed: b.totalUsers > 0 ? roundOneDecimal(b.sumReports / b.totalUsers) : null,
      reportLimitBaseline: reportsUnlimited ? UNLIMITED_QUOTA : pq.rotas,
      reportsQuotaUnlimited: reportsUnlimited,
      usersWithAtLeastOneProposal: b.usersWithAtLeastOneProposal,
      usersAtProposalLimit: b.usersAtProposalLimit,
      avgProposalsUsed: b.totalUsers > 0 ? roundOneDecimal(b.sumProposals / b.totalUsers) : null,
      proposalLimitBaseline: proposalsUnlimited ? UNLIMITED_QUOTA : pq.propostas,
      proposalsQuotaUnlimited: proposalsUnlimited,
    };
  });

  return {
    year,
    month,
    periodStartUtcIso: new Date(startMs).toISOString(),
    periodEndExclusiveUtcIso: new Date(endMs).toISOString(),
    plans,
  };
}
