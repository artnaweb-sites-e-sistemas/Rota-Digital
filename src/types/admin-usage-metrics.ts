export type CommercialPlanKey = "starter" | "pro" | "agency";

export type AdminPlanUsageMetricsRow = {
  plan: CommercialPlanKey;
  totalUsers: number;
  usersWithAtLeastOneReport: number;
  usersAtReportLimit: number;
  avgReportsUsed: number | null;
  reportLimitBaseline: number;
  reportsQuotaUnlimited: boolean;
  usersWithAtLeastOneProposal: number;
  usersAtProposalLimit: number;
  avgProposalsUsed: number | null;
  proposalLimitBaseline: number;
  proposalsQuotaUnlimited: boolean;
};

export type AdminUsageMetricsResponse = {
  year: number;
  month: number;
  periodStartUtcIso: string;
  periodEndExclusiveUtcIso: string;
  plans: AdminPlanUsageMetricsRow[];
};
