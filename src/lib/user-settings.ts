import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type {
  UserAiPromptSettings,
  UserCompanyAboutSettings,
  UserReportCtaSettings,
  UserReportCtaMode,
  UserUiTheme,
} from "@/types/user-settings";
import { coerceUserAiPromptSettingsRaw } from "@/lib/user-ai-prompt-coerce";
import { coerceProposalPlansArray, proposalPlanToFirestoreValue } from "@/lib/proposal-plan-coerce";

const USER_SETTINGS_COLLECTION = "userSettings";

export function sanitizeUserUiTheme(raw: unknown): UserUiTheme {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "dark";
}

export async function getUserUiTheme(userId: string): Promise<UserUiTheme | null> {
  const snap = await getDoc(doc(db, USER_SETTINGS_COLLECTION, userId));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  if (data.uiTheme == null) return null;
  return sanitizeUserUiTheme(data.uiTheme);
}

export async function saveUserUiTheme(userId: string, theme: UserUiTheme): Promise<void> {
  await setDoc(
    doc(db, USER_SETTINGS_COLLECTION, userId),
    {
      uiTheme: sanitizeUserUiTheme(theme),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function coerceSettings(raw: Record<string, unknown>): UserReportCtaSettings {
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
    companyPhone: typeof raw.companyPhone === "string" ? raw.companyPhone : "",
    whatsApp: typeof raw.whatsApp === "string" ? raw.whatsApp : "",
    address: typeof raw.address === "string" ? raw.address : "",
    websiteUrl: typeof raw.websiteUrl === "string" ? raw.websiteUrl : "",
    instagramUrl: typeof raw.instagramUrl === "string" ? raw.instagramUrl : "",
    youtubeUrl: typeof raw.youtubeUrl === "string" ? raw.youtubeUrl : "",
    services: typeof raw.services === "string" ? raw.services : "",
    defaultSpotPlans: coerceProposalPlansArray(raw.defaultSpotPlans),
    defaultRecurringPlans: coerceProposalPlansArray(raw.defaultRecurringPlans),
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

export async function getUserCompanyAboutSettings(
  userId: string
): Promise<UserCompanyAboutSettings | null> {
  const snap = await getDoc(doc(db, USER_SETTINGS_COLLECTION, userId));
  if (!snap.exists()) return null;
  return coerceCompanyAboutSettings(snap.data() as Record<string, unknown>);
}

export async function saveUserCompanyAboutSettings(
  userId: string,
  settings: UserCompanyAboutSettings
): Promise<void> {
  await setDoc(
    doc(db, USER_SETTINGS_COLLECTION, userId),
    {
      companyName: settings.companyName,
      companySummary: settings.companySummary,
      primaryImageUrl: settings.primaryImageUrl,
      secondaryImageUrl: settings.secondaryImageUrl,
      companyPhone: settings.companyPhone,
      whatsApp: settings.whatsApp,
      address: settings.address,
      websiteUrl: settings.websiteUrl,
      instagramUrl: settings.instagramUrl,
      youtubeUrl: settings.youtubeUrl,
      services: settings.services,
      defaultSpotPlans: settings.defaultSpotPlans.map(proposalPlanToFirestoreValue),
      defaultRecurringPlans: settings.defaultRecurringPlans.map(proposalPlanToFirestoreValue),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getUserAiPromptSettings(userId: string): Promise<UserAiPromptSettings | null> {
  const snap = await getDoc(doc(db, USER_SETTINGS_COLLECTION, userId));
  if (!snap.exists()) return null;
  return coerceUserAiPromptSettingsRaw(snap.data() as Record<string, unknown>);
}

export async function saveUserAiPromptSettings(
  userId: string,
  settings: UserAiPromptSettings
): Promise<void> {
  await setDoc(
    doc(db, USER_SETTINGS_COLLECTION, userId),
    {
      aiBasePromptGuidelines: settings.aiBasePromptGuidelines,
      aiRecommendedChannelsPolicy: settings.aiRecommendedChannelsPolicy,
      aiRecommendedChannelIds: settings.aiRecommendedChannelIds,
      aiOpenRecommendedChannelCount: settings.aiOpenRecommendedChannelCount,
      aiServicesFocusPolicy: settings.aiServicesFocusPolicy,
      aiServiceOfferingIds: settings.aiServiceOfferingIds,
      aiCustomServiceLabels: settings.aiCustomServiceLabels,
      aiScoringStrictness: settings.aiScoringStrictness,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
