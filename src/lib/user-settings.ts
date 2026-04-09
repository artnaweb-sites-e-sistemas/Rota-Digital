import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { UserReportCtaSettings, UserReportCtaMode } from "@/types/user-settings";

const USER_SETTINGS_COLLECTION = "userSettings";

function coerceSettings(raw: Record<string, unknown>): UserReportCtaSettings {
  const mode: UserReportCtaMode = raw.ctaMode === "whatsapp" ? "whatsapp" : "url";
  return {
    ctaMode: mode,
    whatsappPhone: typeof raw.whatsappPhone === "string" ? raw.whatsappPhone : "",
    ctaUrl: typeof raw.ctaUrl === "string" ? raw.ctaUrl : "",
  };
}

export async function getUserReportCtaSettings(userId: string): Promise<UserReportCtaSettings | null> {
  const snap = await getDoc(doc(db, USER_SETTINGS_COLLECTION, userId));
  if (!snap.exists()) return null;
  return coerceSettings(snap.data() as Record<string, unknown>);
}

export async function saveUserReportCtaSettings(
  userId: string,
  settings: UserReportCtaSettings
): Promise<void> {
  await setDoc(
    doc(db, USER_SETTINGS_COLLECTION, userId),
    {
      ctaMode: settings.ctaMode,
      whatsappPhone: settings.whatsappPhone,
      ctaUrl: settings.ctaUrl,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
