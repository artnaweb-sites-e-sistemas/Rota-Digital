import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import type { UserAiPromptSettings } from "@/types/user-settings";
import { coerceUserAiPromptSettingsRaw } from "@/lib/user-ai-prompt-coerce";

const USER_SETTINGS_COLLECTION = "userSettings";

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
    console.error("[user-settings-admin] Falha ao inicializar Firebase Admin.", e);
    return null;
  }
}

/** Lê configurações de IA no servidor (reanálise). Sem Admin SDK, retorna null. */
export async function getUserAiPromptSettingsAdmin(userId: string): Promise<UserAiPromptSettings | null> {
  const app = getAdminApp();
  if (!app) return null;
  try {
    const snap = await getFirestore(app).collection(USER_SETTINGS_COLLECTION).doc(userId).get();
    if (!snap.exists) return null;
    return coerceUserAiPromptSettingsRaw(snap.data() as Record<string, unknown>);
  } catch (e) {
    console.error("[user-settings-admin] Leitura Firestore falhou.", e);
    return null;
  }
}
