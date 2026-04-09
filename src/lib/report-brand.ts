import type { RotaDigitalReport } from "@/types/report";

function hrefForWebsite(url?: string): string | undefined {
  const t = url?.trim();
  if (!t) return undefined;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

/** URL do favicon do site (ou logo já salvo nas evidências). Sem site/logo → undefined. */
export function getReportSiteIconSrc(report: RotaDigitalReport): string | undefined {
  const stored = report.evidences?.logoImageUrl?.trim();
  if (stored) return stored;
  const site = hrefForWebsite(report.brief?.websiteUrl);
  if (!site) return undefined;
  return `https://www.google.com/s2/favicons?sz=256&domain_url=${encodeURIComponent(site)}`;
}
