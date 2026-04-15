import type { Lead, LeadStatus } from "@/types/lead";

const FOLLOWUP_COLOR_STATUSES: LeadStatus[] = ["Em Contato", "Rota Gerada", "Proposta"];
const DAY_MS = 24 * 60 * 60 * 1000;

export function shouldResetFollowupOnStatus(nextStatus: LeadStatus): boolean {
  return nextStatus === "Rota Gerada";
}

export function shouldTrackFollowupStatus(status: LeadStatus): boolean {
  return status === "Em Contato" || status === "Rota Gerada" || status === "Proposta";
}

export function statusUsesFollowupUrgencyColor(status: LeadStatus): boolean {
  return FOLLOWUP_COLOR_STATUSES.includes(status);
}

function toLocalDayStart(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function fallbackFollowupStart(lead: Lead): number {
  if (typeof lead.followupStartedAt === "number" && Number.isFinite(lead.followupStartedAt)) {
    return lead.followupStartedAt;
  }
  return lead.createdAt;
}

export function getLeadFollowupDay(lead: Lead, nowMs: number = Date.now()): number {
  const startMs = fallbackFollowupStart(lead);
  const diffDays = Math.floor((toLocalDayStart(nowMs) - toLocalDayStart(startMs)) / DAY_MS);
  return Math.max(1, diffDays + 1);
}

/**
 * Ordenação na tabela de leads (ex.: "Todos os status"): quem está em follow-up ativo
 * fica no topo; "Convertido"/"Perdido" não sobem só por terem D maior.
 */
export function leadTableSortRank(status: LeadStatus): 0 | 1 | 2 {
  if (status === "Em Contato" || status === "Rota Gerada" || status === "Proposta") return 0;
  if (status === "Novo Lead") return 1;
  return 2;
}

/** Comparador para lista de leads: tier → dia D (só tiers 0–1) → `updatedAt`. */
export function compareLeadsForTableSort(a: Lead, b: Lead): number {
  const ra = leadTableSortRank(a.status);
  const rb = leadTableSortRank(b.status);
  if (ra !== rb) return ra - rb;
  if (ra === 0 || ra === 1) {
    const dayDiff = getLeadFollowupDay(b) - getLeadFollowupDay(a);
    if (dayDiff !== 0) return dayDiff;
  }
  return b.updatedAt - a.updatedAt;
}

