import { notFound } from "next/navigation";

import { getReportByPublicSlug } from "@/lib/reports";

export const dynamic = "force-dynamic";

/**
 * Página pública da proposta HTML para o lead.
 * Ajuste as regras do Firestore para permitir leitura anônima na coleção `reports`
 * quando `publicSlug` for igual ao da URL, por exemplo:
 *
 * match /reports/{id} {
 *   allow read: if resource.data.publicSlug != null;
 * }
 *
 * (Refine conforme sua política de segurança.)
 */
export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!slug) notFound();

  const report = await getReportByPublicSlug(slug);
  if (!report?.proposalHtml) notFound();

  return (
    <div className="min-h-dvh w-full bg-background">
      <div className="mx-auto h-dvh w-full max-w-[1500px]">
        <iframe
          title={`Proposta — ${report.leadCompany}`}
          className="h-full w-full border-0 bg-white"
          sandbox=""
          srcDoc={report.proposalHtml}
        />
      </div>
    </div>
  );
}
