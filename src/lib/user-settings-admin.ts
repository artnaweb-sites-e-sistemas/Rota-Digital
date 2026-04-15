import { cache } from "react";
import { getFirestore } from "firebase-admin/firestore";

import type {
  UserAiPromptSettings,
  UserCompanyAboutSettings,
  UserReportCtaMode,
  UserReportCtaSettings,
} from "@/types/user-settings";
import { coerceUserAiPromptSettingsRaw } from "@/lib/user-ai-prompt-coerce";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";

const USER_SETTINGS_COLLECTION = "userSettings";

function coerceReportCtaSettings(raw: Record<string, unknown>): UserReportCtaSettings {
  const mode: UserReportCtaMode = raw.ctaMode === "whatsapp" ? "whatsapp" : "url";
  return {
    ctaMode: mode,
    whatsappPhone: typeof raw.whatsappPhone === "string" ? raw.whatsappPhone : "",
    ctaUrl: typeof raw.ctaUrl === "string" ? raw.ctaUrl : "",
  };
}

function coerceCompanyAboutSettings(raw: Record<string, unknown>): UserCompanyAboutSettings {
  return {
    companyName: typeof raw.companyName === "string" ? raw.companyName : "",
    companySummary: typeof raw.companySummary === "string" ? raw.companySummary : "",
    primaryImageUrl: typeof raw.primaryImageUrl === "string" ? raw.primaryImageUrl : "",
    secondaryImageUrl: typeof raw.secondaryImageUrl === "string" ? raw.secondaryImageUrl : "",
  };
}

/** Lê CTAs do relatório no servidor (página pública `/r/...`). Sem Admin SDK, retorna null. */
export async function getUserReportCtaSettingsAdmin(
  userId: string
): Promise<UserReportCtaSettings | null> {
  const app = getFirebaseAdminApp();
  if (!app || !userId?.trim()) return null;
  try {
    const snap = await getFirestore(app).collection(USER_SETTINGS_COLLECTION).doc(userId).get();
    if (!snap.exists) return null;
    return coerceReportCtaSettings(snap.data() as Record<string, unknown>);
  } catch (e) {
    console.error("[user-settings-admin] Leitura CTA Firestore falhou.", e);
    return null;
  }
}

/** Uma leitura de CTA por `userId` por request (ex.: compartilhamento público). */
export const getCachedUserReportCtaSettingsAdmin = cache(getUserReportCtaSettingsAdmin);

export async function getUserCompanyAboutSettingsAdmin(
  userId: string
): Promise<UserCompanyAboutSettings | null> {
  const app = getFirebaseAdminApp();
  if (!app || !userId?.trim()) return null;
  try {
    const snap = await getFirestore(app).collection(USER_SETTINGS_COLLECTION).doc(userId).get();
    if (!snap.exists) return null;
    return coerceCompanyAboutSettings(snap.data() as Record<string, unknown>);
  } catch (e) {
    console.error("[user-settings-admin] Leitura Sobre a Empresa Firestore falhou.", e);
    return null;
  }
}

export const getCachedUserCompanyAboutSettingsAdmin = cache(getUserCompanyAboutSettingsAdmin);

/** Lê configurações de IA no servidor (reanálise). Sem Admin SDK, retorna null. */
export async function getUserAiPromptSettingsAdmin(userId: string): Promise<UserAiPromptSettings | null> {
  const app = getFirebaseAdminApp();
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
