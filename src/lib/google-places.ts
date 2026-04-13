const PLACES_V1 = "https://places.googleapis.com/v1";

/** Resource name `places/ChIJ…` exigido pelo GET Place; a pesquisa por vezes devolve só o id curto. */
export function normalizePlaceResourceName(hit: { name?: string; id?: string }): string {
  const name = typeof hit.name === "string" ? hit.name.trim() : "";
  if (name.startsWith("places/")) return name;
  const id = typeof hit.id === "string" ? hit.id.trim() : "";
  if (id.startsWith("places/")) return id;
  if (id) return `places/${id}`;
  return "";
}

/** Path HTTP oficial: `/v1/places/{PLACE_ID}` — só o sufixo após `places/`, sem codificar a barra. */
function placeIdForDetailsHttpPath(resourceOrId: string): string {
  const t = resourceOrId.trim();
  if (t.startsWith("places/")) return t.slice("places/".length);
  return t;
}

type LocalizedText = { text?: string; languageCode?: string };

export type PlacesSearchHit = {
  id: string;
  displayName?: string;
  formattedAddress?: string;
};

export type PlacesPlaceDetails = {
  id: string;
  name?: string;
  displayName?: string;
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  /** Raramente presente na API Places; quando existir, usamos na captação. */
  email?: string;
};

function readDisplayName(v: unknown): string | undefined {
  if (!v || typeof v !== "object") return undefined;
  const t = (v as LocalizedText).text;
  return typeof t === "string" && t.trim() ? t.trim() : undefined;
}

export async function placesSearchText(
  apiKey: string,
  opts: {
    textQuery: string;
    languageCode: string;
    regionCode: string;
    maxResultCount?: number;
    pageToken?: string;
  },
): Promise<{ places: PlacesSearchHit[]; nextPageToken?: string }> {
  const body: Record<string, unknown> = {
    textQuery: opts.textQuery,
    languageCode: opts.languageCode,
    regionCode: opts.regionCode,
    maxResultCount: Math.min(20, Math.max(1, opts.maxResultCount ?? 20)),
  };
  if (opts.pageToken) body.pageToken = opts.pageToken;

  const res = await fetch(`${PLACES_V1}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.name,places.id,places.displayName,places.formattedAddress,nextPageToken",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Places searchText falhou (${res.status}): ${errText.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    places?: Array<{
      name?: string;
      id?: string;
      displayName?: unknown;
      formattedAddress?: string;
    }>;
    nextPageToken?: string;
  };

  const places: PlacesSearchHit[] = (json.places ?? [])
    .map((p) => {
      const id = normalizePlaceResourceName(p);
      if (!id) return null;
      return {
        id,
        displayName: readDisplayName(p.displayName),
        formattedAddress: typeof p.formattedAddress === "string" ? p.formattedAddress.trim() : undefined,
      };
    })
    .filter(Boolean) as PlacesSearchHit[];

  return {
    places,
    nextPageToken: typeof json.nextPageToken === "string" ? json.nextPageToken : undefined,
  };
}

export async function placesGetDetails(apiKey: string, placeResourceId: string): Promise<PlacesPlaceDetails | null> {
  const placeId = placeIdForDetailsHttpPath(placeResourceId);
  if (!placeId) return null;
  const url = `${PLACES_V1}/places/${encodeURIComponent(placeId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "name,id,displayName,formattedAddress,internationalPhoneNumber,nationalPhoneNumber,websiteUri",
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Places detalhes falhou (${res.status}): ${errText.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    name?: string;
    id?: string;
    displayName?: unknown;
    formattedAddress?: string;
    internationalPhoneNumber?: string;
    nationalPhoneNumber?: string;
    websiteUri?: string;
    email?: string;
  };

  const outId = normalizePlaceResourceName({ id: json.id, name: json.name }) || normalizePlaceResourceName({ id: placeId, name: placeId });
  return {
    id: outId,
    name: typeof json.name === "string" ? json.name.trim() : undefined,
    displayName: readDisplayName(json.displayName),
    formattedAddress: typeof json.formattedAddress === "string" ? json.formattedAddress.trim() : undefined,
    internationalPhoneNumber:
      typeof json.internationalPhoneNumber === "string" ? json.internationalPhoneNumber.trim() : undefined,
    nationalPhoneNumber: typeof json.nationalPhoneNumber === "string" ? json.nationalPhoneNumber.trim() : undefined,
    websiteUri: typeof json.websiteUri === "string" ? json.websiteUri.trim() : undefined,
    email: typeof json.email === "string" ? json.email.trim() : undefined,
  };
}
