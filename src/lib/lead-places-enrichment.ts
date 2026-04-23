import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";

import { normalizePlaceResourceName, placesSearchText } from "@/lib/google-places";
import {
  placesGetCompetitorDetail,
  placesGetGmbDetails,
  placesSearchNearby,
} from "@/lib/google-places-lead-analysis";
import { splitWebsiteUriForSnapshot } from "@/lib/gmb-website-split";
import { computeLocalityTier, normalizeLocalityToken } from "@/lib/locality-tier";
import { sanitizeCompetitorSnapshotForFirestore } from "@/lib/lead-competitor-firestore";
import { isPlacesTypeAllowedInSearchRequest } from "@/lib/places-type-request";
import type { LeadCompetitorSnapshot } from "@/types/lead";
import { isLeadPlacesCacheFresh, LEAD_PLACES_CACHE_MS } from "@/lib/lead-places-cache-shared";

const LEADS_COLLECTION = "leads";
const DETAIL_DELAY_MS = 90;

export { isLeadPlacesCacheFresh, LEAD_PLACES_CACHE_MS } from "@/lib/lead-places-cache-shared";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function leadPlaceKey(googlePlaceId: string | undefined): string {
  if (!googlePlaceId?.trim()) return "";
  return normalizePlaceResourceName({ id: googlePlaceId, name: googlePlaceId });
}

function websiteHostForPlacesQuery(raw: string | undefined): string {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function instagramHandleForPlacesQuery(raw: string | undefined): string {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return "";
  if (t.startsWith("@")) return t.slice(1).replace(/\/.*/, "").trim();
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    const m = u.pathname.match(/\/(?:p|reel|stories)\b/i) ? null : u.pathname.match(/\/([^/]+)\/?$/);
    const seg = m?.[1]?.trim();
    if (seg && !["", "instagram.com"].includes(seg)) return seg.replace(/^@/, "");
  } catch {
    /* ignore */
  }
  return "";
}

function phoneDigitsForPlacesQuery(raw: string | undefined): string {
  const t = typeof raw === "string" ? raw.replace(/\D/g, "") : "";
  if (t.length < 8) return "";
  return t.slice(0, 15);
}

function buildGmbSearchTextQuery(data: Record<string, unknown>): string {
  const company = String(data.company ?? "").trim();
  const name = String(data.name ?? "").trim();
  const parts = [company, name].filter(Boolean);
  const host = websiteHostForPlacesQuery(typeof data.websiteUrl === "string" ? data.websiteUrl : undefined);
  if (host) parts.push(host);
  const ig = instagramHandleForPlacesQuery(typeof data.instagramUrl === "string" ? data.instagramUrl : undefined);
  if (ig) parts.push(`@${ig}`);
  const ph = phoneDigitsForPlacesQuery(typeof data.phone === "string" ? data.phone : undefined);
  if (ph) parts.push(ph);
  const q = parts.join(" ").trim();
  return q.slice(0, 400);
}

function gmbPayloadFromDetails(details: NonNullable<Awaited<ReturnType<typeof placesGetGmbDetails>>>, nowMs: number) {
  const { website, instagram } = splitWebsiteUriForSnapshot(details.websiteUri);
  return {
    gmbFetchedAt: nowMs,
    gmbRating: details.rating,
    gmbReviewCount: details.userRatingCount,
    gmbHasListing: true,
    gmbPhotoCount: details.photoCount,
    gmbBusinessStatus: details.businessStatus,
    gmbOpenNow: details.openNow === null ? undefined : details.openNow,
    gmbLatitude: details.latitude,
    gmbLongitude: details.longitude,
    gmbGoogleMapsUri: details.googleMapsUri,
    gmbPlaceId: details.placeIdCore,
    gmbFormattedAddress: details.formattedAddress,
    gmbPrimaryType: details.primaryType,
    gmbPrimaryTypeDisplay: details.primaryTypeDisplay,
    gmbCity: details.city,
    gmbRegion: details.region,
    gmbSubLocality: details.subLocality,
    gmbListingWebsiteUrl: website ? website : FieldValue.delete(),
    gmbListingInstagramUrl: instagram ? instagram : FieldValue.delete(),
    gmbListingLinksVersion: 1,
  };
}

