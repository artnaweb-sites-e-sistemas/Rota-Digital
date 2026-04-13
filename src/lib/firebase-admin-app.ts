import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";

let cached: App | null | undefined;

/** Inicializa uma única app Admin a partir de `FIREBASE_SERVICE_ACCOUNT_JSON`. */
export function getFirebaseAdminApp(): App | null {
  if (cached !== undefined) return cached;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    cached = null;
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!getApps().length) {
      initializeApp({ credential: cert(parsed) });
    }
    cached = getApps()[0] ?? null;
    return cached;
  } catch (e) {
    console.error("[firebase-admin-app] Falha ao inicializar Firebase Admin.", e);
    cached = null;
    return null;
  }
}
