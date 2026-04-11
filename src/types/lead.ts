/** Status ativos no funil (Novo e Qualificado foram descontinuados). */
export const LEAD_STATUSES = ["Novo Lead", "Convertido", "Perdido"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

const LEGACY_TO_ACTIVE: Record<string, LeadStatus> = {
  Novo: "Novo Lead",
  Qualificado: "Novo Lead",
  "Em Contato": "Novo Lead",
  "Novo Lead": "Novo Lead",
  Convertido: "Convertido",
  Perdido: "Perdido",
};

/** Garante status válido a partir do Firestore (inclui leads antigos). */
export function normalizeLeadStatus(raw: unknown): LeadStatus {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s in LEGACY_TO_ACTIVE) return LEGACY_TO_ACTIVE[s]!;
  return "Novo Lead";
}

export interface Lead {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  status: LeadStatus;
  createdAt: number;
  updatedAt: number;
  notes?: string;
  reportId?: string;
}