function emptyGmbPayload(nowMs: number) {
  return {
    gmbFetchedAt: nowMs,
    gmbHasListing: false,
    gmbPhotoCount: 0,
    gmbOpenNow: undefined as boolean | undefined,
    gmbListingWebsiteUrl: FieldValue.delete(),
    gmbListingInstagramUrl: FieldValue.delete(),
    gmbListingLinksVersion: FieldValue.delete(),
  };
}

export type LeadPlacesRead = {
  gmbFetchedAt?: number;
  gmbRating?: number;
  gmbReviewCount?: number;
  gmbHasListing?: boolean;
  gmbPhotoCount?: number;
  gmbBusinessStatus?: string;
  gmbOpenNow?: boolean;
  gmbGoogleMapsUri?: string;
  gmbPlaceId?: string;
  gmbLatitude?: number;
  gmbLongitude?: number;
  gmbFormattedAddress?: string;
  gmbPrimaryType?: string;
  gmbPrimaryTypeDisplay?: string;
  gmbCity?: string;
  gmbRegion?: string;
  gmbSubLocality?: string;
  /** Site próprio no campo "site" do GMB (após excluir Instagram/redes). */
  gmbListingWebsiteUrl?: string;
  /** Instagram quando o negócio colocou o link do Instagram no campo "site" do GMB. */
  gmbListingInstagramUrl?: string;
  /** Incrementar quando mudar o processamento de `websiteUri` (força novo fetch). */
  gmbListingLinksVersion?: number;
  competitorsFetchedAt?: number;
  competitors?: LeadCompetitorSnapshot[];
};

export function readLeadPlacesFromData(data: Record<string, unknown>): LeadPlacesRead {
  return {
    gmbFetchedAt: typeof data.gmbFetchedAt === "number" ? data.gmbFetchedAt : undefined,
    gmbRating: typeof data.gmbRating === "number" ? data.gmbRating : undefined,
    gmbReviewCount: typeof data.gmbReviewCount === "number" ? data.gmbReviewCount : undefined,
    gmbHasListing: typeof data.gmbHasListing === "boolean" ? data.gmbHasListing : undefined,
    gmbPhotoCount: typeof data.gmbPhotoCount === "number" ? data.gmbPhotoCount : undefined,
    gmbBusinessStatus: typeof data.gmbBusinessStatus === "string" ? data.gmbBusinessStatus : undefined,
    gmbOpenNow: typeof data.gmbOpenNow === "boolean" ? data.gmbOpenNow : undefined,
    gmbGoogleMapsUri: typeof data.gmbGoogleMapsUri === "string" ? data.gmbGoogleMapsUri : undefined,
    gmbPlaceId: typeof data.gmbPlaceId === "string" ? data.gmbPlaceId : undefined,
    gmbLatitude: typeof data.gmbLatitude === "number" ? data.gmbLatitude : undefined,
    gmbLongitude: typeof data.gmbLongitude === "number" ? data.gmbLongitude : undefined,
    gmbFormattedAddress: typeof data.gmbFormattedAddress === "string" ? data.gmbFormattedAddress : undefined,
    gmbPrimaryType: typeof data.gmbPrimaryType === "string" ? data.gmbPrimaryType : undefined,
    gmbPrimaryTypeDisplay: typeof data.gmbPrimaryTypeDisplay === "string" ? data.gmbPrimaryTypeDisplay : undefined,
    gmbCity: typeof data.gmbCity === "string" ? data.gmbCity : undefined,
    gmbRegion: typeof data.gmbRegion === "string" ? data.gmbRegion : undefined,
    gmbSubLocality: typeof data.gmbSubLocality === "string" ? data.gmbSubLocality : undefined,
    gmbListingWebsiteUrl:
      typeof data.gmbListingWebsiteUrl === "string" ? data.gmbListingWebsiteUrl : undefined,
    gmbListingInstagramUrl:
      typeof data.gmbListingInstagramUrl === "string" ? data.gmbListingInstagramUrl : undefined,
    gmbListingLinksVersion:
      typeof data.gmbListingLinksVersion === "number" ? data.gmbListingLinksVersion : undefined,
    competitorsFetchedAt: typeof data.competitorsFetchedAt === "number" ? data.competitorsFetchedAt : undefined,
    competitors: Array.isArray(data.competitors) ? (data.competitors as LeadCompetitorSnapshot[]) : undefined,
  };
}

