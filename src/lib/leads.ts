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
import { Lead, normalizeLeadStatus } from "@/types/lead";

const LEADS_COLLECTION = "leads";

function omitUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
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
  } as Lead;
};

export const createLead = async (leadData: Omit<Lead, "id" | "createdAt" | "updatedAt">): Promise<string> => {
  const docRef = await addDoc(collection(db, LEADS_COLLECTION), {
    ...omitUndefined(leadData as Record<string, unknown>),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
};

export const updateLead = async (leadId: string, leadData: Partial<Omit<Lead, "id" | "createdAt" | "updatedAt">>): Promise<void> => {
  const docRef = doc(db, LEADS_COLLECTION, leadId);
  await updateDoc(docRef, {
    ...omitUndefined(leadData as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  });
};

export const deleteLead = async (leadId: string): Promise<void> => {
  await deleteDoc(doc(db, LEADS_COLLECTION, leadId));
};
