import type { RotaDigitalReport } from "@/types/report";

function hrefForWebsite(url?: string): string | undefined {
  const t = url?.trim();
  if (!t) return undefined;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

export type GetReportSiteIconSrcOptions = {
  /** Ignora `logoImageUrl` guardado; só `s2/favicons` a partir do site. */
  faviconOnly?: boolean;
};

/** URL do favicon do site (ou logo já salvo nas evidências). Sem site/logo → undefined. */
export function getReportSiteIconSrc(
  report: RotaDigitalReport,
  options?: GetReportSiteIconSrcOptions,
): string | undefined {
  const faviconOnly = options?.faviconOnly === true;
  if (!faviconOnly) {
    const stored = report.evidences?.logoImageUrl?.trim();
    if (stored) return stored;
  }
  const site = hrefForWebsite(report.brief?.websiteUrl);
  if (!site) return undefined;
  return `https://www.google.com/s2/favicons?sz=256&domain_url=${encodeURIComponent(site)}`;
}