export async function ensureLeadGmbCacheAdmin(
  db: Firestore,
  apiKey: string,
  uid: string,
  leadId: string,
): Promise<LeadPlacesRead> {
  const ref = db.collection(LEADS_COLLECTION).doc(leadId.trim());
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Lead não encontrado.");
  const data = snap.data() as Record<string, unknown>;
  if (String(data.userId ?? "") !== uid) throw new Error("Lead não pertence ao utilizador.");

  const nowMs = Date.now();
  const gmbMissingEnrichment =
    data.gmbHasListing === true &&
    (typeof data.gmbPrimaryType !== "string" ||
      typeof data.gmbCity !== "string" ||
      data.gmbListingLinksVersion !== 1);
  if (isLeadPlacesCacheFresh(data.gmbFetchedAt, nowMs) && !gmbMissingEnrichment) {
    return readLeadPlacesFromData(data);
  }

  let placeResource = leadPlaceKey(typeof data.googlePlaceId === "string" ? data.googlePlaceId : undefined);

  if (!placeResource) {
    const q = buildGmbSearchTextQuery(data);
    if (q) {
      const found = await placesSearchText(apiKey, {
        textQuery: q,
        languageCode: "pt-BR",
        regionCode: "BR",
        maxResultCount: 3,
      });
      const first = found.places[0];
      if (first?.id) {
        placeResource = first.id;
        await ref.update({ googlePlaceId: first.id, updatedAt: nowMs }).catch(() => {
          /* ignore */
        });
      }
    }
  }

  if (!placeResource) {
    await ref.set({ ...emptyGmbPayload(nowMs), updatedAt: nowMs }, { merge: true });
    const again = await ref.get();
    return readLeadPlacesFromData((again.data() as Record<string, unknown>) ?? {});
  }

  const details = await placesGetGmbDetails(apiKey, placeResource);
  if (!details) {
    await ref.set({ ...emptyGmbPayload(nowMs), updatedAt: nowMs }, { merge: true });
    const again = await ref.get();
    return readLeadPlacesFromData((again.data() as Record<string, unknown>) ?? {});
  }

  const payload = { ...gmbPayloadFromDetails(details, nowMs), updatedAt: nowMs };
  await ref.set(payload, { merge: true });
  const again = await ref.get();
  return readLeadPlacesFromData((again.data() as Record<string, unknown>) ?? {});
}

// ---------------------------------------------------------------------------
// Busca de concorrentes
// ---------------------------------------------------------------------------

type PlacesHit = {
  id: string;
  displayName?: string;
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  types?: string[];
};

function mergeHits(...lists: PlacesHit[][]): PlacesHit[] {
  const seen = new Set<string>();
  const out: PlacesHit[] = [];
  for (const list of lists) {
    for (const h of list) {
      if (!h?.id) continue;
      if (seen.has(h.id)) continue;
      seen.add(h.id);
      out.push(h);
    }
  }
  return out;
}

function buildCityPart(opts: { subLocality?: string; city?: string; region?: string }): string {
  return [opts.subLocality, opts.city, opts.region].filter((v): v is string => Boolean(v?.trim())).join(", ");
}

// ---- Keyword-based niche filtering ----

const NICHE_STOP_WORDS = new Set([
  "de", "do", "da", "dos", "das", "e", "em", "no", "na", "nos", "nas",
  "o", "a", "os", "as", "um", "uma", "uns", "umas", "por", "para", "com",
  "que", "se", "ao", "ou", "the", "of", "and", "in", "at", "for", "to",
  "ltda", "eireli", "mei", "epp",
]);

const GENERIC_WORDS = new Set([
  "estudio", "studio", "centro", "espaco", "space", "casa", "clinica",
  "instituto", "academia", "wellness", "saude", "health", "vida", "life",
  "bem", "estar", "corpo", "body", "mente", "mind", "equilibrio", "balance",
  "movimento", "movement", "integracao", "integral",
]);

