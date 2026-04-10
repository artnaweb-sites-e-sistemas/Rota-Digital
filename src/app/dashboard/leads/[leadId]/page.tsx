"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getLead } from "@/lib/leads";
import { getReportByLead } from "@/lib/reports";
import { Lead, type LeadStatus } from "@/types/lead";
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
import { cn } from "@/lib/utils";

const STATUS_BADGE_SURFACE: Record<LeadStatus, string> = {
  Novo: "bg-blue-500/12 text-blue-950 dark:bg-blue-500/18 dark:text-blue-100",
  "Em Contato":
    "bg-amber-500/12 text-amber-950 dark:bg-yellow-500/18 dark:text-yellow-100",
  Qualificado:
    "bg-emerald-500/12 text-emerald-950 dark:bg-green-500/18 dark:text-green-100",
  Convertido:
    "bg-purple-500/12 text-purple-950 dark:bg-purple-500/18 dark:text-purple-100",
  Perdido: "bg-red-500/12 text-red-950 dark:bg-red-500/18 dark:text-red-100",
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
        <Loader2 className="animate-spin text-muted-foreground" size={32} />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-muted-foreground">Lead não encontrado.</p>
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
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{lead.name}</h1>
          <p className="mt-1 text-muted-foreground">{lead.company}</p>
        </div>
        <Badge className={cn("ml-auto border-none", STATUS_BADGE_SURFACE[lead.status])}>
          {lead.status}
        </Badge>
      </div>

      {/* Lead Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Informações de Contato
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-foreground">
              <User size={16} className="shrink-0 text-muted-foreground" />
              <span>{lead.name}</span>
            </div>
            <div className="flex items-center gap-3 text-foreground">
              <Building2 size={16} className="shrink-0 text-muted-foreground" />
              <span>{lead.company}</span>
            </div>
            <div className="flex items-center gap-3 text-foreground">
              <Mail size={16} className="shrink-0 text-muted-foreground" />
              <span>{lead.email || "—"}</span>
            </div>
            <div className="flex items-center gap-3 text-foreground">
              <Phone size={16} className="shrink-0 text-muted-foreground" />
              <span>{lead.phone || "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Outros Detalhes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-foreground">
              <Calendar size={16} className="shrink-0 text-muted-foreground" />
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
                <p className="mb-1 text-xs text-muted-foreground">Observações</p>
                <p className="whitespace-pre-wrap text-sm text-foreground/90">{lead.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Route Generation */}
      <Card className="border border-indigo-500/25 bg-gradient-to-br from-indigo-500/8 to-card dark:from-indigo-950/60 dark:to-zinc-900 dark:border-indigo-800/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Sparkles size={20} className="text-indigo-600 dark:text-indigo-400" />
            Rota Digital com IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {existingReport ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground/90">
                Já existe uma Rota Digital gerada para este lead em{" "}
                <span className="font-medium text-indigo-700 dark:text-indigo-400">
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
                  className="gap-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  <Sparkles size={16} />
                  Atualizar rota
                </LinkButton>
                </div>
                {existingReport.publicSlug ? (
                  <p className="text-xs text-muted-foreground">
                    Link para o lead:{" "}
                    <Link
                      href={`/r/${existingReport.publicSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-400"
                    >
                      abrir página pública
                    </Link>
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
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
