import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicShareThemeBootstrap } from "@/components/public-share-theme-bootstrap";
import { RotaDigitalReportView } from "@/components/rotas/rota-digital-report-view";
import { getCachedPublicProposalReportBySlug } from "@/lib/public-report-cache";
import { getCachedUserReportCtaSettingsAdmin } from "@/lib/user-settings-admin";
import {
  buildPublicReportCanonicalUrl,
  buildReportShareDescription,
  getSiteOrigin,
  resolveReportShareImageUrl,
} from "@/lib/report-open-graph";
import type { RotaDigitalReport } from "@/types/report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function millisFromUnknown(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const t = value as { toMillis?: () => number } | null | undefined;
  if (value != null && typeof t?.toMillis === "function") return t.toMillis();
  return Date.now();
}

/** Admin SDK pode devolver `Timestamp` em `createdAt`; o cliente precisa de número. */
function toClientReport(raw: RotaDigitalReport): RotaDigitalReport {
  return {
    ...raw,
    createdAt: millisFromUnknown(raw.createdAt as unknown),
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!slug) notFound();

  const raw = await getCachedPublicProposalReportBySlug(slug);
  if (!raw) notFound();

  const company = raw.leadCompany?.trim() || "Empresa";
  const title = `Rota Digital - ${company}`;
  const description = buildReportShareDescription(raw);
  const origin = getSiteOrigin();
  const canonical = buildPublicReportCanonicalUrl(slug, origin);
  const imageUrl = resolveReportShareImageUrl(raw, origin);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "Rota Digital",
      locale: "pt_BR",
      type: "website",
      url: canonical,
      images: imageUrl
        ? [
            {
              url: imageUrl,
              alt: `Logo ou identidade visual — ${company}`,
            },
          ]
        : undefined,
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

/**
 * Página pública do relatório (mesmo layout que no dashboard, sem login).
 *
 * Em produção, defina `FIREBASE_SERVICE_ACCOUNT_JSON` na Vercel para leitura via Admin SDK.
 * Para prévias de link (Open Graph) corretas, defina `NEXT_PUBLIC_SITE_URL` com a URL pública do deploy.
 */
export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!slug) notFound();

  const raw = await getCachedPublicProposalReportBySlug(slug);
  if (!raw) notFound();

  const report = toClientReport(raw);
  const initialCtaSettings = report.userId
    ? await getCachedUserReportCtaSettingsAdmin(report.userId)
    : null;

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <PublicShareThemeBootstrap />
      <main
        id="rota-report-scroll-root"
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-background"
      >
        <div className="mx-auto w-full min-h-0 min-w-0 max-w-[1760px] px-4 py-8 sm:px-6 md:px-8 lg:px-10">
          <RotaDigitalReportView
            variant="public"
            report={report}
            initialCtaSettings={initialCtaSettings}
          />
        </div>
      </main>
    </div>
  );
}
