import type { Lead } from "@/types/lead";
import type { ProposalLeadSnapshot } from "@/types/proposal";

export function proposalLeadSnapshotFromLead(lead: Lead): ProposalLeadSnapshot {
  return {
    name: lead.name?.trim() ?? "",
    company: lead.company?.trim() ?? "",
    email: lead.email?.trim() ?? "",
    ...(lead.phone?.trim() ? { phone: lead.phone.trim() } : {}),
    ...(lead.websiteUrl?.trim() ? { websiteUrl: lead.websiteUrl.trim() } : {}),
    ...(lead.instagramUrl?.trim() ? { instagramUrl: lead.instagramUrl.trim() } : {}),
  };
}

function norm(s: string | undefined): string {
  return (s ?? "").trim();
}

export function proposalLeadSnapshotsDiffer(a: ProposalLeadSnapshot, b: ProposalLeadSnapshot): boolean {
  return (
    norm(a.name) !== norm(b.name) ||
    norm(a.company) !== norm(b.company) ||
    norm(a.email) !== norm(b.email) ||
    norm(a.phone) !== norm(b.phone) ||
    norm(a.websiteUrl) !== norm(b.websiteUrl) ||
    norm(a.instagramUrl) !== norm(b.instagramUrl)
  );
}

/** Se o título for só o padrão com a empresa antiga, gera o novo título com a empresa atual. */
export function proposalTitleIfDefaultForCompany(
  currentTitle: string,
  previousCompany: string,
  nextCompany: string,
): string | undefined {
  const expected = `Proposta para ${previousCompany.trim()}`;
  if (currentTitle.trim() !== expected) return undefined;
  if (previousCompany.trim() === nextCompany.trim()) return undefined;
  return `Proposta para ${nextCompany.trim()}`;
}
