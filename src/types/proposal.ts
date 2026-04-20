export const PROPOSAL_PAYMENT_METHOD_IDS = ["pix", "card", "boleto"] as const;
export type ProposalPaymentMethodId = (typeof PROPOSAL_PAYMENT_METHOD_IDS)[number];

export type ProposalPlan = {
  id: string;
  title: string;
  deliverables: string;
  price: string;
  /** Valor promocional (BRL); se preenchido e menor que `price`, o valor original aparece riscado na proposta. */
  promotionalPrice?: string;
  /** Número de parcelas (1 = à vista). Opcional em propostas antigas. */
  installmentCount?: number;
  /**
   * Valor à vista quando há parcelamento (opcional).
   * Se preenchido, substitui a linha “Total” por “Ou à vista sem juros” na visualização.
   */
  cashPrice?: string;
  paymentTerms: string;
  /** Meios de pagamento aceites (PIX, cartão, boleto). Opcional para propostas antigas. */
  paymentMethods?: ProposalPaymentMethodId[];
};

export type ProposalLeadSnapshot = {
  name: string;
  company: string;
  email: string;
  phone?: string;
  websiteUrl?: string;
  instagramUrl?: string;
};

export type ProposalCompanyProfileSnapshot = {
  source: "route" | "manual" | "empty";
  routeReportId?: string;
  companyProfile: string;
  executiveSummary: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
};

export type ProposalAgencySnapshot = {
  companyName: string;
  companySummary: string;
  primaryImageUrl?: string;
  secondaryImageUrl?: string;
  companyPhone?: string;
  whatsApp?: string;
  address?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  youtubeUrl?: string;
  services?: string;
};

export type ProposalEvidences = {
  leadImageUrl?: string;
  agencyImageUrl?: string;
  /** Capa institucional só desta proposta (não altera Configurações globais). */
  agencyCoverUrl?: string;
};

export interface Proposal {
  id: string;
  leadId: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  publicSlug?: string;
  lead: ProposalLeadSnapshot;
  title: string;
  validUntilDays: number;
  validUntilDate: number;
  spotPlans: ProposalPlan[];
  recurringPlans: ProposalPlan[];
  companyProfile: ProposalCompanyProfileSnapshot;
  agencySnapshot: ProposalAgencySnapshot;
  evidences?: ProposalEvidences;
  /** Próximos passos na proposta; se vazio ou ausente, usa texto padrão na UI. */
  nextSteps?: string[];
}
