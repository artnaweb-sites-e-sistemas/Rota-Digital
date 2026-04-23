import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  deleteDoc,
  limit,
  updateDoc,
  writeBatch,
  deleteField,
  serverTimestamp,
} from "firebase/firestore";
import { deleteReportEvidenceForLead } from "./evidence-storage";
import { db } from "./firebase";
import { normalizeLeadStatus } from "@/types/lead";
import { RotaDigitalReport } from "@/types/report";

const REPORTS_COLLECTION = "reports";

/** Firestore (cliente) rejeita valores `undefined` em updates — remove recursivamente (preserva `null`). */
function omitUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => omitUndefinedDeep(item));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    const next = omitUndefinedDeep(v);
    if (next !== undefined) out[k] = next;
  }
  return out;
}
const LEADS_COLLECTION = "leads";

export const saveReport = async (
  reportData: Omit<RotaDigitalReport, "id">
): Promise<string> => {
  const docRef = await addDoc(collection(db, REPORTS_COLLECTION), reportData);
  return docRef.id;
};

export const getReport = async (
  reportId: string
): Promise<RotaDigitalReport | null> => {
  const snap = await getDoc(doc(db, REPORTS_COLLECTION, reportId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as RotaDigitalReport;
};

export const getReportsByUser = async (
  userId: string
): Promise<RotaDigitalReport[]> => {
  const q = query(
    collection(db, REPORTS_COLLECTION),
    where("userId", "==", userId)
  );
  const snapshot = await getDocs(q);
  const reports = snapshot.docs.map(
    (d) => ({ id: d.id, ...d.data() } as RotaDigitalReport)
  );
  // Sort client-side (avoids needing a Firestore composite index)
  return reports.sort((a, b) => b.createdAt - a.createdAt);
};

export const getReportByLead = async (
  leadId: string,
  userId: string
): Promise<RotaDigitalReport | null> => {
  const q = query(
    collection(db, REPORTS_COLLECTION),
    where("leadId", "==", leadId),
    where("userId", "==", userId)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const d = snapshot.docs[0];
  return { id: d.id, ...d.data() } as RotaDigitalReport;
};

export const deleteReport = async (reportId: string): Promise<void> => {
  await deleteDoc(doc(db, REPORTS_COLLECTION, reportId));
};

/**
 * Exclui o relatório e, no mesmo batch, atualiza o lead:
 * remove `reportId` só se ainda apontava para este relatório; se o status era
 * "Rota Gerada", volta para "Novo Lead" (sem rota ativa não faz sentido manter).
 * Assim, ao gerar de novo, o fluxo volta a marcar "Rota Gerada" normalmente.
 */
export async function deleteReportAndCleanup(params: {
  reportId: string;
  leadId: string;
  userId: string;
}): Promise<void> {
  const { reportId, leadId, userId } = params;
  const reportRef = doc(db, REPORTS_COLLECTION, reportId);
  const leadRef = doc(db, LEADS_COLLECTION, leadId);

  const leadSnap = await getDoc(leadRef);
  let leadPatch: Record<string, unknown> | null = null;
  if (leadSnap.exists()) {
    const data = leadSnap.data();
    const storedReportId = typeof data.reportId === "string" ? data.reportId.trim() : "";
    if (storedReportId === reportId) {
      const currentStatus = normalizeLeadStatus(data.status);
      leadPatch = {
        reportId: deleteField(),
        updatedAt: serverTimestamp(),
        ...(currentStatus === "Rota Gerada" ? { status: "Novo Lead" } : {}),
      };
    }
  }

  const batch = writeBatch(db);
  batch.delete(reportRef);
  if (leadPatch) {
    batch.update(leadRef, leadPatch);
  }
  await batch.commit();

  try {
    await deleteReportEvidenceForLead(userId, leadId);
  } catch {
    // Não bloqueia a exclusão do relatório se a limpeza do storage falhar.
  }
}

/** Exclui todos os relatórios vinculados ao lead e limpa evidências no Storage. */
export async function deleteReportsByLead(params: {
  leadId: string;
  userId: string;
}): Promise<void> {
  const { leadId, userId } = params;
  const q = query(
    collection(db, REPORTS_COLLECTION),
    where("leadId", "==", leadId),
    where("userId", "==", userId)
  );
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    const batch = writeBatch(db);
    snapshot.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
  await deleteReportEvidenceForLead(userId, leadId);
}

export const updateReport = async (
  reportId: string,
  reportData: Partial<Omit<RotaDigitalReport, "id" | "leadId" | "userId" | "createdAt">>
): Promise<void> => {
  const cleaned = omitUndefinedDeep(reportData) as Record<string, unknown>;
  await updateDoc(doc(db, REPORTS_COLLECTION, reportId), cleaned);
};

/** Leitura pública por slug (requer regra Firestore que permita get/list anônimo nesta query). */
export const getReportByPublicSlug = async (
  publicSlug: string
): Promise<RotaDigitalReport | null> => {
  const q = query(
    collection(db, REPORTS_COLLECTION),
    where("publicSlug", "==", publicSlug),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const d = snapshot.docs[0];
  return { id: d.id, ...d.data() } as RotaDigitalReport;
};
