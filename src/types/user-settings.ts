export type UserReportCtaMode = "whatsapp" | "url";

/** Tema do painel e base para páginas com alternância (ex.: relatório público). */
export type UserUiTheme = "light" | "dark" | "system";

/** Preferências de CTA nos relatórios (por usuário / dono da conta). */
export interface UserReportCtaSettings {
  ctaMode: UserReportCtaMode;
  /** Telefone com DDI, apenas dígitos (ex: 5511987654321). */
  whatsappPhone: string;
  /** URL completa (https://...) quando `ctaMode === "url"`. */
  ctaUrl: string;
}

/** Livre = IA sugere qualquer canal; restrito = só rótulos selecionados em recommendedChannels. */
export type AiRecommendedChannelsPolicy = "open" | "restricted";

/** Livre = IA sugere qualquer tipo de entrega; restrito = priorizar só serviços selecionados. */
export type AiServicesFocusPolicy = "open" | "restricted";

/**
 * Calibra quão “duro” o modelo é nas notas (impacta diagnosticScores e digitalMaturityScore).
 * O painel usa &lt;4 vermelho, 4-6,9 amarelo, ≥7 verde.
 */
export type AiScoringStrictness = "free" | "low" | "medium" | "high";

/** Diretrizes, canais (mídia) e foco em serviços (entregas da agência) para a IA. */
export interface UserAiPromptSettings {
  aiBasePromptGuidelines: string;
  aiRecommendedChannelsPolicy: AiRecommendedChannelsPolicy;
  /** IDs de `AI_RECOMMENDED_CHANNEL_OPTIONS` quando policy === "restricted". */
  aiRecommendedChannelIds: string[];
  /**
   * Modo livre: quantos canais a IA deve retornar em recommendedChannels (2–8). Ignorado em modo restrito.
   */
  aiOpenRecommendedChannelCount: number;
  aiServicesFocusPolicy: AiServicesFocusPolicy;
  /** IDs de `AI_AGENCY_SERVICE_OPTIONS` quando serviços restritos. */
  aiServiceOfferingIds: string[];
  /** Serviços digitados livremente (ex.: agente de IA, motion). */
  aiCustomServiceLabels: string[];
  /** Quão exigente a IA deve ser ao atribuir notas no relatório. */
  aiScoringStrictness: AiScoringStrictness;
}
