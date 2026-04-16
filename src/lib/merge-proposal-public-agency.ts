import {
  DEFAULT_COMPANY_ABOUT_NAME,
  DEFAULT_COMPANY_ABOUT_SUMMARY,
} from "@/lib/company-about-defaults";
import type { Proposal } from "@/types/proposal";
import type { UserCompanyAboutSettings } from "@/types/user-settings";

/**
 * Para `/p/[slug]`: junta dados atuais de Configurações → Sobre a Empresa ao snapshot
 * guardado na proposta, para a página pública mostrar logo, capa e texto institucional * mesmo quando o snapshot estiver vazio ou desatualizado.
 */
export function mergeProposalAgencySnapshotForPublicView(
  proposal: Proposal,
  settings: UserCompanyAboutSettings | null,
): Proposal {
  if (!settings) return proposal;
  const snap = proposal.agencySnapshot;
  /**
   * Contactos e links: valores em Configurações substituem o snapshot (inclui string vazia —
   * ex.: remover YouTube deixa de mostrar o link antigo da proposta).
   * Nome, resumo e imagens: ainda preenchem lacunas a partir do snapshot.
   */
  return {
    ...proposal,
    agencySnapshot: {
      companyName:
        settings.companyName?.trim() || snap.companyName?.trim() || DEFAULT_COMPANY_ABOUT_NAME,
      companySummary:
        settings.companySummary?.trim() ||
        snap.companySummary?.trim() ||
        DEFAULT_COMPANY_ABOUT_SUMMARY,
      primaryImageUrl: settings.primaryImageUrl?.trim() || snap.primaryImageUrl,
      secondaryImageUrl: settings.secondaryImageUrl?.trim() || snap.secondaryImageUrl,
      companyPhone: (settings.companyPhone ?? "").trim(),
      whatsApp: (settings.whatsApp ?? "").trim(),
      address: (settings.address ?? "").trim(),
      websiteUrl: (settings.websiteUrl ?? "").trim(),
      instagramUrl: (settings.instagramUrl ?? "").trim(),
      youtubeUrl: (settings.youtubeUrl ?? "").trim(),
      services: (settings.services ?? "").trim(),
    },
  };
}
