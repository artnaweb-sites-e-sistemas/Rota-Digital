/** 0 = mesmo bairro (subLocality no endereço), 1 = mesma cidade, 2 = fora. */
export type LocalityTier = 0 | 1 | 2;

export function normalizeLocalityToken(raw: string): string {
  return raw.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
}

/**
 * Compara o endereço formatado do estabelecimento com cidade/bairro do lead (GMB).
 */
export function computeLocalityTier(
  formattedAddress: string | undefined,
  city: string,
  subLocality: string,
): LocalityTier {
  const sub = normalizeLocalityToken(subLocality);
  const cit = normalizeLocalityToken(city);
  const addr = normalizeLocalityToken(formattedAddress ?? "");
  if (sub && addr.includes(sub)) return 0;
  if (cit && addr.includes(cit)) return 1;
  return 2;
}

export function localityTierLabelPt(tier: LocalityTier): "Bairro" | "Cidade" | "Fora" {
  if (tier === 0) return "Bairro";
  if (tier === 1) return "Cidade";
  return "Fora";
}
