export type LeadStatus = "Novo" | "Em Contato" | "Qualificado" | "Convertido" | "Perdido";

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
