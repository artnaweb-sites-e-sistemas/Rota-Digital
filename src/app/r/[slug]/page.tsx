import { notFound } from "next/navigation";

import { RotaDigitalReportView } from "@/components/rotas/rota-digital-report-view";
import { getPublicProposalReportBySlug } from "@/lib/public-report-server";
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

/**
 * Página pública do relatório (mesmo layout que no dashboard, sem login).
 *
 * Em produção, defina `FIREBASE_SERVICE_ACCOUNT_JSON` na Vercel para leitura via Admin SDK.
 */
export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!slug) notFound();

  const raw = await getPublicProposalReportBySlug(slug);
  if (!raw) notFound();

  const report = toClientReport(raw);

  return (
    <div className="flex min-h-dvh min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-background">
        <div className="mx-auto w-full min-h-0 max-w-[1760px] px-6 py-8 sm:px-8 md:px-10">
          <RotaDigitalReportView variant="public" report={report} />
        </div>
      </main>
    </div>
  );
}
