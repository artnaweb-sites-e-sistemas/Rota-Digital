export type UserReportCtaMode = "whatsapp" | "url";

/** Preferências de CTA nos relatórios (por usuário / dono da conta). */
export interface UserReportCtaSettings {
  ctaMode: UserReportCtaMode;
  /** Telefone com DDI, apenas dígitos (ex: 5511987654321). */
  whatsappPhone: string;
  /** URL completa (https://...) quando `ctaMode === "url"`. */
  ctaUrl: string;
}
