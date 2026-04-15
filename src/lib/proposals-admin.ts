import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { defaultProposalNextStepsList } from "@/lib/proposal-default-next-steps";
import type { Proposal } from "@/types/proposal";
import { normalizeLeadStatus, type LeadStatus } from "@/types/lead";

const PROPOSALS_COLLECTION = "proposals";
const LEADS_COLLECTION = "leads";

export type CreateProposalAdminOptions = {
  /** Atualiza o lead na mesma operação em batch (junto com a proposta). */
  advanceLeadStatusTo?: LeadStatus;
};

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
  options?: CreateProposalAdminOptions,
): Promise<string> {
  const app = getFirebaseAdminApp();
  if (!app) throw new Error("Firebase Admin não configurado.");
  if (!userId.trim()) throw new Error("Usuário inválido.");

  const db = getFirestore(app);
  const rawSteps = proposalData.nextSteps;
  const hasMeaningfulSteps =
    Array.isArray(rawSteps) && rawSteps.some((s) => typeof s === "string" && s.trim().length > 0);
  const nextSteps = hasMeaningfulSteps
    ? rawSteps!.map((s) => String(s).trim()).filter(Boolean)
    : defaultProposalNextStepsList();

  const payload = stripUndefinedDeep({
    ...proposalData,
    userId,
    nextSteps,
  });

  const leadId = typeof proposalData.leadId === "string" ? proposalData.leadId.trim() : "";
  const advanceTo = options?.advanceLeadStatusTo;

  if (advanceTo && leadId) {
    const leadRef = db.collection(LEADS_COLLECTION).doc(leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      throw new Error("Lead não encontrado.");
    }
    const leadData = leadSnap.data() as Record<string, unknown>;
    if (String(leadData.userId ?? "") !== userId) {
      throw new Error("Lead não pertence a esta conta.");
    }
    const currentStatus = normalizeLeadStatus(leadData.status);
    const nextStatus = normalizeLeadStatus(advanceTo);
    const proposalRef = db.collection(PROPOSALS_COLLECTION).doc();
    const batch = db.batch();
    batch.set(proposalRef, payload);
    batch.update(leadRef, {
      status: nextStatus,
      updatedAt: FieldValue.serverTimestamp(),
      ...(currentStatus !== nextStatus ? { followupStartedAt: Date.now() } : {}),
    });
    await batch.commit();
    return proposalRef.id;
  }

  const ref = await db.collection(PROPOSALS_COLLECTION).add(payload);
  return ref.id;
}
