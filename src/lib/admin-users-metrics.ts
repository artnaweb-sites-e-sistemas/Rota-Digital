import type { Auth, UserRecord } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

import type { AdminListedUser } from "@/types/admin-user-list";

const USER_SETTINGS_COLLECTION = "userSettings";
const CHUNK = 8;

function companyNameFromSettings(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const n = typeof data.companyName === "string" ? data.companyName.trim() : "";
  return n || null;
}

function planFromSettings(data: Record<string, unknown> | undefined): string {
  if (!data) return "Pro";
  const sub =
    typeof data.subscriptionPlan === "string" ? data.subscriptionPlan.trim() : "";
  if (sub) return sub;
  const p = typeof data.plan === "string" ? data.plan.trim() : "";
  if (p) return p;
  return "Pro";
}

function pickFirstCents(data: Record<string, unknown>, keys: string[]): number | null {
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
  const base: AdminListedUser = {
    ...u,
    companyName: companyNameFromSettings(settingsData),
    plan: planFromSettings(settingsData),
    reportsCount: reportsSnap.data().count,
    proposalsCount: proposalsSnap.data().count,
    leadsCount: leadsSnap.data().count,
  };
  if (includeBilling && settingsData) {
    base.planPriceCents = pickFirstCents(settingsData, ["subscriptionPriceCents", "planPriceCents"]);
    base.lifetimePaidCents = pickFirstCents(settingsData, ["lifetimePaidCents", "totalPaidCents"]);
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
