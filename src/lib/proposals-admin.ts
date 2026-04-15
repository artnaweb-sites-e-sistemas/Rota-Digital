import { getFirestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
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

export async function createProposalAdmin(
  proposalData: Omit<Proposal, "id" | "userId"> & { userId?: string },
  userId: string,
): Promise<string> {
  const app = getFirebaseAdminApp();
  if (!app) throw new Error("Firebase Admin não configurado.");
  if (!userId.trim()) throw new Error("Usuário inválido.");

  const db = getFirestore(app);
  const ref = await db.collection(PROPOSALS_COLLECTION).add(
    stripUndefinedDeep({
      ...proposalData,
      userId,
    }),
  );

  return ref.id;
}
