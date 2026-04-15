import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import type { Proposal } from "@/types/proposal";

const PROPOSALS_COLLECTION = "proposals";

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([entryKey, entryValue]) => [entryKey, stripUndefinedDeep(entryValue)]),
    ) as T;
  }

  return value;
}

export function newProposalPublicSlug(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes =
    typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? crypto.getRandomValues(new Uint8Array(14))
      : Array.from({ length: 14 }, () => Math.floor(Math.random() * 256));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

export async function saveProposal(proposalData: Omit<Proposal, "id">): Promise<string> {
  const docRef = await addDoc(
    collection(db, PROPOSALS_COLLECTION),
    stripUndefinedDeep(proposalData),
  );
  return docRef.id;
}

export async function getProposal(proposalId: string): Promise<Proposal | null> {
  const snap = await getDoc(doc(db, PROPOSALS_COLLECTION, proposalId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Proposal;
}

export async function getProposalsByUser(userId: string): Promise<Proposal[]> {
  const q = query(collection(db, PROPOSALS_COLLECTION), where("userId", "==", userId));
  const snapshot = await getDocs(q);
  const proposals = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Proposal);
  return proposals.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getProposalByLead(leadId: string, userId: string): Promise<Proposal | null> {
  const q = query(
    collection(db, PROPOSALS_COLLECTION),
    where("leadId", "==", leadId),
    where("userId", "==", userId),
    limit(1),
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const item = snapshot.docs[0];
  return { id: item.id, ...item.data() } as Proposal;
}

export async function updateProposal(
  proposalId: string,
  proposalData: Partial<Omit<Proposal, "id" | "leadId" | "userId" | "createdAt">>,
): Promise<void> {
  await updateDoc(doc(db, PROPOSALS_COLLECTION, proposalId), stripUndefinedDeep(proposalData));
}

export async function deleteProposal(proposalId: string): Promise<void> {
  await deleteDoc(doc(db, PROPOSALS_COLLECTION, proposalId));
}

export async function getProposalByPublicSlug(publicSlug: string): Promise<Proposal | null> {
  const q = query(
    collection(db, PROPOSALS_COLLECTION),
    where("publicSlug", "==", publicSlug),
    limit(1),
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const item = snapshot.docs[0];
  return { id: item.id, ...item.data() } as Proposal;
}