function extractNicheKeywords(primaryTypeDisplay: string, company: string): string[] {
  const blob = `${primaryTypeDisplay} ${company}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  const tokens = blob
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !NICHE_STOP_WORDS.has(t));
  const unique = [...new Set(tokens)];
  const specific = unique.filter((t) => !GENERIC_WORDS.has(t));
  return specific.length > 0 ? specific : unique;
}

function isGenericDisplayLabel(label: string): boolean {
  if (!label) return true;
  const n = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return GENERIC_WORDS.has(n);
}

const KEYWORD_TO_NEARBY_TYPES: Record<string, string[]> = {
  pilates: ["fitness_center", "gym", "yoga_studio", "physiotherapist", "wellness_center"],
  yoga: ["yoga_studio", "fitness_center", "gym", "wellness_center"],
  crossfit: ["gym", "fitness_center"],
  musculacao: ["gym", "fitness_center"],
  dentista: ["dentist", "dental_clinic"],
  odonto: ["dentist", "dental_clinic"],
  restaurante: ["restaurant"],
  pizzaria: ["pizza_restaurant", "restaurant"],
  hamburgueria: ["hamburger_restaurant", "restaurant"],
  lanchonete: ["fast_food_restaurant", "restaurant"],
  beleza: ["beauty_salon", "hair_salon", "nail_salon", "spa"],
  cabelo: ["hair_salon", "beauty_salon", "barber_shop"],
  estetica: ["beauty_salon", "spa", "skin_care_clinic"],
  barbearia: ["barber_shop", "hair_salon"],
  farmacia: ["pharmacy", "drugstore"],
  veterinario: ["veterinary_care"],
  petshop: ["pet_store", "veterinary_care"],
  fisioterapia: ["physiotherapist", "wellness_center"],
  massagem: ["massage", "massage_spa", "spa"],
};

function bestNicheTerm(
  primaryTypeDisplay: string,
  primaryType: string,
  nicheKeywords: string[],
): string {
  if (primaryTypeDisplay && !isGenericDisplayLabel(primaryTypeDisplay)) return primaryTypeDisplay;
  const fromType = primaryType.replace(/_/g, " ").trim();
  if (fromType && !isGenericDisplayLabel(fromType)) return fromType;
  for (const kw of nicheKeywords) {
    if (KEYWORD_TO_NEARBY_TYPES[kw]) return kw;
  }
  return nicheKeywords[0] ?? "";
}

function nicheOnlyKeywords(
  allKeywords: string[],
  primaryTypeDisplay: string,
  primaryType: string,
): string[] {
  const labelTokens = new Set(
    `${primaryTypeDisplay} ${primaryType.replace(/_/g, " ")}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3),
  );
  const meaningful = allKeywords.filter(
    (kw) => KEYWORD_TO_NEARBY_TYPES[kw] || labelTokens.has(kw),
  );
  return meaningful.length > 0 ? meaningful : allKeywords.slice(0, 1);
}

function buildTypeToKeywordsMap(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [kw, types] of Object.entries(KEYWORD_TO_NEARBY_TYPES)) {
    for (const t of types) {
      if (!map.has(t)) map.set(t, new Set());
      map.get(t)!.add(kw);
    }
  }
  return map;
}
const TYPE_TO_KEYWORDS = buildTypeToKeywordsMap();

function normText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * "Direto": keyword aparece no nome OU no primaryType/types do lugar.
 * Ex: keyword "pilates" → nome contém "pilates" OU tipo é "pilates_studio".
 */
function hitIsDirectCompetitor(h: PlacesHit, keywords: string[]): boolean {
  if (keywords.length === 0) return true;

  const name = normText(h.displayName ?? "");
  if (keywords.some((kw) => name.includes(kw))) return true;

  const allTypes = [...(h.types ?? [])];
  if (h.primaryType && !allTypes.includes(h.primaryType)) allTypes.push(h.primaryType);
  for (const t of allTypes) {
    const tNorm = normText(t.replace(/_/g, " "));
    if (keywords.some((kw) => tNorm.includes(kw))) return true;
  }
  return false;
}

/**
 * "Indireto": tipo do lugar está mapeado para a keyword via KEYWORD_TO_NEARBY_TYPES.
 * Ex: keyword "pilates" → tipo "fitness_center" ou "gym" fazem match.
 */
function hitIsIndirectCompetitor(h: PlacesHit, keywords: string[]): boolean {
  const allTypes = [...(h.types ?? [])];
  if (h.primaryType && !allTypes.includes(h.primaryType)) allTypes.push(h.primaryType);
  for (const t of allTypes) {
    const mappedKws = TYPE_TO_KEYWORDS.get(t);
    if (mappedKws) {
      for (const kw of keywords) {
        if (mappedKws.has(kw)) return true;
      }
    }
  }
  return false;
}

