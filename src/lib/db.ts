import { db } from "./firebase";
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp
} from "firebase/firestore";

export type LeadStatus = "NOVO" | "CONTATADO" | "EM_NEGOCIACAO" | "CONVERTIDO" | "PERDIDO";

export interface Lead {
  id?: string;
  userId: string;
  empresa: string;
  contatoNome?: string;
  telefone?: string;
  email?: string;
  status: LeadStatus;
  observacoes?: string;
  createdAt?: any;
  updatedAt?: any;
  reportId?: string; // Reference to generated AI report
}

const COLLECTION_NAME = "leads";

/**
 * Creates a new lead in Firestore
 */
export async function createLead(leadData: Omit<Lead, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const newLeadRef = doc(collection(db, COLLECTION_NAME));
  await setDoc(newLeadRef, {
    ...leadData,
    id: newLeadRef.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return newLeadRef.id;
}

/**
 * Gets a specific lead by ID
 */
export async function getLead(id: string): Promise<Lead | null> {
  const leadRef = doc(db, COLLECTION_NAME, id);
  const snap = await getDoc(leadRef);
  if (snap.exists()) {
    return snap.data() as Lead;
  }
  return null;
}

/**
 * Gets all leads for a specific user
 */
export async function getUserLeads(userId: string): Promise<Lead[]> {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  
  const querySnapshot = await getDocs(q);
  const leads: Lead[] = [];
  querySnapshot.forEach((doc) => {
    leads.push(doc.data() as Lead);
  });
  
  return leads;
}

/**
 * Updates a lead
 */
export async function updateLead(id: string, data: Partial<Lead>): Promise<void> {
  const leadRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(leadRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Deletes a lead
 */
export async function deleteLead(id: string): Promise<void> {
  const leadRef = doc(db, COLLECTION_NAME, id);
  await deleteDoc(leadRef);
}
