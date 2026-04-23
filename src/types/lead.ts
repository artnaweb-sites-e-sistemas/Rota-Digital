/** Status ativos no funil (Novo e Qualificado foram descontinuados). */
export const LEAD_STATUSES = [
  "Novo Lead",
  "Em Contato",
  "Rota Gerada",
  "Proposta",
  "Convertido",
  "Perdido",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

const LEGACY_TO_ACTIVE: Record<string, LeadStatus> = {
  Novo: "Novo Lead",
  Qualificado: "Novo Lead",
  "Em Contato": "Em Contato",
  "Novo Lead": "Novo Lead",
  "Rota Gerada": "Rota Gerada",
  "Proposta enviada": "Proposta",
  Proposta: "Proposta",
  "Propostas enviadas": "Proposta",
  Convertido: "Convertido",
  Perdido: "Perdido",
};

/** Garante status válido a partir do Firestore (inclui leads antigos). */
export function normalizeLeadStatus(raw: unknown): LeadStatus {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s in LEGACY_TO_ACTIVE) return LEGACY_TO_ACTIVE[s]!;
  return "Novo Lead";
}

/** Origem do cadastro no painel. */
export type LeadSource = "manual" | "google_places";

/** Concorrente próximo persistido no lead (cache Places). */
export interface LeadCompetitorSnapshot {
  name: string;
  rating: number;
  reviewCount: number;
  address: string;
  /** Em relação ao bairro/cidade do lead: 0 bairro, 1 cidade, 2 fora. */
  localityTier?: 0 | 1 | 2;
  website?: string;
  /** Link Instagram quando o GMB aponta para instagram.com (Places não devolve campo separado). */
  instagram?: string;
  /** Mesmo nicho explícito (nome/tipo) vs. relacionado (ex.: academia para pilates). */
  competitorType?: "direct" | "indirect";
  placeId: string;
}

/** Cache Google Places (GMB + concorrentes) em `leads/{id}`. */
export interface LeadPlacesCache {
  gmbFetchedAt?: number;
  gmbRating?: number;
  gmbReviewCount?: number;
  gmbHasListing?: boolean;
  gmbPhotoCount?: number;
  gmbBusinessStatus?: string;
  gmbOpenNow?: boolean;
  /** Link Maps devolvido pela Places API (New). */
  gmbGoogleMapsUri?: string;
  /** Place id curto (`ChIJ…`) para abrir no Maps se `gmbGoogleMapsUri` estiver vazio. */
  gmbPlaceId?: string;
  /** Coordenadas do estabelecimento (cache interno para busca por perto). */
  gmbLatitude?: number;
  gmbLongitude?: number;
  /** Endereço formatado devolvido pela Places API. */
  gmbFormattedAddress?: string;
  /** Tipo primário do Google Places (ex.: `pilates_studio`). Usado para filtrar concorrentes do mesmo nicho. */
  gmbPrimaryType?: string;
  /** Rótulo localizado do tipo primário (ex.: "Estúdio de pilates"). */
  gmbPrimaryTypeDisplay?: string;
  /** Cidade derivada do endereço (locality / administrative_area_level_2). */
  gmbCity?: string;
  /** Região/UF abreviada (ex.: "SP"). */
  gmbRegion?: string;
  /** Bairro ou sub-localidade, quando devolvido pela API. */
  gmbSubLocality?: string;
  /** Site próprio no campo "site" do GMB (após excluir Instagram e outras redes). */
  gmbListingWebsiteUrl?: string;
  /** Instagram quando o link do Instagram está no campo "site" do GMB. */
  gmbListingInstagramUrl?: string;
  /** Versão do processamento de links do GMB (força novo fetch quando incrementado no código). */
  gmbListingLinksVersion?: number;
  competitorsFetchedAt?: number;
  competitors?: LeadCompetitorSnapshot[];
}

export interface Lead extends LeadPlacesCache {
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
  /** Site da empresa (opcional). */
  websiteUrl?: string;
  /** Perfil ou URL do Instagram (opcional). */
  instagramUrl?: string;
  /** Referência Google Places (resource name, ex.: `places/ChIJ…`) para dedupe. */
  googlePlaceId?: string;
  leadSource?: LeadSource;
  /** Início do ciclo de followup (D1, D2...) em ms. */
  followupStartedAt?: number;
}