function hitMatchesNiche(h: PlacesHit, keywords: string[]): boolean {
  return hitIsDirectCompetitor(h, keywords) || hitIsIndirectCompetitor(h, keywords);
}

function nearbyTypesFromKeywords(keywords: string[]): string[] {
  const out = new Set<string>();
  for (const kw of keywords) {
    const types = KEYWORD_TO_NEARBY_TYPES[kw];
    if (types) for (const t of types) out.add(t);
  }
  return [...out].filter((t) => isPlacesTypeAllowedInSearchRequest(t));
}

// ---- Locality tiers + popularity sort ----

/**
 * Ordena: bairro (tier 0) → cidade (tier 1) → fora (tier 2).
 * Dentro de cada tier: nota → quantidade de avaliações.
 */
function sortHitsLocalFirst(hits: PlacesHit[], city: string, subLocality: string): PlacesHit[] {
  const n = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : -1);
  return [...hits].sort((a, b) => {
    const ta = computeLocalityTier(a.formattedAddress, city, subLocality);
    const tb = computeLocalityTier(b.formattedAddress, city, subLocality);
    if (ta !== tb) return ta - tb;
    const rr = n(b.rating) - n(a.rating);
    if (rr !== 0) return rr;
    const rc = n(b.userRatingCount) - n(a.userRatingCount);
    if (rc !== 0) return rc;
    return a.id.localeCompare(b.id);
  });
}

function sortCompetitorSnapshotsByPopularity(list: LeadCompetitorSnapshot[]): LeadCompetitorSnapshot[] {
  const n = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : -1);
  return [...list].sort((a, b) => {
    const rr = n(b.rating) - n(a.rating);
    if (rr !== 0) return rr;
    const rc = n(b.reviewCount) - n(a.reviewCount);
    if (rc !== 0) return rc;
    return 0;
  });
}

// ---- Core competitor search ----

