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
import { billingPlanFromUserSettingsRaw, type SidebarBillingPlan } from "@/lib/billing-plan-label";

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

function coerceCtaMode(raw: unknown): UserReportCtaMode {
  if (raw === "whatsapp" || raw === "email") return raw;
  return "url";
}

function coerceSettings(raw: Record<string, unknown>): UserReportCtaSettings {
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
      ctaEmail: settings.ctaEmail,
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

/** Mesmo documento `userSettings`: empresa + plano (para sidebar em tempo real). */
export function parseUserSettingsDocForDashboard(raw: Record<string, unknown>): {
  companyAbout: UserCompanyAboutSettings;
  plan: SidebarBillingPlan;
} {
  return {
    companyAbout: coerceCompanyAboutSettings(raw),
    plan: billingPlanFromUserSettingsRaw(raw.subscriptionPlan ?? raw.plan),
  };
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
      hideReportAgencyBranding: settings.hideReportAgencyBranding === true,
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
