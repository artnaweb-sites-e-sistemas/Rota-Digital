import { normalizePlaceResourceName, placeIdForDetailsHttpPath } from "@/lib/google-places";

const PLACES_V1 = "https://places.googleapis.com/v1";

type LocalizedText = { text?: string };

function readDisplayName(v: unknown): string | undefined {
  if (!v || typeof v !== "object") return undefined;
  const t = (v as LocalizedText).text;
  return typeof t === "string" && t.trim() ? t.trim() : undefined;
}

export type PlacesGmbDetails = {
  id: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  openNow?: boolean | null;
  photoCount: number;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  /** Link oficial Google Maps (quando a API devolve). */
  googleMapsUri?: string;
  /** Sufixo do place id (`ChIJ…`) para fallback de URL. */
  placeIdCore: string;
  /** Tipo primário (ex.: `pilates_studio`). */
  primaryType?: string;
  /** Rótulo localizado do tipo (ex.: “Estúdio de pilates”). */
  primaryTypeDisplay?: string;
  /** Cidade extraída do endereço (locality). */
  city?: string;
  /** Estado abreviado extraído do endereço (administrative_area_level_1 shortText, ex.: "SP"). */
  region?: string;
  /** Bairro/sub-localidade quando presente. */
  subLocality?: string;
  /** URL do campo "site" no GMB (pode ser Instagram ou rede em vez do site próprio). */
  websiteUri?: string;
};

function parseOpenNow(raw: Record<string, unknown>): boolean | null {
  const cur = raw.currentOpeningHours;
  if (cur && typeof cur === "object" && "openNow" in cur) {
    const v = (cur as { openNow?: unknown }).openNow;
    if (typeof v === "boolean") return v;
  }
  return null;
}

