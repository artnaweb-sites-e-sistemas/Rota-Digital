"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { getLeads, updateLead } from "@/lib/leads";
import { getReportByLead, saveReport, updateReport } from "@/lib/reports";
import { persistEvidenceImagesToStorage } from "@/lib/evidence-storage";
import { Lead } from "@/types/lead";
import type { RotaDigitalReport } from "@/types/report";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GenerateRouteProgressOverlay } from "@/components/rotas/generate-route-progress-overlay";

const FINAL_PROGRESS_MS = 3000;
const ESTIMATED_PROGRESS_TO_88_MS = 1 * 60 * 1000;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Anima de `from` até 100% em `durationMs` (requestAnimationFrame). */
function runProgressTo100(
  from: number,
  durationMs: number,
  onFrame: (pct: number) => void
): Promise<void> {
  return new Promise((resolve) => {
    const start = Math.min(100, Math.max(0, from));
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const pct = start + (100 - start) * easeOutCubic(t);
      onFrame(Math.min(100, Math.round(pct * 100) / 100));
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        onFrame(100);
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

export default function NewRotaPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [leadId, setLeadId] = useState<string>("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [servicesOffered, setServicesOffered] = useState("");
  const [objective, setObjective] = useState("");
  const [progressOverlayOpen, setProgressOverlayOpen] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [completingFinalStretch, setCompletingFinalStretch] = useState(false);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisProgressRef = useRef(0);
  const progressStartedAtRef = useRef(0);

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === leadId) ?? null,
    [leads, leadId]
  );

  useEffect(() => {
    const run = async () => {
      if (!user) return;
      try {
        setLoadingLeads(true);
        const data = await getLeads(user.uid);
        setLeads(data);
      } catch (err) {
        console.error(err);
        setError("Não foi possível carregar os leads.");
      } finally {
        setLoadingLeads(false);
      }
    };
    run();
  }, [user]);

  useEffect(() => {
    const initialLeadId = searchParams.get("leadId");
    if (!initialLeadId) return;
    setLeadId((current) => current || initialLeadId);
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, []);

  const clearProgressTimer = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const handleGenerate = async () => {
    if (!user || !selectedLead) return;
    if (!websiteUrl.trim() && !instagramUrl.trim()) {
      setError("Preencha ao menos Site ou Instagram para a análise.");
      return;
    }

    clearProgressTimer();
    setCompletingFinalStretch(false);
    analysisProgressRef.current = 0;
    progressStartedAtRef.current = Date.now();
    setAnalysisProgress(0);
    setProgressOverlayOpen(true);
    setSaving(true);
    setError(null);

    progressIntervalRef.current = setInterval(() => {
      setAnalysisProgress((p) => {
        if (p >= 88) return p;
        const elapsedMs = Math.max(0, Date.now() - progressStartedAtRef.current);
        const ratio = Math.min(1, elapsedMs / ESTIMATED_PROGRESS_TO_88_MS);
        const target = ratio * 88;
        const gapToTarget = target - p;
        let inc: number;

        // Acelera no início/meio, desacelera perto do alvo e mantém fluidez sem “disparar”.
        if (gapToTarget > 1.2) {
          inc = 0.30 + Math.random() * 0.16;
        } else if (gapToTarget > 0.25) {
          inc = 0.12 + Math.random() * 0.10;
        } else {
          // Pequeno avanço visual mesmo quando já está perto do alvo do tempo.
          inc = 0.04 + Math.random() * 0.05;
        }

        const next = Math.min(88, Math.round((p + inc) * 10) / 10);
        analysisProgressRef.current = next;
        return next;
      });
    }, 250);

    try {
      const res = await fetch("/api/generate-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: selectedLead.id,
          userId: user.uid,
          name: selectedLead.name,
          email: selectedLead.email,
          phone: selectedLead.phone,
          company: selectedLead.company,
          status: selectedLead.status,
          websiteUrl: websiteUrl.trim(),
          instagramUrl: instagramUrl.trim(),
          servicesOffered: servicesOffered.trim(),
          objective: objective.trim(),
        }),
      });

      const rawBody = await res.text();
      let data: { error?: string; report?: Record<string, unknown>; debug?: unknown } = {};
      try {
        data = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        const fallbackMessage =
          res.status === 504
            ? "Tempo esgotado ao gerar a rota em produção. Tente novamente em instantes."
            : "Erro ao gerar rota.";
        throw new Error(data.error || fallbackMessage);
      }
      if (!data.report) {
        throw new Error("Resposta inválida da API ao gerar rota.");
      }
      console.info("[IG_DEBUG][client][generate-route-response]", data?.debug || null);

      let reportWithStoredEvidence = data.report as Omit<RotaDigitalReport, "id">;
      try {
        reportWithStoredEvidence = await persistEvidenceImagesToStorage({
          report: data.report as Omit<RotaDigitalReport, "id">,
          userId: user.uid,
          leadId: selectedLead.id,
        });
      } catch (storageErr) {
        // Não bloqueia o fluxo principal se upload de imagem falhar no cliente.
        console.warn("Falha ao persistir evidências no Storage, seguindo com URLs originais.", storageErr);
      }
      console.info("[IG_DEBUG][client][report-after-storage]", {
        instagramBioExcerpt: reportWithStoredEvidence?.evidences?.instagramBioExcerpt || null,
        instagramSnapshotUrl: reportWithStoredEvidence?.evidences?.instagramSnapshotUrl || null,
        instagramProfileImageUrl: reportWithStoredEvidence?.evidences?.instagramProfileImageUrl || null,
        researchNotes: reportWithStoredEvidence?.evidences?.researchNotes || null,
      });

      const existing = await getReportByLead(selectedLead.id, user.uid);
      console.info("[IG_DEBUG][client][firestore-step]", {
        step: "getReportByLead",
        foundExisting: Boolean(existing),
        existingReportId: existing?.id || null,
      });
      let reportId: string;
      if (existing) {
        console.info("[IG_DEBUG][client][firestore-step]", {
          step: "updateReport",
          reportId: existing.id,
        });
        await updateReport(existing.id, {
          ...reportWithStoredEvidence,
          publicSlug: existing.publicSlug || reportWithStoredEvidence.publicSlug,
        });
        reportId = existing.id;
      } else {
        console.info("[IG_DEBUG][client][firestore-step]", {
          step: "saveReport",
        });
        reportId = await saveReport(reportWithStoredEvidence);
      }

      console.info("[IG_DEBUG][client][firestore-step]", {
        step: "updateLead.reportId",
        leadId: selectedLead.id,
        reportId,
      });
      await updateLead(selectedLead.id, { reportId });

      clearProgressTimer();
      setCompletingFinalStretch(true);
      await runProgressTo100(analysisProgressRef.current, FINAL_PROGRESS_MS, (pct) => {
        analysisProgressRef.current = pct;
        setAnalysisProgress(pct);
      });
      setCompletingFinalStretch(false);
      router.push(`/dashboard/rotas/${reportId}`);
    } catch (err: unknown) {
      clearProgressTimer();
      setCompletingFinalStretch(false);
      setProgressOverlayOpen(false);
      setAnalysisProgress(0);
      analysisProgressRef.current = 0;
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 w-full">
      <GenerateRouteProgressOverlay
        open={progressOverlayOpen}
        progress={analysisProgress}
        companyName={selectedLead?.company}
        instantBarWidth={completingFinalStretch}
      />
      <div>
        <h1 className="text-3xl font-bold text-foreground">Gerar Rota Digital</h1>
        <p className="text-muted-foreground mt-1">
          Selecione o lead e preencha o briefing principal.
        </p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Briefing da análise</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingLeads ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Lead</Label>
                <Select value={leadId || null} onValueChange={(value) => setLeadId(value ?? "")}>
                  <SelectTrigger className="w-full min-w-0 justify-between">
                    {selectedLead ? (
                      <span className="truncate text-left">
                        {selectedLead.name} - {selectedLead.company}
                      </span>
                    ) : (
                      <SelectValue placeholder="Selecione o lead" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {leads.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>
                        {lead.name} - {lead.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Site da empresa</Label>
                <Input
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://site.com.br"
                />
              </div>

              <div className="space-y-2">
                <Label>Instagram</Label>
                <Input
                  value={instagramUrl}
                  onChange={(e) => setInstagramUrl(e.target.value)}
                  placeholder="https://instagram.com/empresa ou @empresa"
                />
              </div>

              <div className="space-y-2">
                <Label>Serviços oferecidos (opcional)</Label>
                <Textarea
                  value={servicesOffered}
                  onChange={(e) => setServicesOffered(e.target.value)}
                  placeholder="Se vazio, a IA tenta inferir pelo site e Instagram."
                  className="min-h-[90px]"
                />
              </div>

              <div className="space-y-2">
                <Label>Objetivo (opcional)</Label>
                <Textarea
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="Se vazio, a IA sugere objetivos e gargalos com base na análise."
                  className="min-h-[90px]"
                />
              </div>
            </>
          )}

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              variant="cta"
              onClick={handleGenerate}
              disabled={saving || loadingLeads || !leadId}
              className="gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {saving ? "Gerando rota..." : "Gerar Rota"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard/rotas")}>
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

