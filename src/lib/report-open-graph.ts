import type { RotaDigitalReport } from "@/types/report";

/**
 * URL pública do site (para OG absoluto e canonical).
 * Em produção na Vercel, defina `NEXT_PUBLIC_SITE_URL=https://seu-dominio.com` para garantir
 * og:url e imagens relativas corretas. Sem isso, usa `VERCEL_URL` quando existir.
 */
export function getSiteOrigin(): string | undefined {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit && /^https?:\/\//i.test(explicit)) return explicit;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "");
    return `https://${host}`;
  }
  return undefined;
}

function truncateForMeta(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function absolutizeAsset(origin: string, url: string): string {
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  const base = origin.replace(/\/$/, "");
  return u.startsWith("/") ? `${base}${u}` : `${base}/${u}`;
}

/**
 * Imagem de compartilhamento: favicon/logo do site (evidências), depois avatar do Instagram, depois print do site.
 * URLs relativas (ex.: `/api/...`) exigem `origin` definido.
 */
export function resolveReportShareImageUrl(
  report: RotaDigitalReport,
  origin?: string
): string | undefined {
  const e = report.evidences;
  const candidates = [e?.logoImageUrl, e?.instagramProfileImageUrl, e?.siteHeroSnapshotUrl];
  for (const c of candidates) {
    if (!c?.trim()) continue;
    const raw = c.trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (origin) return absolutizeAsset(origin, raw);
  }
  return undefined;
}

export function buildReportShareDescription(report: RotaDigitalReport): string {
  const company = report.leadCompany?.trim() || "negócio";
  const fromExec = report.executiveSummary?.trim();
  const fromProfile = report.companyProfile?.trim();
  const raw =
    fromExec ||
    fromProfile ||
    `Diagnóstico de presença digital da Rota Digital para ${company}.`;
  return truncateForMeta(raw, 200);
}

export function buildPublicReportCanonicalUrl(slug: string, origin?: string): string | undefined {
  if (!origin) return undefined;
  return `${origin.replace(/\/$/, "")}/r/${encodeURIComponent(slug)}`;
}
