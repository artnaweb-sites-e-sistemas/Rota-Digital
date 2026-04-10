"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { RotaDigitalReportView } from "@/components/rotas/rota-digital-report-view";
import { Button } from "@/components/ui/button";
import { getReport } from "@/lib/reports";
import type { RotaDigitalReport } from "@/types/report";

export default function ReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const router = useRouter();
  const [report, setReport] = useState<RotaDigitalReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      if (!reportId) return;
      try {
        const data = await getReport(reportId as string);
        console.info("[IG_DEBUG][client][report-page-loaded]", {
          reportId: reportId as string,
          hasReport: Boolean(data),
          instagramBioExcerpt: data?.evidences?.instagramBioExcerpt || null,
          instagramSnapshotUrl: data?.evidences?.instagramSnapshotUrl || null,
          instagramProfileImageUrl: data?.evidences?.instagramProfileImageUrl || null,
          researchNotes: data?.evidences?.researchNotes || null,
        });
        setReport(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [reportId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-zinc-400" size={32} />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-zinc-400">Relatório não encontrado.</p>
        <Button variant="outline" onClick={() => router.back()}>
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <RotaDigitalReportView
      report={report}
      variant="dashboard"
      onReportChange={setReport}
    />
  );
}
