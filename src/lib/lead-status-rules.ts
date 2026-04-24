import type { LeadStatus } from "@/types/lead";

/** Status a partir dos quais não se pode voltar para “Novo Lead”. */
export const NOVO_LEAD_BLOCKED_FROM_STATUSES: readonly LeadStatus[] = [
  "Em Contato",
  "Proposta",
  "Convertido",
  "Perdido",
];

export function isNovoLeadBlockedFromCurrent(currentStatus?: LeadStatus): boolean {
  return Boolean(currentStatus && NOVO_LEAD_BLOCKED_FROM_STATUSES.includes(currentStatus));
}

/** Lead tem rota gerada (relatório existe ou ainda há referência no documento). */
export function leadHasGeneratedRoute(params: {
  reportDocumentExists: boolean;
  reportIdOnLead?: string | null;
}): boolean {
  return params.reportDocumentExists || Boolean(params.reportIdOnLead?.trim());
}

/**
 * Se o utilizador pode escolher este status para o lead neste momento.
 * @param currentStatus status atual do lead (obrigatório para regras do funil, ex.: não voltar para “Novo Lead” a partir de etapas avançadas).
 */
export function isLeadStatusSelectable(
  status: LeadStatus,
  hasRoute: boolean,
  currentStatus?: LeadStatus,
): boolean {
  if (status === "Novo Lead" && isNovoLeadBlockedFromCurrent(currentStatus)) return false;
  if (status === "Novo Lead" && hasRoute) return false;
  if (status === "Em Contato" && hasRoute) return false;
  if (status === "Rota Gerada" && !hasRoute) return false;
  // Proposta → Rota Gerada é permitido (e após re-gerar a rota o cliente força "Rota Gerada").
  return true;
}
