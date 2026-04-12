import type { LeadStatus } from "@/types/lead";

/** Lead tem rota gerada (relatório existe ou ainda há referência no documento). */
export function leadHasGeneratedRoute(params: {
  reportDocumentExists: boolean;
  reportIdOnLead?: string | null;
}): boolean {
  return params.reportDocumentExists || Boolean(params.reportIdOnLead?.trim());
}

/** Se o utilizador pode escolher este status para o lead neste momento. */
export function isLeadStatusSelectable(status: LeadStatus, hasRoute: boolean): boolean {
  if (status === "Novo Lead" && hasRoute) return false;
  if (status === "Rota Gerada" && !hasRoute) return false;
  return true;
}
