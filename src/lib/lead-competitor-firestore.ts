import type { LeadCompetitorSnapshot } from "@/types/lead";

/** Firestore (cliente e Admin) rejeita `undefined` em campos — omitir opcionais vazios. */
export function sanitizeCompetitorSnapshotForFirestore(c: LeadCompetitorSnapshot): LeadCompetitorSnapshot {
  const website = typeof c.website === "string" ? c.website.trim() : "";
  const instagram = typeof c.instagram === "string" ? c.instagram.trim() : "";
  const base: LeadCompetitorSnapshot = {
    name: c.name,
    rating: c.rating,
    reviewCount: c.reviewCount,
    address: c.address,
    placeId: c.placeId,
  };
  if (website) base.website = website;
  if (instagram) base.instagram = instagram;
  if (c.competitorType === "direct" || c.competitorType === "indirect") {
    base.competitorType = c.competitorType;
  }
  if (c.localityTier === 0 || c.localityTier === 1 || c.localityTier === 2) {
    base.localityTier = c.localityTier;
  }
  return base;
}

export function sanitizeCompetitorsForFirestore(items: LeadCompetitorSnapshot[]): LeadCompetitorSnapshot[] {
  return items.map(sanitizeCompetitorSnapshotForFirestore);
}
