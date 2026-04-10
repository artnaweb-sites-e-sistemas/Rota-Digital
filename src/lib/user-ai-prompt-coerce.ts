import type {
  AiRecommendedChannelsPolicy,
  AiScoringStrictness,
  AiServicesFocusPolicy,
  UserAiPromptSettings,
} from "@/types/user-settings";
import { sanitizeAiRecommendedChannelIds } from "@/lib/ai-recommended-channel-options";
import {
  sanitizeAiCustomServiceLabels,
  sanitizeAiServiceOfferingIds,
} from "@/lib/ai-agency-services";
import { sanitizeAiScoringStrictness } from "@/lib/ai-scoring-strictness-prompt";
import { sanitizeAiOpenRecommendedChannelCount } from "@/lib/ai-recommended-channels-prompt";

export function coerceUserAiPromptSettingsRaw(raw: Record<string, unknown>): UserAiPromptSettings {
  const channelPolicy: AiRecommendedChannelsPolicy =
    raw.aiRecommendedChannelsPolicy === "restricted" ? "restricted" : "open";
  const servicesPolicy: AiServicesFocusPolicy =
    raw.aiServicesFocusPolicy === "restricted" ? "restricted" : "open";
  const aiScoringStrictness: AiScoringStrictness = sanitizeAiScoringStrictness(raw.aiScoringStrictness);
  return {
    aiBasePromptGuidelines:
      typeof raw.aiBasePromptGuidelines === "string" ? raw.aiBasePromptGuidelines : "",
    aiRecommendedChannelsPolicy: channelPolicy,
    aiRecommendedChannelIds: sanitizeAiRecommendedChannelIds(raw.aiRecommendedChannelIds),
    aiOpenRecommendedChannelCount: sanitizeAiOpenRecommendedChannelCount(raw.aiOpenRecommendedChannelCount),
    aiServicesFocusPolicy: servicesPolicy,
    aiServiceOfferingIds: sanitizeAiServiceOfferingIds(raw.aiServiceOfferingIds),
    aiCustomServiceLabels: sanitizeAiCustomServiceLabels(raw.aiCustomServiceLabels),
    aiScoringStrictness,
  };
}