/** Place Details (New) com campos usados na análise GMB. */
export async function placesGetGmbDetails(apiKey: string, placeResourceOrId: string): Promise<PlacesGmbDetails | null> {
  const placeId = placeIdForDetailsHttpPath(placeResourceOrId);
  if (!placeId) return null;
  const url = `${PLACES_V1}/places/${encodeURIComponent(placeId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "id,name,displayName,rating,userRatingCount,businessStatus,currentOpeningHours,regularOpeningHours,photos,location,formattedAddress,googleMapsUri,websiteUri,primaryType,primaryTypeDisplayName,addressComponents",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Places GMB detalhes falhou (${res.status}): ${errText.slice(0, 400)}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const id = normalizePlaceResourceName({ id: json.id as string | undefined, name: json.name as string | undefined });
  if (!id) return null;
  const placeIdCore = placeIdForDetailsHttpPath(id);
  if (!placeIdCore) return null;
  const photos = Array.isArray(json.photos) ? json.photos : [];
  const loc = json.location && typeof json.location === "object" ? (json.location as { latitude?: unknown; longitude?: unknown }) : null;
  const lat = typeof loc?.latitude === "number" ? loc.latitude : undefined;
  const lng = typeof loc?.longitude === "number" ? loc.longitude : undefined;
  const gMaps =
    typeof json.googleMapsUri === "string" && json.googleMapsUri.trim() ? json.googleMapsUri.trim() : undefined;

  const primaryType = typeof json.primaryType === "string" && json.primaryType.trim() ? json.primaryType.trim() : undefined;
  const primaryTypeDisplay = readDisplayName(json.primaryTypeDisplayName);
  const { city, region, subLocality } = extractLocalityFromAddressComponents(json.addressComponents);
  const websiteUri =
    typeof json.websiteUri === "string" && json.websiteUri.trim() ? json.websiteUri.trim() : undefined;

  return {
    id,
    placeIdCore,
    googleMapsUri: gMaps,
    websiteUri,
    rating: typeof json.rating === "number" ? json.rating : undefined,
    userRatingCount: typeof json.userRatingCount === "number" ? Math.floor(json.userRatingCount) : undefined,
    businessStatus: typeof json.businessStatus === "string" ? json.businessStatus : undefined,
    openNow: parseOpenNow(json),
    photoCount: photos.length,
    latitude: lat,
    longitude: lng,
    formattedAddress: typeof json.formattedAddress === "string" ? json.formattedAddress.trim() : undefined,
    primaryType,
    primaryTypeDisplay,
    city,
    region,
    subLocality,
  };
}

type PlacesAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

function extractLocalityFromAddressComponents(
  raw: unknown,
): { city?: string; region?: string; subLocality?: string } {
  if (!Array.isArray(raw)) return {};
  const comps = raw as PlacesAddressComponent[];
  let city: string | undefined;
  let region: string | undefined;
  let subLocality: string | undefined;
  for (const c of comps) {
    const types = Array.isArray(c?.types) ? c.types : [];
    const longText = typeof c?.longText === "string" ? c.longText.trim() : "";
    const shortText = typeof c?.shortText === "string" ? c.shortText.trim() : "";
    if (!types.length) continue;
    if (!city && types.includes("locality")) city = longText || shortText || undefined;
    if (!city && types.includes("administrative_area_level_2")) city = longText || shortText || undefined;
    if (!region && types.includes("administrative_area_level_1")) region = shortText || longText || undefined;
    if (!subLocality && (types.includes("sublocality") || types.includes("sublocality_level_1") || types.includes("neighborhood"))) {
      subLocality = longText || shortText || undefined;
    }
  }
  return { city, region, subLocality };
}

export type PlacesNearbyHit = {
  id: string;
  displayName?: string;
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  types?: string[];
};

export async function placesSearchNearby(
  apiKey: string,
  opts: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    maxResultCount: number;
    /** Tipo primário a filtrar (ex.: "pilates_studio"). Default: `establishment`. */
    includedType?: string;
    /** Default: `POPULARITY` (devolve os mais relevantes/populares). */
    rankPreference?: "DISTANCE" | "POPULARITY";
  },
): Promise<PlacesNearbyHit[]> {
  const radius = Math.min(50_000, Math.max(1, Math.floor(opts.radiusMeters)));
  const included =
    opts.includedType?.trim() && opts.includedType.trim().length > 0 ? opts.includedType.trim() : "store";
  const body = {
    includedTypes: [included],
    maxResultCount: Math.min(20, Math.max(1, opts.maxResultCount)),
    rankPreference: opts.rankPreference ?? "POPULARITY",
    locationRestriction: {
      circle: {
        center: { latitude: opts.latitude, longitude: opts.longitude },
        radius,
      },
    },
  };
  const res = await fetch(`${PLACES_V1}/places:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.name,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.primaryType,places.types",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Places searchNearby falhou (${res.status}): ${errText.slice(0, 400)}`);
  }
  const json = (await res.json()) as {
    places?: Array<{
      id?: string;
      name?: string;
      displayName?: unknown;
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
      primaryType?: string;
      types?: string[];
    }>;
  };
  const out: PlacesNearbyHit[] = [];
  for (const p of json.places ?? []) {
    const id = normalizePlaceResourceName({ id: p.id, name: p.name });
    if (!id) continue;
    out.push({
      id,
      displayName: readDisplayName(p.displayName),
      formattedAddress: typeof p.formattedAddress === "string" ? p.formattedAddress.trim() : undefined,
      rating: typeof p.rating === "number" ? p.rating : undefined,
      userRatingCount: typeof p.userRatingCount === "number" ? Math.floor(p.userRatingCount) : undefined,
      primaryType: typeof p.primaryType === "string" ? p.primaryType : undefined,
      types: Array.isArray(p.types) ? p.types.filter((t): t is string => typeof t === "string") : undefined,
    });
  }
  return out;
}

export type PlacesCompetitorDetail = {
  id: string;
  displayName?: string;
  rating: number;
  userRatingCount: number;
  formattedAddress?: string;
  websiteUri?: string;
};

export async function placesGetCompetitorDetail(
  apiKey: string,
  placeResourceOrId: string,
): Promise<PlacesCompetitorDetail | null> {
  const placeId = placeIdForDetailsHttpPath(placeResourceOrId);
  if (!placeId) return null;
  const url = `${PLACES_V1}/places/${encodeURIComponent(placeId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "id,name,displayName,rating,userRatingCount,formattedAddress,websiteUri",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Places concorrente detalhes falhou (${res.status}): ${errText.slice(0, 400)}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const id = normalizePlaceResourceName({ id: json.id as string | undefined, name: json.name as string | undefined });
  if (!id) return null;
  return {
    id,
    displayName: readDisplayName(json.displayName),
    rating: typeof json.rating === "number" ? json.rating : 0,
    userRatingCount: typeof json.userRatingCount === "number" ? Math.floor(json.userRatingCount) : 0,
    formattedAddress: typeof json.formattedAddress === "string" ? json.formattedAddress.trim() : undefined,
    websiteUri: typeof json.websiteUri === "string" ? json.websiteUri.trim() : undefined,
  };
}
