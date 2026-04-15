export type ProposalPlan = {
  id: string;
  title: string;
  deliverables: string;
  price: string;
  paymentTerms: string;
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
};

export type ProposalEvidences = {
  leadImageUrl?: string;
  agencyImageUrl?: string;
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
}
