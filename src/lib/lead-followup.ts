import type { Lead, LeadStatus } from "@/types/lead";

const FOLLOWUP_COLOR_STATUSES: LeadStatus[] = ["Em Contato", "Rota Gerada"];
const DAY_MS = 24 * 60 * 60 * 1000;

export function shouldResetFollowupOnStatus(nextStatus: LeadStatus): boolean {
  return nextStatus === "Rota Gerada";
}

export function shouldTrackFollowupStatus(status: LeadStatus): boolean {
  return status === "Em Contato" || status === "Rota Gerada";
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

