import { notFound } from "next/navigation";

import { getPublicProposalReportBySlug } from "@/lib/public-report-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Página pública da proposta HTML para o lead (sem login).
 *
 * Em produção, defina `FIREBASE_SERVICE_ACCOUNT_JSON` na Vercel (JSON da service account
 * com acesso ao Firestore) para leitura via Admin SDK — assim as regras podem manter
 * `reports` fechadas para clientes anônimos.
 *
 * Sem Admin: é necessário regra Firestore permitindo leitura da query por `publicSlug`.
 */
export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!slug) notFound();

  const report = await getPublicProposalReportBySlug(slug);
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
