import { placeIdForDetailsHttpPath } from "@/lib/google-places";

/** URL pública do Maps / ficha do estabelecimento (GMB). */
export function resolveGoogleBusinessMapsUrl(opts: {
  googleMapsUri?: string | null | undefined;
  /** `places/ChIJ…` ou só `ChIJ…`. */
  placeResourceOrId?: string | null | undefined;
}): string | null {
  const uri = typeof opts.googleMapsUri === "string" ? opts.googleMapsUri.trim() : "";
  if (uri && /^https:\/\//i.test(uri)) return uri;
  const raw = typeof opts.placeResourceOrId === "string" ? opts.placeResourceOrId.trim() : "";
  if (!raw) return null;
  const core = placeIdForDetailsHttpPath(raw);
  if (!core) return null;
  return `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(core)}`;
}