async function fetchCompetitorsIntoLead(
  db: Firestore,
  apiKey: string,
  ref: DocumentReference,
  data: Record<string, unknown>,
  nowMs: number,
): Promise<LeadCompetitorSnapshot[]> {
  const company = String(data.company ?? "").trim();
  const leadPk = leadPlaceKey(typeof data.googlePlaceId === "string" ? data.googlePlaceId : undefined);
  const lat = typeof data.gmbLatitude === "number" ? data.gmbLatitude : undefined;
  const lng = typeof data.gmbLongitude === "number" ? data.gmbLongitude : undefined;
  const hasGeo =
    typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng);

  const primaryTypeDisplay =
    typeof data.gmbPrimaryTypeDisplay === "string" ? data.gmbPrimaryTypeDisplay.trim() : "";
  const primaryType = typeof data.gmbPrimaryType === "string" ? data.gmbPrimaryType.trim() : "";
  const city = typeof data.gmbCity === "string" ? data.gmbCity.trim() : "";
  const region = typeof data.gmbRegion === "string" ? data.gmbRegion.trim() : "";
  const subLocality = typeof data.gmbSubLocality === "string" ? data.gmbSubLocality.trim() : "";
  const cityPart = buildCityPart({ subLocality, city, region });

  const rawKeywords = extractNicheKeywords(primaryTypeDisplay, company);
  const nicheKeywords = nicheOnlyKeywords(rawKeywords, primaryTypeDisplay, primaryType);
  const nicheTerm = bestNicheTerm(primaryTypeDisplay, primaryType, nicheKeywords);
  console.log(
    `[lead-places-enrichment] nicho="${nicheTerm}" keywords=${JSON.stringify(nicheKeywords)} bairro="${normalizeLocalityToken(subLocality)}" cidade="${normalizeLocalityToken(city)}" cityPart="${cityPart}"`,
  );

  const companyNorm = norm(company);
  const baseFilter = (h: PlacesHit) => {
    if (!h.id) return false;
    if (leadPk && h.id === leadPk) return false;
    const dn = norm(h.displayName ?? "");
    if (companyNorm && dn === companyNorm) return false;
    return true;
  };

  const collected: PlacesHit[] = [];
  const takeAll = (hits: PlacesHit[]) => {
    const merged = mergeHits(collected, hits.filter(baseFilter));
    collected.length = 0;
    collected.push(...merged);
  };
  const matchingLen = () => collected.filter((h) => hitMatchesNiche(h, nicheKeywords)).length;

  const nearbyTypes = nearbyTypesFromKeywords(nicheKeywords);

  // 1) Nearby por tipos do nicho — raio curto progressivo (3 km → 10 km → 25 km).
  if (hasGeo && nearbyTypes.length > 0) {
    for (const radius of [3_000, 10_000, 25_000]) {
      for (const t of nearbyTypes) {
        try {
          const hits = await placesSearchNearby(apiKey, {
            latitude: lat!,
            longitude: lng!,
            radiusMeters: radius,
            maxResultCount: 20,
            includedType: t,
            rankPreference: "POPULARITY",
          });
          takeAll(hits);
        } catch (e) {
          console.warn(`[lead-places-enrichment] searchNearby(type=${t}, r=${radius}) falhou.`, e);
        }
      }
      if (matchingLen() >= 10) break;
    }
  }

  const textSearchHelper = async (query: string, biasRadius?: number) => {
    const st = await placesSearchText(apiKey, {
      textQuery: query,
      languageCode: "pt-BR",
      regionCode: "BR",
      maxResultCount: 20,
      locationBias:
        hasGeo && biasRadius ? { latitude: lat!, longitude: lng!, radiusMeters: biasRadius } : undefined,
    });
    takeAll(
      st.places.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        formattedAddress: p.formattedAddress,
        primaryType: p.primaryType,
        types: p.types,
        rating: p.rating,
        userRatingCount: p.userRatingCount,
      })),
    );
  };

  const countLocal = () =>
    collected.filter(
      (h) => hitMatchesNiche(h, nicheKeywords) && computeLocalityTier(h.formattedAddress, city, subLocality) <= 1,
    ).length;

  // 2a) Text search focada no bairro.
  if (nicheTerm && subLocality && city) {
    try {
      await textSearchHelper(`${nicheTerm} ${subLocality} ${city}`, 5_000);
    } catch (e) {
      console.warn("[lead-places-enrichment] searchText (bairro) falhou.", e);
    }
  }

  // 2b) Text search focada na cidade (sem bairro, para pegar outros bairros).
  if (nicheTerm && city) {
    try {
      await textSearchHelper(`${nicheTerm} em ${city}`, 15_000);
    } catch (e) {
      console.warn("[lead-places-enrichment] searchText (cidade) falhou.", e);
    }
  }

  // 2c) Variação: "nicho + cidade + UF" para melhorar precisão de geo.
  if (countLocal() < 5 && nicheTerm && city && region) {
    try {
      await textSearchHelper(`${nicheTerm} ${city} ${region}`, 15_000);
    } catch (e) {
      console.warn("[lead-places-enrichment] searchText (cidade+UF) falhou.", e);
    }
  }

  // 3) Text search expandida: nicho + UF — só se ainda não temos 5 da cidade.
  if (countLocal() < 5 && nicheTerm && region) {
    try {
      await textSearchHelper(`${nicheTerm} ${region}`, 25_000);
    } catch (e) {
      console.warn("[lead-places-enrichment] searchText (UF) falhou.", e);
    }
  }

  const filtered = collected.filter((h) => hitMatchesNiche(h, nicheKeywords));
  const ranked = sortHitsLocalFirst(filtered, city, subLocality);

  const localOnly = ranked.filter((h) => computeLocalityTier(h.formattedAddress, city, subLocality) <= 1);
  const directLocal = localOnly.filter((h) => hitIsDirectCompetitor(h, nicheKeywords));
  const indirectLocal = localOnly.filter((h) => !hitIsDirectCompetitor(h, nicheKeywords));

  const tierLabels = ["BAIRRO", "CIDADE", "FORA"] as const;
  const bairroCount = directLocal.filter((h) => computeLocalityTier(h.formattedAddress, city, subLocality) === 0).length;
  const cidadeCount = directLocal.filter((h) => computeLocalityTier(h.formattedAddress, city, subLocality) === 1).length;
  console.log(
    `[lead-places-enrichment] collected=${collected.length} filtered=${filtered.length} diretos_locais=${directLocal.length} indiretos_locais=${indirectLocal.length} bairro=${bairroCount} cidade=${cidadeCount} keywords=[${nicheKeywords.join(",")}]`,
  );
  const preview = [...directLocal.slice(0, 8), ...indirectLocal.slice(0, 4)];
  for (const h of preview) {
    const tier = tierLabels[computeLocalityTier(h.formattedAddress, city, subLocality)];
    const kind = hitIsDirectCompetitor(h, nicheKeywords) ? "DIRETO" : "INDIRETO";
    console.log(
      `  → [${tier}][${kind}] "${h.displayName}" reviews=${h.userRatingCount ?? "?"} rating=${h.rating ?? "?"} addr="${h.formattedAddress?.slice(0, 60) ?? ""}"`,
    );
  }

  // Prioridade: diretos locais primeiro, depois indiretos locais para completar.
  // Se nenhum local existir, fallback para todos os ranked.
  const orderedPool = localOnly.length > 0
    ? [...directLocal, ...indirectLocal]
    : ranked;
  const top = orderedPool.slice(0, 15);
  const out: LeadCompetitorSnapshot[] = [];
  for (const h of top) {
    if (out.length >= 5) break;
    const d = await placesGetCompetitorDetail(apiKey, h.id);
    await sleep(DETAIL_DELAY_MS);
    if (!d) continue;
    if (leadPk && d.id === leadPk) continue;
    const { website, instagram } = splitWebsiteUriForSnapshot(d.websiteUri);
    const competitorType = hitIsDirectCompetitor(h, nicheKeywords) ? "direct" as const : "indirect" as const;
    const addrForTier = d.formattedAddress?.trim() || h.formattedAddress;
    const localityTier = computeLocalityTier(addrForTier, city, subLocality);
    out.push(
      sanitizeCompetitorSnapshotForFirestore({
        name: d.displayName?.trim() || "Concorrente",
        rating: d.rating,
        reviewCount: d.userRatingCount,
        address: d.formattedAddress?.trim() || "—",
        localityTier,
        placeId: d.id,
        competitorType,
        ...(website ? { website } : {}),
        ...(instagram ? { instagram } : {}),
      }),
    );
  }

  const outSorted = sortCompetitorSnapshotsByPopularity(out);

  await ref.set(
    {
      competitorsFetchedAt: nowMs,
      competitors: outSorted,
      updatedAt: nowMs,
    },
    { merge: true },
  );
  return outSorted;
}

