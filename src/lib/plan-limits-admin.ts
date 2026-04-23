import { getFirestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { planIdFromUserSettings, type PlanId } from "@/lib/plan-limits";

const USER_SETTINGS_COLLECTION = "userSettings";

/** Lê `userSettings/{uid}` no servidor e devolve o plano normalizado. */
export async function getUserPlanAdmin(uid: string): Promise<PlanId> {
  const app = getFirebaseAdminApp();
  if (!app || !uid.trim()) return "starter";
  const snap = await getFirestore(app).collection(USER_SETTINGS_COLLECTION).doc(uid.trim()).get();
  if (!snap.exists) return "starter";
  return planIdFromUserSettings(snap.data() as Record<string, unknown>);
}
