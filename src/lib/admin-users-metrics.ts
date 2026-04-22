import type { Auth, UserRecord } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

import { readCycleUsage } from "@/lib/cycle-usage";
import { resolveCycleStartMs } from "@/lib/plan-quotas";
import type { AdminListedUser, AdminUserSubscriptionStatus } from "@/types/admin-user-list";

const USER_SETTINGS_COLLECTION = "userSettings";
const CHUNK = 8;
const DEFAULT_PLAN = "Pro";

const NORMALIZED_PLAN_LABEL: Record<string, "Starter" | "Pro" | "Agency" | "Master"> = {
  starter: "Starter",
  pro: "Pro",
  agency: "Agency",
  master: "Master",
};

function companyNameFromSettings(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const n = typeof data.companyName === "string" ? data.companyName.trim() : "";
  return n || null;
}

function planFromSettings(data: Record<string, unknown> | undefined): string {
  if (!data) return DEFAULT_PLAN;
  const sub =
    typeof data.subscriptionPlan === "string" ? data.subscriptionPlan.trim() : "";
  if (sub) return normalizePlanLabel(sub);
  const p = typeof data.plan === "string" ? data.plan.trim() : "";
  if (p) return normalizePlanLabel(p);
  return DEFAULT_PLAN;
}

function normalizePlanLabel(raw: string): "Starter" | "Pro" | "Agency" | "Master" {
  const text = raw.trim().toLowerCase();
  if (!text) return "Pro";
  if (text.includes("master")) return "Master";
  if (text.includes("agency") || text.includes("enterprise")) return "Agency";
  if (text.includes("starter") || text.includes("free") || text.includes("trial")) return "Starter";
  return "Pro";
}

function asCentsMap(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, value] of Object.entries(v as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}$/.test(k)) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    out[k] = Math.max(0, Math.round(value));
  }
  return out;
}

function addOnPaidByMonthFromSettings(data: Record<string, unknown> | undefined): Record<string, number> {
  if (!data) return {};
  const fromKnownMaps = [
    asCentsMap(data.addOnPaidByMonthCents),
    asCentsMap(data.addonPaidByMonthCents),
    asCentsMap(data.leadsAddOnPaidByMonthCents),
    asCentsMap(data.leadsAddonPaidByMonthCents),
    asCentsMap(data.extraLeadsPaidByMonthCents),
  ];
  const merged: Record<string, number> = {};
  for (const map of fromKnownMaps) {
    for (const [key, cents] of Object.entries(map)) {
      merged[key] = (merged[key] ?? 0) + cents;
    }
  }
  return merged;
}

export function normalizedPlanKey(plan: string): "starter" | "pro" | "agency" | "master" {
  const text = plan.trim().toLowerCase();
  if (text.includes("master")) return "master";
  if (text.includes("agency")) return "agency";
  if (text.includes("starter") || text.includes("free") || text.includes("trial")) return "starter";
  return "pro";
}

export function canonicalPlanLabelFromKey(
  key: "starter" | "pro" | "agency" | "master",
): "Starter" | "Pro" | "Agency" | "Master" {
  return NORMALIZED_PLAN_LABEL[key];
}

function pickFirstCents(data: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = data[k];
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  }
  return null;
}

/** Converte `subscriptionCycleAnchorAt` (número ms ou Timestamp) para milissegundos. */
function subscriptionCycleAnchorAtMsFromSettings(data: Record<string, unknown> | undefined): number | null {
  if (!data) return null;
  const raw = data.subscriptionCycleAnchorAt;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  if (raw && typeof raw === "object" && "toMillis" in raw && typeof (raw as { toMillis: () => number }).toMillis === "function") {
    try {
      const ms = (raw as { toMillis: () => number }).toMillis();
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }
  if (raw && typeof raw === "object" && "seconds" in raw) {
    const s = (raw as { seconds: number }).seconds;
    if (typeof s === "number" && Number.isFinite(s)) return Math.round(s * 1000);
  }
  return null;
}

const VALID_SUBSCRIPTION_STATUSES: ReadonlySet<AdminUserSubscriptionStatus> = new Set([
  "none",
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
]);

function subscriptionStatusFromSettings(
  data: Record<string, unknown> | undefined,
): AdminUserSubscriptionStatus {
  if (!data) return "none";
  const raw = typeof data.subscriptionStatus === "string" ? data.subscriptionStatus.trim() : "";
  if (!raw) return "none";
  return VALID_SUBSCRIPTION_STATUSES.has(raw as AdminUserSubscriptionStatus)
    ? (raw as AdminUserSubscriptionStatus)
    : "none";
}

function pickMs(data: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = data[k];
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  }
  return null;
}

