export interface DigitalChannel {
  name: string;
  priority: "Alta" | "Média" | "Baixa";
  description: string;
  actions: string[];
}

export interface DiagnosticScore {
  topic: string;
  score: number; // 0-10
  comment: string;
  evidenceTitle?: string;
  evidenceImageUrl?: string;
  evidenceNote?: string;
}

export interface ReportEvidence {
  logoImageUrl?: string;
  instagramProfileImageUrl?: string;
  instagramSnapshotUrl?: string;
  siteHeroSnapshotUrl?: string;
  instagramBioLinkSnapshotUrl?: string;
  instagramBioExcerpt?: string;
  instagramBioLinkTitle?: string;
  instagramBioLinkUrl?: string;
  instagramBioLinkResolvedUrl?: string;
  researchNotes?: string;
}

export interface ReportBrief {
  websiteUrl?: string;
  instagramUrl?: string;
  servicesOffered?: string;
  objective?: string;
}

export interface ReportAiUsageEntry {
  /** Modelo Gemini utilizado na chamada. */
  model?: string;
  /** Tokens de entrada (prompt). */
  promptTokens?: number;
  /** Tokens de saída (resposta). */
  candidateTokens?: number;
  /** Tokens totais da chamada. */
  totalTokens?: number;
  /** Custo estimado em USD (aproximado por tabela de preço). */
  estimatedCostUsd?: number;
  /** Custo estimado em BRL (USD convertido por taxa fixa). */
  estimatedCostBrl?: number;
  /** Momento da coleta dessa métrica. */
  createdAt?: number;
}

export interface ReportAiUsageSummary {
  generation?: ReportAiUsageEntry;
  reanalysis?: ReportAiUsageEntry[];
  totalTokens?: number;
  totalEstimatedCostUsd?: number;
  totalEstimatedCostBrl?: number;
}

export interface RotaDigitalReport {
  id: string;
  leadId: string;
  userId: string;
  createdAt: number;

  // Lead snapshot at generation time
  leadName: string;
  leadCompany: string;
  leadEmail: string;

  // AI analysis result
  executiveSummary: string;
  companyProfile: string;
  digitalMaturityLevel: "Iniciante" | "Intermediário" | "Avançado";
  digitalMaturityScore: number; // 0–100

  strengths: string[];
  weaknesses: string[];
  opportunities: string[];

  recommendedChannels: DigitalChannel[];

  quickWins: string[];
  longTermActions: string[];

  estimatedTimelineMonths: number;
  nextSteps: string[];

  /** Slug único para URL pública /r/[slug] (sem login) */
  publicSlug?: string;
  /** Página HTML completa para o lead (proposta visual); scripts removidos no servidor */
  proposalHtml?: string;
  /** Dados preenchidos no formulário de geração */
  brief?: ReportBrief;
  /** Notas por tópico (0-10) geradas pela IA */
  diagnosticScores?: DiagnosticScore[];
  /** Evidências visuais/textuais usadas no relatório */
  evidences?: ReportEvidence;
  /** Telemetria de custo/tokens de IA (estimada). */
  aiUsage?: ReportAiUsageSummary;
}
