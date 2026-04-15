import { getFirestore } from "firebase-admin/firestore";

import type { Proposal } from "@/types/proposal";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";

const PROPOSALS_COLLECTION = "proposals";

export async function getPublicProposalBySlug(publicSlug: string): Promise<Proposal | null> {
  const slug = publicSlug?.trim();
  if (!slug) return null;

  const app = getFirebaseAdminApp();
  if (app) {
    try {
      const db = getFirestore(app);
      const snapshot = await db
        .collection(PROPOSALS_COLLECTION)
        .where("publicSlug", "==", slug)
        .limit(1)
        .get();
      if (snapshot.empty) return null;
      const item = snapshot.docs[0];
      return { id: item.id, ...item.data() } as Proposal;
    } catch (e) {
      console.error("[public-proposal-server] Leitura Admin Firestore falhou.", e);
      return null;
    }
  }

  try {
    const { getProposalByPublicSlug } = await import("@/lib/proposals");
    return await getProposalByPublicSlug(slug);
  } catch (e) {
    console.error("[public-proposal-server] Leitura cliente Firestore falhou.", e);
    return null;
  }
}
