import { getFirestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import type { RotaDigitalReport } from "@/types/report";

const REPORTS_COLLECTION = "reports";

/** Conta Rotas Digitais criadas pelo utilizador desde `fromMs` (inclusive). */
export async function countReportsSinceAdmin(userId: string, fromMs: number): Promise<number> {
  const app = getFirebaseAdminApp();
  if (!app) throw new Error("Firebase Admin não configurado.");
  const db = getFirestore(app);
  const snap = await db
    .collection(REPORTS_COLLECTION)
    .where("userId", "==", userId)
    .where("createdAt", ">=", fromMs)
    .count()
    .get();
  return snap.data().count ?? 0;
}

/** Lê uma Rota Digital pelo id, garantindo posse via `userId`. */
export async function getReportByIdAdmin(
  reportId: string,
  expectedUserId?: string,
): Promise<RotaDigitalReport | null> {
  const app = getFirebaseAdminApp();
  if (!app) throw new Error("Firebase Admin não configurado.");
  const db = getFirestore(app);
  const ref = db.collection(REPORTS_COLLECTION).doc(reportId.trim());
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  if (expectedUserId && String(data.userId ?? "") !== expectedUserId) {
    return null;
  }
  return { id: snap.id, ...(data as Record<string, unknown>) } as RotaDigitalReport;
}
