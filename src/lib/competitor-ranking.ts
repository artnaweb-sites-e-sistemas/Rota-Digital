import { normalizeListingUrlsForDisplay } from "@/lib/gmb-website-split";
import { computeLocalityTier, type LocalityTier } from "@/lib/locality-tier";
import type { LeadCompetitorSnapshot } from "@/types/lead";

export type CompetitorRankRow = {
  position: number;
  isLead: boolean;
  name: string;
  rating?: number;
  reviewCount?: number;
  /** Site próprio (domínio) no GMB/cadastro — Instagram não conta na coluna “Tem site”. */
  hasWebsite: boolean;
  websiteUrl?: string;
  instagramUrl?: string;
  competitorType?: "direct" | "indirect";
  /** Em relação ao lead: bairro / cidade / fora (só quando há dados GMB suficientes). */
  localityTier?: LocalityTier;
  /** Place id curto — indefinido para a linha do próprio lead. */
  placeId?: string;
};

export type CompetitorRankInput = {
  leadName: string;
  leadRating?: number;
  leadReviewCount?: number;
  /** Endereço e localidade do lead (GMB) para etiqueta Bairro/Cidade/Fora. */
  leadFormattedAddress?: string;
  leadCity?: string;
  leadSubLocality?: string;
  /** URLs do relatório/brief (opcional). */
  leadWebsiteUrl?: string;
  leadInstagramUrl?: string;
  /**
   * Fallback quando não há URLs (dados legados).
   * @deprecated Preferir leadWebsiteUrl / leadInstagramUrl.
   */
  leadHasWebsite?: boolean;
  competitors: LeadCompetitorSnapshot[];
};

/**
 * Une lead + concorrentes e ordena:
 *  1) Maior número de avaliações
 *  2) Em empate, maior nota média
 *  3) Em empate, ordem original
 *
 * Coluna “Tem site”: só URL de **site próprio**; Instagram fica só na coluna Redes.
 */
export function buildCompetitorRanking(input: CompetitorRankInput): CompetitorRankRow[] {
  const leadListing = normalizeListingUrlsForDisplay(input.leadWebsiteUrl, input.leadInstagramUrl);
  const leadHasCompanySite = Boolean(leadListing.websiteUrl);
  const leadCity = typeof input.leadCity === "string" ? input.leadCity.trim() : "";
  const leadSub = typeof input.leadSubLocality === "string" ? input.leadSubLocality.trim() : "";
  const leadAddr = typeof input.leadFormattedAddress === "string" ? input.leadFormattedAddress.trim() : "";
  /** Sem endereço formatado, não inferir tier (evita “Fora” falso). */
  const leadLocalityTier = leadAddr ? computeLocalityTier(leadAddr, leadCity, leadSub) : undefined;

  const rows: Array<Omit<CompetitorRankRow, "position"> & { orderHint: number }> = [];

  rows.push({
    isLead: true,
    name: input.leadName?.trim() || "Este lead",
    rating: input.leadRating,
    reviewCount: input.leadReviewCount,
    hasWebsite: leadHasCompanySite,
    websiteUrl: leadListing.websiteUrl,
    instagramUrl: leadListing.instagramUrl,
    localityTier: leadLocalityTier,
    placeId: undefined,
    orderHint: -1,
  });

  input.competitors.forEach((c, idx) => {
    const listing = normalizeListingUrlsForDisplay(c.website, c.instagram);
    const tier =
      c.localityTier === 0 || c.localityTier === 1 || c.localityTier === 2 ? c.localityTier : undefined;
    rows.push({
      isLead: false,
      name: c.name?.trim() || "Concorrente",
      rating: typeof c.rating === "number" ? c.rating : undefined,
      reviewCount: typeof c.reviewCount === "number" ? c.reviewCount : undefined,
      hasWebsite: Boolean(listing.websiteUrl),
      websiteUrl: listing.websiteUrl,
      instagramUrl: listing.instagramUrl,
      competitorType: c.competitorType,
      localityTier: tier,
      placeId: c.placeId,
      orderHint: idx,
    });
  });

  const safeNumber = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : -1);

  rows.sort((a, b) => {
    const ra = safeNumber(a.reviewCount);
    const rb = safeNumber(b.reviewCount);
    if (rb !== ra) return rb - ra;
    const sa = safeNumber(a.rating);
    const sb = safeNumber(b.rating);
    if (sb !== sa) return sb - sa;
    return a.orderHint - b.orderHint;
  });

  return rows.map((r, i) => ({
    position: i + 1,
    isLead: r.isLead,
    name: r.name,
    rating: r.rating,
    reviewCount: r.reviewCount,
    hasWebsite: r.hasWebsite,
    websiteUrl: r.websiteUrl,
    instagramUrl: r.instagramUrl,
    competitorType: r.competitorType,
    localityTier: r.localityTier,
    placeId: r.placeId,
  }));
}

export function formatRankOrdinalPt(position: number): string {
  return `${position}º`;
}
