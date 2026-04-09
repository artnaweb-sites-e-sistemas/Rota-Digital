"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getLead } from "@/lib/leads";
import { getReportByLead } from "@/lib/reports";
import { Lead } from "@/types/lead";
import { RotaDigitalReport } from "@/types/report";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  ExternalLink,
  User,
  Building2,
  Mail,
  Phone,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/link-button";

const STATUS_COLORS: Record<string, string> = {
  Novo: "bg-blue-500",
  "Em Contato": "bg-yellow-500",
  Qualificado: "bg-green-500",
  Convertido: "bg-purple-500",
  Perdido: "bg-red-500",
};

export default function LeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [lead, setLead] = useState<Lead | null>(null);
  const [existingReport, setExistingReport] = useState<RotaDigitalReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!leadId) return;
      try {
        setLoading(true);
        const [leadData, reportData] = await Promise.all([
          getLead(leadId as string),
          user ? getReportByLead(leadId as string, user.uid) : Promise.resolve(null),
        ]);
        setLead(leadData);
        setExistingReport(reportData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [leadId, user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-zinc-400" size={32} />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-zinc-400">Lead não encontrado.</p>
        <Button variant="outline" onClick={() => router.back()}>
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/dashboard/leads")}
          className="text-zinc-400 hover:text-white"
        >
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-white">{lead.name}</h1>
          <p className="text-zinc-400 mt-1">{lead.company}</p>
        </div>
        <Badge
          className={`ml-auto ${STATUS_COLORS[lead.status] || "bg-zinc-600"} text-white border-none`}
        >
          {lead.status}
        </Badge>
      </div>

      {/* Lead Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Informações de Contato
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-zinc-300">
              <User size={16} className="text-zinc-500 shrink-0" />
              <span>{lead.name}</span>
            </div>
            <div className="flex items-center gap-3 text-zinc-300">
              <Building2 size={16} className="text-zinc-500 shrink-0" />
              <span>{lead.company}</span>
            </div>
            <div className="flex items-center gap-3 text-zinc-300">
              <Mail size={16} className="text-zinc-500 shrink-0" />
              <span>{lead.email || "—"}</span>
            </div>
            <div className="flex items-center gap-3 text-zinc-300">
              <Phone size={16} className="text-zinc-500 shrink-0" />
              <span>{lead.phone || "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Outros Detalhes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-zinc-300">
              <Calendar size={16} className="text-zinc-500 shrink-0" />
              <span>
                Criado em{" "}
                {new Date(lead.createdAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
            {lead.notes && (
              <div className="mt-2">
                <p className="text-xs text-zinc-500 mb-1">Observações</p>
                <p className="text-zinc-300 text-sm whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Route Generation */}
      <Card className="bg-gradient-to-br from-indigo-950/60 to-zinc-900 border-indigo-800/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Sparkles size={20} className="text-indigo-400" />
            Rota Digital com IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {existingReport ? (
            <div className="space-y-3">
              <p className="text-zinc-300 text-sm">
                Já existe uma Rota Digital gerada para este lead em{" "}
                <span className="text-indigo-400 font-medium">
                  {new Date(existingReport.createdAt).toLocaleDateString("pt-BR")}
                </span>
                .
              </p>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-3">
                <LinkButton href={`/dashboard/rotas/${existingReport.id}`} className="gap-2">
                  <ExternalLink size={16} />
                  Ver Relatório
                </LinkButton>
                <LinkButton
                  href={`/dashboard/rotas/new?leadId=${lead.id}`}
                  variant="outline"
                  className="gap-2 border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                >
                  <Sparkles size={16} />
                  Atualizar rota
                </LinkButton>
                </div>
                {existingReport.publicSlug ? (
                  <p className="text-xs text-zinc-500">
                    Link para o lead:{" "}
                    <Link
                      href={`/r/${existingReport.publicSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:underline"
                    >
                      abrir página pública
                    </Link>
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-zinc-400 text-sm">
                Para gerar, abra o formulário de rota, selecione este lead e
                preencha site, instagram, serviços e objetivo.
              </p>
              <LinkButton href={`/dashboard/rotas/new?leadId=${lead.id}`} className="gap-2">
                <Sparkles size={16} />
                Ir para Gerar Rota
              </LinkButton>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
