/**
 * Tipos da Table B (e similares) podem aparecer em `places.primaryType` / `types` na resposta,
 * mas não podem ser usados como `includedTypes` em Nearby Search nem como `includedType` em Text Search.
 *
 * Inclui também tipos que a API devolve em `primaryType` mas rejeita em Nearby (`Unsupported types`), ex.:
 * `pilates_studio` (fevereiro/2026).
 * @see https://developers.google.com/maps/documentation/places/web-service/place-types#table-b
 */
export const PLACES_TYPE_NOT_ALLOWED_IN_SEARCH_REQUEST = new Set<string>([
  "administrative_area_level_3",
  "administrative_area_level_4",
  "administrative_area_level_5",
  "administrative_area_level_6",
  "administrative_area_level_7",
  "archipelago",
  "colloquial_area",
  "continent",
  "establishment",
  "finance",
  "food",
  "general_contractor",
  "geocode",
  "health",
  "intersection",
  "landmark",
  "natural_feature",
  "neighborhood",
  "place_of_worship",
  "plus_code",
  "pilates_studio",
  "point_of_interest",
  "political",
  "postal_code_prefix",
  "postal_code_suffix",
  "postal_town",
  "premise",
  "route",
  "street_address",
  "sublocality",
  "sublocality_level_1",
  "sublocality_level_2",
  "sublocality_level_3",
  "sublocality_level_4",
  "sublocality_level_5",
  "subpremise",
  "town_square",
]);

export function isPlacesTypeAllowedInSearchRequest(type: string | undefined): boolean {
  const t = typeof type === "string" ? type.trim() : "";
  if (!t) return false;
  return !PLACES_TYPE_NOT_ALLOWED_IN_SEARCH_REQUEST.has(t);
}
