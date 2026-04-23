import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { mergeProposalAgencySnapshotForPublicView } from "@/lib/merge-proposal-public-agency";
import { getCachedPublicProposalBySlug } from "@/lib/public-proposal-cache";
import {
  getCachedOwnerAccountEmailAdmin,
  getCachedUserCompanyAboutSettingsAdmin,
  getCachedUserReportCtaSettingsAdmin,
} from "@/lib/user-settings-admin";
import { resolveReportCtas } from "@/lib/report-cta";
import { PublicShareThemeBootstrap } from "@/components/public-share-theme-bootstrap";
import { ProposalView } from "@/components/propostas/proposal-view";
import type { Proposal } from "@/types/proposal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function millisFromUnknown(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const maybeTimestamp = value as { toMillis?: () => number } | null | undefined;
  if (value != null && typeof maybeTimestamp?.toMillis === "function") return maybeTimestamp.toMillis();
  return Date.now();
}

function toClientProposal(raw: Proposal): Proposal {
  return {
    ...raw,
    createdAt: millisFromUnknown(raw.createdAt as unknown),
    updatedAt: millisFromUnknown(raw.updatedAt as unknown),
    validUntilDate: millisFromUnknown(raw.validUntilDate as unknown),
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!slug) notFound();
  const raw = await getCachedPublicProposalBySlug(slug);
  if (!raw) notFound();
  const companyAbout = await getCachedUserCompanyAboutSettingsAdmin(raw.userId);
  const merged = mergeProposalAgencySnapshotForPublicView(toClientProposal(raw), companyAbout);

  const title = `${merged.title} | ${merged.lead.company}`;
  const description =
    merged.companyProfile.executiveSummary ||
    merged.companyProfile.companyProfile ||
    `Proposta comercial preparada para ${merged.lead.company}.`;
  const image =
    merged.evidences?.leadImageUrl ||
    merged.evidences?.agencyCoverUrl ||
    merged.evidences?.agencyImageUrl ||
    merged.agencySnapshot.primaryImageUrl ||
    merged.agencySnapshot.secondaryImageUrl;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "RouteLAB",
      locale: "pt_BR",
      type: "website",
      images: image ? [{ url: image, alt: merged.lead.company }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!slug) notFound();
  const raw = await getCachedPublicProposalBySlug(slug);
  if (!raw) notFound();
  const companyAbout = await getCachedUserCompanyAboutSettingsAdmin(raw.userId);
  const proposal = mergeProposalAgencySnapshotForPublicView(toClientProposal(raw), companyAbout);
  const reportCtaSettings = await getCachedUserReportCtaSettingsAdmin(raw.userId);
  const ownerAccountEmail = await getCachedOwnerAccountEmailAdmin(raw.userId);
  const reportCta = resolveReportCtas(reportCtaSettings, null, { accountEmail: ownerAccountEmail });

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <PublicShareThemeBootstrap />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-background">
        <div className="mx-auto w-full min-h-0 min-w-0 max-w-[1760px] px-4 py-8 sm:px-6 md:px-8 lg:px-10">
          <ProposalView proposal={proposal} variant="public" reportCta={reportCta} />
        </div>
      </main>
    </div>
  );
}