export async function ensureLeadCompetitorsCacheAdmin(
  db: Firestore,
  apiKey: string,
  uid: string,
  leadId: string,
  opts?: { forceRefresh?: boolean },
): Promise<LeadPlacesRead> {
  const ref = db.collection(LEADS_COLLECTION).doc(leadId.trim());
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Lead não encontrado.");
  const data = snap.data() as Record<string, unknown>;
  if (String(data.userId ?? "") !== uid) throw new Error("Lead não pertence ao utilizador.");

  const nowMs = Date.now();
  const cachedCompetitors = Array.isArray(data.competitors) ? data.competitors : [];
  const skipCache =
    opts?.forceRefresh === true ||
    !isLeadPlacesCacheFresh(data.competitorsFetchedAt, nowMs) ||
    cachedCompetitors.length === 0;
  if (!skipCache) {
    return readLeadPlacesFromData(data);
  }

  if (data.gmbHasListing === false) {
    await ref.set({ competitorsFetchedAt: nowMs, competitors: [], updatedAt: nowMs }, { merge: true });
    const again = await ref.get();
    return readLeadPlacesFromData((again.data() as Record<string, unknown>) ?? {});
  }

  await fetchCompetitorsIntoLead(db, apiKey, ref, data, nowMs);
  const again = await ref.get();
  return readLeadPlacesFromData((again.data() as Record<string, unknown>) ?? {});
}

export async function syncLeadPlacesCachesForRequestAdmin(opts: {
  db: Firestore;
  apiKey: string;
  uid: string;
  leadId: string;
  includeCompetitors: boolean;
  forceRefreshCompetitors?: boolean;
}): Promise<LeadPlacesRead> {
  const { db, apiKey, uid, leadId, includeCompetitors, forceRefreshCompetitors } = opts;
  await ensureLeadGmbCacheAdmin(db, apiKey, uid, leadId);
  if (includeCompetitors) {
    await ensureLeadCompetitorsCacheAdmin(db, apiKey, uid, leadId, {
      forceRefresh: forceRefreshCompetitors === true,
    });
  }
  const ref = db.collection(LEADS_COLLECTION).doc(leadId.trim());
  const snap = await ref.get();
  return readLeadPlacesFromData((snap.data() as Record<string, unknown>) ?? {});
}
