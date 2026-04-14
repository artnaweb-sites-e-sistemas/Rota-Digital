import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { createHash } from "node:crypto";

import type { Lead, LeadSource } from "@/types/lead";
import { normalizeLeadStatus } from "@/types/lead";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { normalizePlaceResourceName } from "@/lib/google-places";
import { onlyDigitsPhone } from "@/lib/report-cta";

const LEADS_COLLECTION = "leads";
const LEADS_CAPTURE_BLOCKLIST_COLLECTION = "leads_capture_blocklist";

function millisFromFirestoreValue(v: unknown): number | undefined {
  if (v && typeof v === "object" && "toMillis" in v && typeof (v as { toMillis: unknown }).toMillis === "function") {
    const n = (v as { toMillis: () => unknown }).toMillis();
    return typeof n === "number" && Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function adminLeadFromDoc(id: string, data: Record<string, unknown>): Lead {
  const createdAt = millisFromFirestoreValue(data.createdAt) ?? Date.now();
  const updatedAt = millisFromFirestoreValue(data.updatedAt) ?? Date.now();
  return {
    id,
    userId: String(data.userId ?? ""),
    name: String(data.name ?? ""),
    email: String(data.email ?? ""),
    phone: String(data.phone ?? ""),
    company: String(data.company ?? ""),
    status: normalizeLeadStatus(data.status),
    createdAt,
    updatedAt,
    notes: typeof data.notes === "string" ? data.notes : undefined,
    reportId: typeof data.reportId === "string" ? data.reportId : undefined,
    websiteUrl: typeof data.websiteUrl === "string" ? data.websiteUrl : undefined,
    instagramUrl: typeof data.instagramUrl === "string" ? data.instagramUrl : undefined,
    googlePlaceId: typeof data.googlePlaceId === "string" ? data.googlePlaceId : undefined,
    leadSource: data.leadSource === "google_places" || data.leadSource === "manual" ? data.leadSource : undefined,
    followupStartedAt: millisFromFirestoreValue(data.followupStartedAt),
  };
}

export async function listLeadsForUserAdmin(userId: string): Promise<Lead[]> {
  const app = getFirebaseAdminApp();
  if (!app) throw new Error("Firebase Admin não configurado.");
  if (!userId.trim()) return [];
  const db = getFirestore(app);
  const snap = await db.collection(LEADS_COLLECTION).where("userId", "==", userId).get();
  return snap.docs.map((d) => adminLeadFromDoc(d.id, d.data()));
}

export async function getLeadByIdForUserAdmin(userId: string, leadId: string): Promise<Lead | null> {
  const app = getFirebaseAdminApp();
  if (!app) throw new Error("Firebase Admin não configurado.");
  if (!userId.trim() || !leadId.trim()) return null;
  const db = getFirestore(app);
  const ref = db.collection(LEADS_COLLECTION).doc(leadId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  if (String(data.userId ?? "") !== userId) return null;
  return adminLeadFromDoc(snap.id, data);
}

export async function deleteLeadAdmin(leadId: string): Promise<void> {
  const app = getFirebaseAdminApp();
  if (!app) throw new Error("Firebase Admin não configurado.");
  if (!leadId.trim()) return;
  const db = getFirestore(app);
  await db.collection(LEADS_COLLECTION).doc(leadId).delete();
}

export type CreateLeadCaptureInput = {
  userId: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  websiteUrl: string;
  instagramUrl: string;
  googlePlaceId: string;
  leadSource: LeadSource;
};

export type LeadCaptureBlockKind = "place" | "phone" | "phone_loose" | "host" | "email";

export type LeadCaptureBlockEntry = {
  kind: LeadCaptureBlockKind;
  value: string;
};

function normalizeWebsiteUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function websiteHost(raw: string): string | null {
  try {
    const u = new URL(normalizeWebsiteUrl(raw));
    const h = u.hostname.replace(/^www\./i, "").toLowerCase();
    return h || null;
  } catch {
    return null;
  }
}

function phoneKey(digits: string): string {
  let d = onlyDigitsPhone(digits);
  if (d.length >= 10 && d.length <= 11 && !d.startsWith("55")) d = `55${d}`;
  return d;
}

function blockDocId(userId: string, kind: LeadCaptureBlockKind, value: string): string {
  return createHash("sha1").update(`${userId}|${kind}|${value}`).digest("hex");
}

export function leadCaptureBlockEntriesFromLead(
  lead: Pick<Lead, "googlePlaceId" | "phone" | "websiteUrl" | "email">,
): LeadCaptureBlockEntry[] {
  const entries: LeadCaptureBlockEntry[] = [];
  const place = lead.googlePlaceId?.trim();
  if (place) {
    entries.push({
      kind: "place",
      value: normalizePlaceResourceName({ id: place, name: place }),
    });
  }

  const pk = phoneKey(lead.phone || "");
  if (pk.length >= 10) {
    entries.push({ kind: "phone", value: pk });
  }

  const loose = onlyDigitsPhone(lead.phone || "");
  if (loose.length >= 8 && loose.length < 10) {
    entries.push({ kind: "phone_loose", value: loose });
  }

  const host = lead.websiteUrl ? websiteHost(lead.websiteUrl) : null;
  if (host) {
    entries.push({ kind: "host", value: host });
  }

  const email = typeof lead.email === "string" ? lead.email.trim().toLowerCase() : "";
  if (email.includes("@")) {
    entries.push({ kind: "email", value: email });
  }

  return Array.from(new Map(entries.map((item) => [`${item.kind}:${item.value}`, item])).values());
}

export async function upsertLeadCaptureBlocksAdmin(
  userId: string,
  entries: LeadCaptureBlockEntry[],
): Promise<void> {
  const app = getFirebaseAdminApp();
  if (!app) throw new Error("Firebase Admin não configurado.");
  if (!userId.trim() || entries.length === 0) return;
  const db = getFirestore(app);
  const batch = db.batch();
  for (const entry of entries) {
    const value = entry.value.trim();
    if (!value) continue;
    const docRef = db.collection(LEADS_CAPTURE_BLOCKLIST_COLLECTION).doc(blockDocId(userId, entry.kind, value));
    batch.set(
      docRef,
      {
        userId,
        kind: entry.kind,
        value,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();
}

export async function listLeadCaptureBlocksForUserAdmin(userId: string): Promise<LeadCaptureBlockEntry[]> {
  const app = getFirebaseAdminApp();
  if (!app) throw new Error("Firebase Admin não configurado.");
  if (!userId.trim()) return [];
  const db = getFirestore(app);
  const snap = await db
    .collection(LEADS_CAPTURE_BLOCKLIST_COLLECTION)
    .where("userId", "==", userId)
    .select("kind", "value")
    .get();
  const out: LeadCaptureBlockEntry[] = [];
  for (const docSnap of snap.docs) {
    const data = docSnap.data() as { kind?: unknown; value?: unknown };
    const kind = typeof data.kind === "string" ? data.kind : "";
    const value = typeof data.value === "string" ? data.value.trim() : "";
    if (!value) continue;
    if (kind === "place" || kind === "phone" || kind === "phone_loose" || kind === "host" || kind === "email") {
      out.push({ kind, value });
    }
  }
  return out;
}

export async function createLeadCaptureAdmin(input: CreateLeadCaptureInput): Promise<string> {
  const app = getFirebaseAdminApp();
  if (!app) throw new Error("Firebase Admin não configurado.");
  const db = getFirestore(app);
  const ref = await db.collection(LEADS_COLLECTION).add({
    userId: input.userId,
    name: input.name,
    company: input.company,
    phone: input.phone,
    email: input.email,
    websiteUrl: input.websiteUrl,
    instagramUrl: input.instagramUrl,
    googlePlaceId: input.googlePlaceId,
    leadSource: input.leadSource,
    status: "Novo Lead",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}