export function authRecordToAdminListedUserBase(u: UserRecord): AdminListedUser {
  return {
    uid: u.uid,
    email: u.email ?? null,
    displayName: u.displayName ?? null,
    companyName: null,
    disabled: u.disabled,
    emailVerified: u.emailVerified,
    createdAt: u.metadata.creationTime ? new Date(u.metadata.creationTime).toISOString() : null,
    lastSignInAt: u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).toISOString() : null,
    plan: "Pro",
    reportsCount: 0,
    proposalsCount: 0,
    leadsCount: 0,
  };
}

async function enrichOne(
  db: Firestore,
  u: AdminListedUser,
  includeBilling = false,
): Promise<AdminListedUser> {
  const uid = u.uid;
  const [reportsSnap, proposalsSnap, leadsSnap, settingsSnap] = await Promise.all([
    db.collection("reports").where("userId", "==", uid).count().get(),
    db.collection("proposals").where("userId", "==", uid).count().get(),
    db.collection("leads").where("userId", "==", uid).count().get(),
    db.collection(USER_SETTINGS_COLLECTION).doc(uid).get(),
  ]);
  const settingsData = settingsSnap.exists
    ? (settingsSnap.data() as Record<string, unknown>)
    : undefined;
  const reportsInDb = reportsSnap.data().count;
  const proposalsInDb = proposalsSnap.data().count;
  /** Inclui gerações já apagadas no ciclo atual (contador persistente em `userSettings.cycleUsage`). */
  const periodStartMs = resolveCycleStartMs(settingsData, Date.now());
  const rotasUsage = readCycleUsage(settingsData, periodStartMs, "rotas");
  const propostasUsage = readCycleUsage(settingsData, periodStartMs, "propostas");
  const base: AdminListedUser = {
    ...u,
    companyName: companyNameFromSettings(settingsData),
    plan: planFromSettings(settingsData),
    reportsCount: Math.max(reportsInDb, rotasUsage),
    proposalsCount: Math.max(proposalsInDb, propostasUsage),
    /** Leads: só documentos existentes no Firestore (excluídos não contam). */
    leadsCount: leadsSnap.data().count,
  };
  if (includeBilling && settingsData) {
    base.planPriceCents = pickFirstCents(settingsData, ["subscriptionPriceCents", "planPriceCents"]);
    base.lifetimePaidCents = pickFirstCents(settingsData, ["lifetimePaidCents", "totalPaidCents"]);
    base.addOnPaidByMonthCents = addOnPaidByMonthFromSettings(settingsData);
    base.subscriptionPaidByMonthCents = asCentsMap(settingsData.subscriptionPaidByMonthCents);
    base.subscriptionCycleAnchorAtMs = subscriptionCycleAnchorAtMsFromSettings(settingsData);
    base.subscriptionStatus = subscriptionStatusFromSettings(settingsData);
    base.subscriptionStatusUpdatedAtMs = pickMs(settingsData, ["subscriptionStatusUpdatedAtMs"]);
    base.subscriptionCurrentPeriodEndMs = pickMs(settingsData, ["subscriptionCurrentPeriodEndMs"]);
    base.autoSuspended = settingsData.autoSuspended === true;
    base.autoSuspendedAtMs = pickMs(settingsData, ["autoSuspendedAtMs"]);
    base.autoSuspendedReason =
      typeof settingsData.autoSuspendedReason === "string"
        ? settingsData.autoSuspendedReason
        : null;
    base.lastPaymentFailureAtMs = pickMs(settingsData, ["lastPaymentFailureAtMs"]);
    base.lastPaymentFailureMessage =
      typeof settingsData.lastPaymentFailureMessage === "string"
        ? settingsData.lastPaymentFailureMessage
        : null;
    base.stripeCustomerId =
      typeof settingsData.stripeCustomerId === "string" && settingsData.stripeCustomerId.trim()
        ? settingsData.stripeCustomerId.trim()
        : null;
  }
  return base;
}

/** Utilizador Auth + métricas + opcionalmente preços em `userSettings` (detalhe admin). */
export async function fetchAdminUserDetail(db: Firestore, auth: Auth, uid: string): Promise<AdminListedUser | null> {
  try {
    const rec = await auth.getUser(uid);
    return await enrichOne(db, authRecordToAdminListedUserBase(rec), true);
  } catch {
    return null;
  }
}

/** Acrescenta plano (userSettings) e contagens Firestore por utilizador; processa em blocos para não sobrecarregar. */
export async function enrichAdminUsersWithMetrics(
  db: Firestore,
  users: AdminListedUser[],
): Promise<AdminListedUser[]> {
  const out: AdminListedUser[] = [];
  for (let i = 0; i < users.length; i += CHUNK) {
    const slice = users.slice(i, i + CHUNK);
    const batch = await Promise.all(slice.map((u) => enrichOne(db, u, false)));
    out.push(...batch);
  }
  return out;
}
