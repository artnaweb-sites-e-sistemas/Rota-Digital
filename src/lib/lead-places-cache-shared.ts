/** Cache Places (GMB / concorrentes) no documento do lead — 7 dias. */
export const LEAD_PLACES_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

export function isLeadPlacesCacheFresh(fetchedAt: unknown, nowMs: number = Date.now()): boolean {
  if (typeof fetchedAt !== "number" || !Number.isFinite(fetchedAt) || fetchedAt <= 0) return false;
  return nowMs - fetchedAt < LEAD_PLACES_CACHE_MS;
}
