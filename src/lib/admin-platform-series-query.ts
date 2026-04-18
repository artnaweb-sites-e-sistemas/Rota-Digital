/** Parâmetros normalizados para GET /api/admin-platform-series (year & month podem ser `all`). */

export type AdminPlatformSeriesQuery =
  | { kind: "daily"; year: number; month: number }
  | { kind: "month_in_year"; year: number }
  | { kind: "fixed_month_by_year"; month: number }
  | { kind: "year_total" };

/** Ano inicial da plataforma (séries e filtro de ano no admin). */
const MIN_YEAR = 2026;
const MAX_YEAR = 2100;

export function parseAdminPlatformSeriesQuery(searchParams: URLSearchParams): AdminPlatformSeriesQuery {
  const rawY = searchParams.get("year");
  const rawM = searchParams.get("month");
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;

  const yAll = rawY === "all";
  const mAll = rawM === "all";
  const yNum = rawY != null && rawY !== "" && !yAll ? Number(rawY) : NaN;
  const mNum = rawM != null && rawM !== "" && !mAll ? Number(rawM) : NaN;

  if (yAll && mAll) {
    return { kind: "year_total" };
  }
  if (yAll && Number.isFinite(mNum) && mNum >= 1 && mNum <= 12) {
    return { kind: "fixed_month_by_year", month: mNum };
  }
  if (mAll && Number.isFinite(yNum) && yNum >= MIN_YEAR && yNum <= MAX_YEAR) {
    return { kind: "month_in_year", year: yNum };
  }
  if (Number.isFinite(yNum) && Number.isFinite(mNum) && yNum >= MIN_YEAR && yNum <= MAX_YEAR && mNum >= 1 && mNum <= 12) {
    return { kind: "daily", year: yNum, month: mNum };
  }

  return { kind: "daily", year: cy, month: cm };
}

export const ADMIN_PLATFORM_SERIES_MIN_YEAR = MIN_YEAR;
