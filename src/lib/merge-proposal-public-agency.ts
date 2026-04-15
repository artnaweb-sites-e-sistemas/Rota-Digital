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
  return {
    ...proposal,
    agencySnapshot: {
      companyName: settings.companyName?.trim() || snap.companyName,
      companySummary: settings.companySummary?.trim() || snap.companySummary,
      primaryImageUrl: settings.primaryImageUrl?.trim() || snap.primaryImageUrl,
      secondaryImageUrl: settings.secondaryImageUrl?.trim() || snap.secondaryImageUrl,
    },
  };
}
