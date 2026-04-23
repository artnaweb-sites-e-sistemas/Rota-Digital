import { cache } from "react";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import type {
  UserAiPromptSettings,
  UserCompanyAboutSettings,
  UserReportCtaMode,
  UserReportCtaSettings,
} from "@/types/user-settings";
import { coerceUserAiPromptSettingsRaw } from "@/lib/user-ai-prompt-coerce";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { coerceProposalPlansArray } from "@/lib/proposal-plan-coerce";

const USER_SETTINGS_COLLECTION = "userSettings";

function coerceCtaMode(raw: unknown): UserReportCtaMode {
  if (raw === "whatsapp" || raw === "email") return raw;
  return "url";
}

function coerceReportCtaSettings(raw: Record<string, unknown>): UserReportCtaSettings {
  return {
    ctaMode: coerceCtaMode(raw.ctaMode),
    whatsappPhone: typeof raw.whatsappPhone === "string" ? raw.whatsappPhone : "",
    ctaUrl: typeof raw.ctaUrl === "string" ? raw.ctaUrl : "",
    ctaEmail: typeof raw.ctaEmail === "string" ? raw.ctaEmail : "",
  };
}

function coerceCompanyAboutSettings(raw: Record<string, unknown>): UserCompanyAboutSettings {
  return {
    companyName: typeof raw.companyName === "string" ? raw.companyName : "",
    companySummary: typeof raw.companySummary === "string" ? raw.companySummary : "",
    primaryImageUrl: typeof raw.primaryImageUrl === "string" ? raw.primaryImageUrl : "",
    secondaryImageUrl: typeof raw.secondaryImageUrl === "string" ? raw.secondaryImageUrl : "",
    companyPhone: typeof raw.companyPhone === "string" ? raw.companyPhone : "",
    whatsApp: typeof raw.whatsApp === "string" ? raw.whatsApp : "",
    address: typeof raw.address === "string" ? raw.address : "",
    websiteUrl: typeof raw.websiteUrl === "string" ? raw.websiteUrl : "",
    instagramUrl: typeof raw.instagramUrl === "string" ? raw.instagramUrl : "",
    youtubeUrl: typeof raw.youtubeUrl === "string" ? raw.youtubeUrl : "",
    services: typeof raw.services === "string" ? raw.services : "",
    defaultSpotPlans: coerceProposalPlansArray(raw.defaultSpotPlans),
    defaultRecurringPlans: coerceProposalPlansArray(raw.defaultRecurringPlans),
    hideReportAgencyBranding: raw.hideReportAgencyBranding === true,
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

/**
 * E-mail de acesso (Firebase Auth) do utilizador — para `mailto` nos CTAs no servidor
 * (ex.: relação pública ainda sem `userSettings` preenchido).
 */
export async function getOwnerAccountEmailAdmin(userId: string): Promise<string | null> {
  const app = getFirebaseAdminApp();
  if (!app || !userId?.trim()) return null;
  try {
    const u = await getAuth(app).getUser(userId);
    return u.email?.trim() || null;
  } catch {
    return null;
  }
}

export const getCachedOwnerAccountEmailAdmin = cache(getOwnerAccountEmailAdmin);

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
