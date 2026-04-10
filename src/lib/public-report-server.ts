import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import type { RotaDigitalReport } from "@/types/report";

const REPORTS_COLLECTION = "reports";

function getAdminApp() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!getApps().length) {
      initializeApp({ credential: cert(parsed) });
    }
    return getApps()[0] ?? null;
  } catch (e) {
    console.error("[public-report-server] Falha ao inicializar Firebase Admin.", e);
    return null;
  }
}

/**
 * Lê relatório público por slug no servidor, sem depender de login.
 * Com `FIREBASE_SERVICE_ACCOUNT_JSON` na Vercel, usa Admin SDK (ignora regras de cliente).
 * Sem isso, tenta o SDK web (exige regra Firestore permitindo leitura anônima na query).
 */
export async function getPublicProposalReportBySlug(
  publicSlug: string
): Promise<RotaDigitalReport | null> {
  const slug = publicSlug?.trim();
  if (!slug) return null;

  const adminApp = getAdminApp();
  if (adminApp) {
    try {
      const db = getFirestore(adminApp);
      const snap = await db
        .collection(REPORTS_COLLECTION)
        .where("publicSlug", "==", slug)
        .limit(1)
        .get();
      if (snap.empty) return null;
      const doc = snap.docs[0];
      return { id: doc.id, ...doc.data() } as RotaDigitalReport;
    } catch (e) {
      console.error("[public-report-server] Leitura Admin Firestore falhou.", e);
      return null;
    }
  }

  try {
    const { getReportByPublicSlug } = await import("@/lib/reports");
    return await getReportByPublicSlug(slug);
  } catch (e) {
    console.error("[public-report-server] Leitura cliente Firestore falhou (regras / rede).", e);
    return null;
  }
}
