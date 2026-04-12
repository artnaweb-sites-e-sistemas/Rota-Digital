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

/** Exclui o documento do relatório, limpa `reportId` no lead e apaga evidências no Storage. */
export async function deleteReportAndCleanup(params: {
  reportId: string;
  leadId: string;
  userId: string;
}): Promise<void> {
  const { reportId, leadId, userId } = params;
  const reportRef = doc(db, REPORTS_COLLECTION, reportId);
  const leadRef = doc(db, LEADS_COLLECTION, leadId);

  // Sempre remove o relatório, mesmo que o lead já tenha sido excluído.
  await deleteDoc(reportRef);

  // Só limpa referência no lead se o documento ainda existir.
  try {
    const leadSnap = await getDoc(leadRef);
    if (leadSnap.exists()) {
      const data = leadSnap.data();
      const currentStatus = normalizeLeadStatus(data.status);
      const payload: Record<string, unknown> = {
        reportId: deleteField(),
        updatedAt: serverTimestamp(),
      };
      if (currentStatus === "Rota Gerada") {
        payload.status = "Novo Lead";
      }
      await updateDoc(leadRef, payload);
    }
  } catch {
    // Não bloqueia a exclusão do relatório se houver regra/permissão no lead.
  }

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
  await updateDoc(doc(db, REPORTS_COLLECTION, reportId), reportData);
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
