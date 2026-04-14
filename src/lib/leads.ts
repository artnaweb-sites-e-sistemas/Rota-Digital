import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "./firebase";
import { Lead, normalizeLeadStatus, type LeadStatus } from "@/types/lead";
import { shouldTrackFollowupStatus } from "@/lib/lead-followup";

const LEADS_COLLECTION = "leads";

function omitUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
}

function toMillisIfTimestampLike(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof (value as { toMillis?: unknown }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return undefined;
}

function shouldStartFollowup(status: LeadStatus): boolean {
  return shouldTrackFollowupStatus(status);
}

export const getLeads = async (userId: string): Promise<Lead[]> => {
  const q = query(collection(db, LEADS_COLLECTION), where("userId", "==", userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      status: normalizeLeadStatus(data.status),
      // Handle the serverTimestamp properly if it's null during initial writes, etc.
      createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now(),
      updatedAt: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Date.now(),
      followupStartedAt: toMillisIfTimestampLike(data.followupStartedAt),
    } as Lead;
  });
};

export const getLead = async (leadId: string): Promise<Lead | null> => {
  const snap = await getDoc(doc(db, LEADS_COLLECTION, leadId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    ...data,
    status: normalizeLeadStatus(data.status),
    createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now(),
    updatedAt: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Date.now(),
    followupStartedAt: toMillisIfTimestampLike(data.followupStartedAt),
  } as Lead;
};

export const createLead = async (leadData: Omit<Lead, "id" | "createdAt" | "updatedAt">): Promise<string> => {
  const normalizedStatus = normalizeLeadStatus(leadData.status);
  const followupStartedAt =
    leadData.followupStartedAt ??
    (shouldStartFollowup(normalizedStatus) ? Date.now() : undefined);
  const docRef = await addDoc(collection(db, LEADS_COLLECTION), {
    ...omitUndefined({
      ...(leadData as Record<string, unknown>),
      status: normalizedStatus,
      followupStartedAt,
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
};

export const updateLead = async (leadId: string, leadData: Partial<Omit<Lead, "id" | "createdAt" | "updatedAt">>): Promise<void> => {
  const docRef = doc(db, LEADS_COLLECTION, leadId);
  const patch = omitUndefined(leadData as Record<string, unknown>);
  if (typeof leadData.status === "string") {
    const nextStatus = normalizeLeadStatus(leadData.status);
    patch.status = nextStatus;
    const currentSnap = await getDoc(docRef);
    if (currentSnap.exists()) {
      const currentData = currentSnap.data();
      const currentStatus = normalizeLeadStatus(currentData.status);
      if (currentStatus !== nextStatus) {
        patch.followupStartedAt = Date.now();
      }
    }
  }
  await updateDoc(docRef, {
    ...patch,
    updatedAt: serverTimestamp(),
  });
};

export const deleteLead = async (leadId: string): Promise<void> => {
  await deleteDoc(doc(db, LEADS_COLLECTION, leadId));
};
