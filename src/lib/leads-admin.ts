import { FieldValue, getFirestore } from "firebase-admin/firestore";

import type { Lead, LeadSource } from "@/types/lead";
import { normalizeLeadStatus } from "@/types/lead";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";

const LEADS_COLLECTION = "leads";

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
