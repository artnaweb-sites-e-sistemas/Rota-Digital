"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getReportsByUser, deleteReportAndCleanup } from "@/lib/reports";
import { RotaDigitalReport } from "@/types/report";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, Sparkles, Calendar, Trash2 } from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/link-button";
import { Button } from "@/components/ui/button";
import { ReportSiteAvatar } from "@/components/report-site-avatar";

const MATURITY_COLORS: Record<string, string> = {
  Iniciante: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  Intermediário: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  Avançado: "bg-green-500/20 text-green-300 border-green-500/30",
};

export default function RotasPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<RotaDigitalReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteReport = async (report: RotaDigitalReport) => {
    if (!user) return;
    const ok = window.confirm(
      `Excluir o relatório de "${report.leadCompany}"? O link público deixará de funcionar e os arquivos de evidência serão removidos.`
    );
    if (!ok) return;
    setDeletingId(report.id);
    try {
      await deleteReportAndCleanup({
        reportId: report.id,
        leadId: report.leadId,
        userId: user.uid,
      });
      setReports((prev) => prev.filter((r) => r.id !== report.id));
    } catch (err) {
      console.error(err);
      window.alert("Não foi possível excluir o relatório. Verifique sua conexão e as permissões do Firebase.");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    const fetchReports = async () => {
      if (!user) return;
      try {
        setLoading(true);
        const data = await getReportsByUser(user.uid);
        setReports(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, [user]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Rotas Digitais</h1>
          <p className="text-zinc-400 mt-1">Relatórios gerados por IA para seus leads</p>
        </div>
        <LinkButton href="/dashboard/rotas/new" className="gap-2">
          <Sparkles size={16} />
          Gerar Rota
        </LinkButton>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="animate-spin text-zinc-400" size={24} />
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
          <Sparkles className="mx-auto mb-4 text-zinc-600" size={32} />
          <p className="text-zinc-400 text-lg font-medium">Nenhum relatório gerado ainda</p>
          <p className="text-zinc-500 text-sm mt-1 mb-6 max-w-md mx-auto">
            Clique em <strong className="text-zinc-400">Gerar Rota</strong>, selecione um lead e preencha
            site, instagram, serviços e objetivo para a IA gerar o relatório.
          </p>
          <LinkButton href="/dashboard/rotas/new" className="gap-2">
            <Sparkles size={16} />
            Gerar Rota
          </LinkButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {reports.map((report) => (
            <Card
              key={report.id}
              className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors"
            >
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <ReportSiteAvatar
                      report={report}
                      size="sm"
                      className="border border-zinc-700 bg-zinc-800/80 text-zinc-500"
                    />
                    <h3 className="font-semibold text-white truncate">{report.leadCompany}</h3>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge
                      className={`text-xs ${
                        MATURITY_COLORS[report.digitalMaturityLevel] || MATURITY_COLORS.Iniciante
                      }`}
                    >
                      {report.digitalMaturityLevel}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-zinc-400 hover:text-destructive"
                      disabled={deletingId === report.id}
                      aria-label="Excluir relatório"
                      onClick={() => handleDeleteReport(report)}
                    >
                      {deletingId === report.id ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                    <span>Score de Maturidade</span>
                    <span className="font-medium text-zinc-300">{report.digitalMaturityScore}/10</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${report.digitalMaturityScore * 10}%` }}
                    />
                  </div>
                </div>

                <p className="text-zinc-400 text-sm line-clamp-2">{report.executiveSummary}</p>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <Calendar size={12} />
                    {new Date(report.createdAt).toLocaleDateString("pt-BR")}
                  </div>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/dashboard/rotas/${report.id}`}
                      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-indigo-400 transition-colors hover:bg-indigo-950/50 hover:text-indigo-300"
                    >
                      <ExternalLink size={13} />
                      Visualizar
                    </Link>
                    {report.publicSlug ? (
                      <Link
                        href={`/r/${report.publicSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
                      >
                        Compartilhar
                      </Link>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
