"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Loader2, Phone, Search, Sparkles, UserPlus } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { createLead, getLeads, updateLead } from "@/lib/leads";
import { getReportByLead, saveReport, updateReport } from "@/lib/reports";
import { getUserAiPromptSettings } from "@/lib/user-settings";
import { AI_RECOMMENDED_CHANNEL_OPTIONS, sanitizeAiRecommendedChannelIds } from "@/lib/ai-recommended-channel-options";
import {
  AI_AGENCY_SERVICE_OPTIONS,
  MAX_CUSTOM_SERVICE_LABEL_LEN,
  MAX_CUSTOM_SERVICE_LABELS,
  parseCustomServiceLabelsFromMultiline,
  sanitizeAiCustomServiceLabels,
  sanitizeAiServiceOfferingIds,
} from "@/lib/ai-agency-services";
import { sanitizeAiScoringStrictness } from "@/lib/ai-scoring-strictness-prompt";
import { sanitizeAiOpenRecommendedChannelCount } from "@/lib/ai-recommended-channels-prompt";
import type {
  AiRecommendedChannelsPolicy,
  AiScoringStrictness,
  AiServicesFocusPolicy,
} from "@/types/user-settings";
import {
  describeManualUploadFailure,
  persistEvidenceImagesToStorage,
  uploadRotaGenerationDraftImage,
} from "@/lib/evidence-storage";
import { isLeadStatusSelectable } from "@/lib/lead-status-rules";
import { Lead, LEAD_STATUSES, type LeadStatus } from "@/types/lead";
import type { RotaDigitalReport } from "@/types/report";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  GenerateRouteProgressOverlay,
  type GenerateRouteEvidenceRecovery,
} from "@/components/rotas/generate-route-progress-overlay";
import { PlanLimitModal, type PlanLimitModalState } from "@/components/limits/plan-limit-modal";
import { normalizedSubscriptionPlanKey, type PlanKey } from "@/lib/plan-quotas";
import { cn } from "@/lib/utils";

const MAX_AI_GUIDELINES_ROUTE = 3000;
const FINAL_PROGRESS_MS = 3000;
const ESTIMATED_PROGRESS_TO_88_MS = 1 * 60 * 1000;
const SCORING_OPTIONS: { id: AiScoringStrictness; label: string }[] = [
  { id: "free", label: "Livre" },
  { id: "low", label: "Baixa" },
  { id: "medium", label: "Média" },
  { id: "high", label: "Alta" },
];

function scoringCompactClass(id: AiScoringStrictness, selected: boolean): string {
  if (!selected) {
    return "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50";
  }
  switch (id) {
    case "free":
      return "border-muted-foreground/40 bg-muted text-foreground";
    case "low":
      return "border-emerald-500/50 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100";
    case "medium":
      return "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100";
    case "high":
      return "border-red-500/50 bg-red-500/10 text-red-900 dark:text-red-100";
  }
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

type PreparedEvidenceClient = Record<string, unknown> & {
  siteHeroSnapshotUrl?: string;
  instagramSnapshotUrl?: string;
  normalizedWebsiteUrl?: string;
  normalizedInstagramUrl?: string;
  websiteCandidateUrls?: string[];
  instagramSnapshotCandidates?: string[];
};

function mergeManualIntoPrepared(
  p: PreparedEvidenceClient,
  siteUrl: string | null,
  igUrl: string | null,
): PreparedEvidenceClient {
  const out: PreparedEvidenceClient = { ...p };
  if (siteUrl) {
    out.siteHeroSnapshotUrl = siteUrl;
    out.websiteCandidateUrls = [siteUrl, ...(p.websiteCandidateUrls || [])];
  }
  if (igUrl) {
    out.instagramSnapshotUrl = igUrl;
    out.instagramSnapshotCandidates = [igUrl, ...(p.instagramSnapshotCandidates || [])];
  }
  return out;
}

function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function formatLeadLabel(lead: Pick<Lead, "name" | "company">): string {
  const name = lead.name.trim();
  const company = lead.company.trim();

  if (!name) return company;
  if (!company) return name;

  const normalizedName = normalizeSearchText(name);
  const normalizedCompany = normalizeSearchText(company);

  if (normalizedName === normalizedCompany) return name;
  if (normalizedName.includes(normalizedCompany)) return name;
  if (normalizedCompany.includes(normalizedName)) return company;

  return `${name} - ${company}`;
}

function formatPhoneBr(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
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
  const [limitModalState, setLimitModalState] = useState<PlanLimitModalState | null>(null);

  const [leadId, setLeadId] = useState<string>("");
  const [leadQuery, setLeadQuery] = useState("");
  const [leadSearchOpen, setLeadSearchOpen] = useState(false);
  /** Evita autofill nativo do navegador (que cobre o dropdown da app). Libera no 1.º foco ou quando já há lead. */
  const [leadComboUnlocked, setLeadComboUnlocked] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [servicesOffered, setServicesOffered] = useState("");
  const [objective, setObjective] = useState("");
  const [isLeadDialogOpen, setIsLeadDialogOpen] = useState(false);
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadCompany, setNewLeadCompany] = useState("");
  const [newLeadEmail, setNewLeadEmail] = useState("");
  const [newLeadPhone, setNewLeadPhone] = useState("");
  const [newLeadWebsite, setNewLeadWebsite] = useState("");
  const [newLeadInstagram, setNewLeadInstagram] = useState("");
  const [newLeadStatus, setNewLeadStatus] = useState<LeadStatus>("Novo Lead");
  const [newLeadSaving, setNewLeadSaving] = useState(false);
  const [newLeadError, setNewLeadError] = useState<string | null>(null);
  const [progressOverlayOpen, setProgressOverlayOpen] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [completingFinalStretch, setCompletingFinalStretch] = useState(false);
  /** IA: espelha configurações salvas ao carregar; alterações valem só para esta geração. */
  const [aiSettingsLoading, setAiSettingsLoading] = useState(true);
  const [aiBasePromptGuidelines, setAiBasePromptGuidelines] = useState("");
  const [aiChannelPolicy, setAiChannelPolicy] = useState<AiRecommendedChannelsPolicy>("open");
  const [aiChannelIds, setAiChannelIds] = useState<string[]>([]);
  const [aiOpenChannelCount, setAiOpenChannelCount] = useState(2);
  const [aiServicesPolicy, setAiServicesPolicy] = useState<AiServicesFocusPolicy>("open");
  const [aiServiceIds, setAiServiceIds] = useState<string[]>([]);
  const [aiCustomServicesText, setAiCustomServicesText] = useState("");
  const [aiCustomServicesOpen, setAiCustomServicesOpen] = useState(false);
  const [aiScoringStrictness, setAiScoringStrictness] = useState<AiScoringStrictness>("free");
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisProgressRef = useRef(0);
  const progressStartedAtRef = useRef(0);
  /** após mostrar o passo "prints em falta", o `finally` de `handleGenerate` não repõe `saving` */
  const recoveryStashActiveRef = useRef(false);
  const generationPayloadRef = useRef<Record<string, unknown> | null>(null);
  const runSecondPhaseRef = useRef<((p: PreparedEvidenceClient) => Promise<void>) | null>(null);
  const [generateOverlayView, setGenerateOverlayView] = useState<"progress" | "recovery">("progress");
  const [preparedEvidenceStash, setPreparedEvidenceStash] = useState<PreparedEvidenceClient | null>(null);
  const [evidenceMissingSite, setEvidenceMissingSite] = useState(false);
  const [evidenceMissingIg, setEvidenceMissingIg] = useState(false);
  const [manualSiteUrl, setManualSiteUrl] = useState<string | null>(null);
  const [manualInstagramUrl, setManualInstagramUrl] = useState<string | null>(null);
  const [uploadingManualSite, setUploadingManualSite] = useState(false);
  const [uploadingManualIg, setUploadingManualIg] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const siteFileInputRef = useRef<HTMLInputElement | null>(null);
  const instagramFileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === leadId) ?? null,
    [leads, leadId]
  );

  const leadSuggestions = useMemo(() => {
    const q = normalizeSearchText(leadQuery);
    if (!q) {
      return [...leads]
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 5);
    }
    return leads
      .filter((lead) => {
        const hay = normalizeSearchText(
          `${lead.name} ${lead.company} ${lead.email} ${lead.phone || ""} ${lead.websiteUrl || ""} ${lead.instagramUrl || ""}`,
        );
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [leads, leadQuery]);

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
    if (!user) return;
    let cancelled = false;
    (async () => {
      setAiSettingsLoading(true);
      try {
        const data = await getUserAiPromptSettings(user.uid);
        if (cancelled) return;
        setAiBasePromptGuidelines((data?.aiBasePromptGuidelines || "").trim());
        setAiChannelPolicy(data?.aiRecommendedChannelsPolicy === "restricted" ? "restricted" : "open");
        setAiChannelIds(
          data?.aiRecommendedChannelIds?.length ? [...data.aiRecommendedChannelIds] : [],
        );
        setAiOpenChannelCount(sanitizeAiOpenRecommendedChannelCount(data?.aiOpenRecommendedChannelCount));
        setAiServicesPolicy(data?.aiServicesFocusPolicy === "restricted" ? "restricted" : "open");
        setAiServiceIds(data?.aiServiceOfferingIds?.length ? [...data.aiServiceOfferingIds] : []);
        const custom = data?.aiCustomServiceLabels?.length ? [...data.aiCustomServiceLabels] : [];
        setAiCustomServicesText(custom.join("\n"));
        setAiCustomServicesOpen(custom.length > 0);
        setAiScoringStrictness(sanitizeAiScoringStrictness(data?.aiScoringStrictness));
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setAiBasePromptGuidelines("");
          setAiChannelPolicy("open");
          setAiChannelIds([]);
          setAiOpenChannelCount(sanitizeAiOpenRecommendedChannelCount(undefined));
          setAiServicesPolicy("open");
          setAiServiceIds([]);
          setAiCustomServicesText("");
          setAiCustomServicesOpen(false);
          setAiScoringStrictness("free");
        }
      } finally {
        if (!cancelled) setAiSettingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    const initialLeadId = searchParams.get("leadId");
    if (!initialLeadId) return;
    setLeadId((current) => current || initialLeadId);
  }, [searchParams]);

  useEffect(() => {
    if (leadId) setLeadComboUnlocked(true);
  }, [leadId]);

  useEffect(() => {
    if (!selectedLead) {
      setWebsiteUrl("");
      setInstagramUrl("");
      return;
    }
    setLeadQuery(formatLeadLabel(selectedLead));
    setWebsiteUrl(selectedLead.websiteUrl?.trim() ?? "");
    setInstagramUrl(selectedLead.instagramUrl?.trim() ?? "");
  }, [selectedLead?.id]);

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

  const startProgressInterval = () => {
    clearProgressTimer();
    analysisProgressRef.current = 0;
    progressStartedAtRef.current = Date.now();
    setAnalysisProgress(0);
    progressIntervalRef.current = setInterval(() => {
      setAnalysisProgress((p) => {
        if (p >= 88) return p;
        const elapsedMs = Math.max(0, Date.now() - progressStartedAtRef.current);
        const ratio = Math.min(1, elapsedMs / ESTIMATED_PROGRESS_TO_88_MS);
        const target = ratio * 88;
        const gapToTarget = target - p;
        let inc: number;
        if (gapToTarget > 1.2) {
          inc = 0.3 + Math.random() * 0.16;
        } else if (gapToTarget > 0.25) {
          inc = 0.12 + Math.random() * 0.1;
        } else {
          inc = 0.04 + Math.random() * 0.05;
        }
        const next = Math.min(88, Math.round((p + inc) * 10) / 10);
        analysisProgressRef.current = next;
        return next;
      });
    }, 250);
  };

  const toggleAiChannel = (id: string) => {
    setAiChannelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAiService = (id: string) => {
    setAiServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleGenerate = async () => {
    if (!user || !selectedLead) return;
    if (aiSettingsLoading) {
      setError("Aguarde carregar as configurações de IA.");
      return;
    }
    if (!websiteUrl.trim() && !instagramUrl.trim()) {
      setError("Preencha ao menos Site ou Instagram para a análise.");
      return;
    }
    const guidelinesTrim = aiBasePromptGuidelines.trim();
    if (guidelinesTrim.length > MAX_AI_GUIDELINES_ROUTE) {
      setError(`Diretrizes da IA: no máximo ${MAX_AI_GUIDELINES_ROUTE} caracteres.`);
      return;
    }
    if (aiChannelPolicy === "restricted" && sanitizeAiRecommendedChannelIds(aiChannelIds).length === 0) {
      setError('Em “Canais”, escolha ao menos um canal ou mude para “Livre”.');
      return;
    }
    const parsedCustom =
      aiServicesPolicy === "restricted" && aiCustomServicesOpen
        ? parseCustomServiceLabelsFromMultiline(aiCustomServicesText)
        : [];
    if (
      aiServicesPolicy === "restricted" &&
      sanitizeAiServiceOfferingIds(aiServiceIds).length === 0 &&
      parsedCustom.length === 0
    ) {
      setError('Em “Serviços”, marque ao menos um serviço, preencha “Outros” ou mude para “Livre”.');
      return;
    }
    if (aiServicesPolicy === "restricted" && aiCustomServicesOpen && parsedCustom.length === 0) {
      setError('Preencha “Outros serviços” ou desmarque a opção.');
      return;
    }

    setCompletingFinalStretch(false);
    recoveryStashActiveRef.current = false;
    setGenerateOverlayView("progress");
    setPreparedEvidenceStash(null);
    setEvidenceMissingSite(false);
    setEvidenceMissingIg(false);
    setManualSiteUrl(null);
    setManualInstagramUrl(null);
    setRecoveryError(null);
    setProgressOverlayOpen(true);
    setSaving(true);
    setError(null);
    startProgressInterval();

    try {
      const aiRecommendedChannelsPolicy: AiRecommendedChannelsPolicy =
        aiChannelPolicy === "restricted" ? "restricted" : "open";
      const aiRecommendedChannelIds = sanitizeAiRecommendedChannelIds(
        aiChannelPolicy === "restricted" ? aiChannelIds : [],
      );
      const aiOpenRecommendedChannelCount = sanitizeAiOpenRecommendedChannelCount(aiOpenChannelCount);
      const aiServicesFocusPolicy: AiServicesFocusPolicy =
        aiServicesPolicy === "restricted" ? "restricted" : "open";
      const aiServiceOfferingIds = sanitizeAiServiceOfferingIds(
        aiServicesPolicy === "restricted" ? aiServiceIds : [],
      );
      const aiCustomServiceLabels = sanitizeAiCustomServiceLabels(
        aiServicesPolicy === "restricted" && aiCustomServicesOpen
          ? parseCustomServiceLabelsFromMultiline(aiCustomServicesText)
          : [],
      );
      const scoringForPayload = sanitizeAiScoringStrictness(aiScoringStrictness);
      const payload = {
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
        aiBasePromptGuidelines: guidelinesTrim,
        aiRecommendedChannelsPolicy,
        aiRecommendedChannelIds,
        aiOpenRecommendedChannelCount,
        aiServicesFocusPolicy,
        aiServiceOfferingIds,
        aiCustomServiceLabels,
        aiScoringStrictness: scoringForPayload,
      };
      const idToken = await user.getIdToken();
      const parseApiResponse = async (res: Response) => {
        const rawBody = await res.text();
        let parsed: {
          error?: string;
          code?: string;
          plan?: string;
          monthlyLimit?: number;
          usedThisMonth?: number;
          report?: Record<string, unknown>;
          debug?: unknown;
          preparedEvidence?: unknown;
        } = {};
        try {
          parsed = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          parsed = {};
        }
        return parsed;
      };
      const maybeHandleQuotaResponse = (
        res: Response,
        parsed: Awaited<ReturnType<typeof parseApiResponse>>,
      ): boolean => {
        if (res.status !== 429 || parsed.code !== "ROTAS_LIMIT_REACHED") return false;
        const plan: PlanKey = normalizedSubscriptionPlanKey(parsed.plan ?? "pro");
        setLimitModalState({
          kind: "rotas",
          plan,
          monthlyLimit: parsed.monthlyLimit,
          usedThisMonth: parsed.usedThisMonth,
        });
        setProgressOverlayOpen(false);
        clearProgressTimer();
        return true;
      };

      generationPayloadRef.current = payload;
      const runSecondPhase = async (prepared: PreparedEvidenceClient) => {
        const generateRes = await fetch("/api/generate-route", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({
            ...payload,
            mode: "generateFromEvidence",
            preparedEvidence: prepared,
          }),
        });
        const data = await parseApiResponse(generateRes);
        if (maybeHandleQuotaResponse(generateRes, data)) {
          return;
        }
        if (!generateRes.ok) {
          const fallbackMessage =
            generateRes.status === 504
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
        await updateLead(selectedLead.id, { reportId, status: "Rota Gerada" });

        clearProgressTimer();
        setCompletingFinalStretch(true);
        await runProgressTo100(analysisProgressRef.current, FINAL_PROGRESS_MS, (pct) => {
          analysisProgressRef.current = pct;
          setAnalysisProgress(pct);
        });
        setCompletingFinalStretch(false);
        setProgressOverlayOpen(false);
        router.push(`/dashboard/rotas/${reportId}`);
      };
      runSecondPhaseRef.current = runSecondPhase;

      // Etapa 1: coleta de evidências (prints, bio, URLs verificadas).
      const collectRes = await fetch("/api/generate-route", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          ...payload,
          mode: "collectEvidence",
        }),
      });
      const collectData = await parseApiResponse(collectRes);
      if (maybeHandleQuotaResponse(collectRes, collectData)) {
        return;
      }
      if (!collectRes.ok || !collectData.preparedEvidence) {
        const fallbackMessage =
          collectRes.status === 504
            ? "Tempo esgotado na coleta de evidências em produção. Tente novamente em instantes."
            : "Erro ao coletar evidências da rota.";
        throw new Error(collectData.error || fallbackMessage);
      }

      const prepared = collectData.preparedEvidence as PreparedEvidenceClient;
      const nWeb = String(prepared.normalizedWebsiteUrl || "").trim();
      const nIg = String(prepared.normalizedInstagramUrl || "").trim();
      const missSite = Boolean(nWeb) && !prepared.siteHeroSnapshotUrl;
      const missIg = Boolean(nIg) && !prepared.instagramSnapshotUrl;
      if (missSite || missIg) {
        setPreparedEvidenceStash(prepared);
        setEvidenceMissingSite(missSite);
        setEvidenceMissingIg(missIg);
        setManualSiteUrl(null);
        setManualInstagramUrl(null);
        setRecoveryError(null);
        setGenerateOverlayView("recovery");
        recoveryStashActiveRef.current = true;
        clearProgressTimer();
        setAnalysisProgress(100);
        return;
      }

      await runSecondPhase(prepared);
    } catch (err: unknown) {
      clearProgressTimer();
      setCompletingFinalStretch(false);
      setProgressOverlayOpen(false);
      setAnalysisProgress(0);
      analysisProgressRef.current = 0;
      setGenerateOverlayView("progress");
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setError(msg);
    } finally {
      if (!recoveryStashActiveRef.current) {
        setSaving(false);
      }
    }
  };

  const handleSiteDraftFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !user || !selectedLead) return;
    setUploadingManualSite(true);
    setRecoveryError(null);
    const res = await uploadRotaGenerationDraftImage({
      file: f,
      userId: user.uid,
      leadId: selectedLead.id,
      kind: "site",
    });
    setUploadingManualSite(false);
    if (!res.ok) {
      setRecoveryError(describeManualUploadFailure(res));
      return;
    }
    setManualSiteUrl(res.url);
  };

  const handleInstagramDraftFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !user || !selectedLead) return;
    setUploadingManualIg(true);
    setRecoveryError(null);
    const res = await uploadRotaGenerationDraftImage({
      file: f,
      userId: user.uid,
      leadId: selectedLead.id,
      kind: "instagram",
    });
    setUploadingManualIg(false);
    if (!res.ok) {
      setRecoveryError(describeManualUploadFailure(res));
      return;
    }
    setManualInstagramUrl(res.url);
  };

  const handleRecoveryWithoutPrints = async () => {
    const run = runSecondPhaseRef.current;
    const p = preparedEvidenceStash;
    if (!user || !selectedLead || !p || !run) return;
    setRecoveryError(null);
    setRecoveryBusy(true);
    recoveryStashActiveRef.current = false;
    setGenerateOverlayView("progress");
    setSaving(true);
    startProgressInterval();
    try {
      await run(p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      setRecoveryError(msg);
      setGenerateOverlayView("recovery");
      clearProgressTimer();
      setAnalysisProgress(0);
    } finally {
      setRecoveryBusy(false);
      setSaving(false);
    }
  };

  const handleRecoveryWithPrints = async () => {
    const run = runSecondPhaseRef.current;
    const p = preparedEvidenceStash;
    if (!user || !selectedLead || !p || !run) return;
    let canProceedRecovery = false;
    if (evidenceMissingSite && evidenceMissingIg) {
      canProceedRecovery = Boolean(manualSiteUrl || manualInstagramUrl);
    } else if (evidenceMissingSite) {
      canProceedRecovery = Boolean(manualSiteUrl);
    } else if (evidenceMissingIg) {
      canProceedRecovery = Boolean(manualInstagramUrl);
    }
    if (!canProceedRecovery) {
      setRecoveryError("Envie os prints necessários para esta opção.");
      return;
    }
    const merged = mergeManualIntoPrepared(p, manualSiteUrl, manualInstagramUrl);
    setRecoveryError(null);
    setRecoveryBusy(true);
    recoveryStashActiveRef.current = false;
    setGenerateOverlayView("progress");
    setSaving(true);
    startProgressInterval();
    try {
      await run(merged);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      setRecoveryError(msg);
      setGenerateOverlayView("recovery");
      clearProgressTimer();
      setAnalysisProgress(0);
    } finally {
      setRecoveryBusy(false);
      setSaving(false);
    }
  };

  const generateEvidenceRecoveryPanel: GenerateRouteEvidenceRecovery | null =
    generateOverlayView === "recovery" && preparedEvidenceStash
      ? (() => {
          let canProceedRecovery = false;
          if (evidenceMissingSite && evidenceMissingIg) {
            canProceedRecovery = Boolean(manualSiteUrl || manualInstagramUrl);
          } else if (evidenceMissingSite) {
            canProceedRecovery = Boolean(manualSiteUrl);
          } else if (evidenceMissingIg) {
            canProceedRecovery = Boolean(manualInstagramUrl);
          }
          return {
            companyName: selectedLead?.company,
            missingSite: evidenceMissingSite,
            missingInstagram: evidenceMissingIg,
            sitePreviewUrl: manualSiteUrl,
            instagramPreviewUrl: manualInstagramUrl,
            uploadingSite: uploadingManualSite,
            uploadingInstagram: uploadingManualIg,
            onRequestSiteFile: () => siteFileInputRef.current?.click(),
            onRequestInstagramFile: () => instagramFileInputRef.current?.click(),
            onAnalyzeWithoutPrints: () => void handleRecoveryWithoutPrints(),
            onProceedWithAnalysis: () => void handleRecoveryWithPrints(),
            canProceed: canProceedRecovery,
            running: recoveryBusy,
            error: recoveryError,
          };
        })()
      : null;

  const openCreateLeadDialog = () => {
    setNewLeadName(leadQuery.trim());
    setNewLeadCompany("");
    setNewLeadEmail("");
    setNewLeadPhone("");
    setNewLeadWebsite("");
    setNewLeadInstagram("");
    setNewLeadStatus("Novo Lead");
    setNewLeadError(null);
    setIsLeadDialogOpen(true);
    setLeadSearchOpen(false);
  };

  const handleCreateLead = async () => {
    if (!user) return;
    if (!newLeadName.trim() || !newLeadCompany.trim()) {
      setNewLeadError("Nome e empresa são obrigatórios.");
      return;
    }
    if (!isLeadStatusSelectable(newLeadStatus, false)) {
      setNewLeadError("O status Rota Gerada só fica disponível depois de gerar o relatório.");
      return;
    }
    setNewLeadSaving(true);
    setNewLeadError(null);
    try {
      const newId = await createLead({
        userId: user.uid,
        name: newLeadName.trim(),
        company: newLeadCompany.trim(),
        email: newLeadEmail.trim(),
        phone: newLeadPhone.trim(),
        websiteUrl: newLeadWebsite.trim(),
        instagramUrl: newLeadInstagram.trim(),
        status: newLeadStatus,
      });
      const freshLeads = await getLeads(user.uid);
      setLeads(freshLeads);
      const created = freshLeads.find((l) => l.id === newId) ?? null;
      if (created) {
        setLeadId(created.id);
        setLeadQuery(formatLeadLabel(created));
        setWebsiteUrl(created.websiteUrl?.trim() ?? "");
        setInstagramUrl(created.instagramUrl?.trim() ?? "");
      } else {
        setLeadId(newId);
      }
      setIsLeadDialogOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao criar lead.";
      setNewLeadError(msg);
    } finally {
      setNewLeadSaving(false);
    }
  };

  return (
    <div className="space-y-6 w-full">
      <input
        type="file"
        ref={siteFileInputRef}
        className="sr-only"
        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
        tabIndex={-1}
        onChange={handleSiteDraftFile}
      />
      <input
        type="file"
        ref={instagramFileInputRef}
        className="sr-only"
        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
        tabIndex={-1}
        onChange={handleInstagramDraftFile}
      />
      <GenerateRouteProgressOverlay
        open={progressOverlayOpen}
        view={generateOverlayView === "recovery" ? "recovery" : "progress"}
        progress={analysisProgress}
        companyName={selectedLead?.company}
        instantBarWidth={completingFinalStretch}
        evidenceRecovery={generateEvidenceRecoveryPanel}
      />
      <PlanLimitModal
        state={limitModalState}
        onClose={() => setLimitModalState(null)}
        getIdToken={user ? () => user.getIdToken() : undefined}
      />
      <div>
        <h1 className="text-3xl font-bold text-foreground">Gerar Rota Digital</h1>
        <p className="text-muted-foreground mt-1">
          Selecione o lead e preencha o briefing principal.
        </p>
      </div>

      <Card className="border-border bg-card shadow-xl dark:border-white/5 dark:bg-white/[0.02]">
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
                <Label htmlFor="rota-new-lead-combobox">Lead</Label>
                <form
                  className="contents"
                  autoComplete="off"
                  onSubmit={(e) => e.preventDefault()}
                >
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="rota-new-lead-combobox"
                      name="rota_digital_lead_search"
                      value={leadQuery}
                      readOnly={!leadComboUnlocked}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-1p-ignore
                      data-lpignore="true"
                      data-form-type="other"
                      aria-autocomplete="list"
                      aria-expanded={leadSearchOpen}
                      aria-controls="rota-new-lead-suggestions"
                      role="combobox"
                      onChange={(e) => {
                        setLeadQuery(e.target.value);
                        setLeadSearchOpen(true);
                        if (!e.target.value.trim()) setLeadId("");
                      }}
                      onFocus={() => {
                        setLeadComboUnlocked(true);
                        setLeadSearchOpen(true);
                      }}
                      onBlur={() => {
                        window.setTimeout(() => setLeadSearchOpen(false), 120);
                      }}
                      placeholder="Digite o nome da empresa ou do lead"
                      className="pl-9"
                    />
                  {leadSearchOpen ? (
                    <div
                      id="rota-new-lead-suggestions"
                      className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-background shadow-lg"
                      role="listbox"
                    >
                      {leadSuggestions.length > 0 ? (
                        <div className="max-h-64 overflow-y-auto py-1">
                          {leadSuggestions.map((lead) => (
                            <button
                              key={lead.id}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setLeadId(lead.id);
                                setLeadQuery(formatLeadLabel(lead));
                                setLeadSearchOpen(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-muted/60"
                            >
                              <span className="block font-medium">{lead.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {lead.company}
                                {lead.email ? ` · ${lead.email}` : ""}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          Nenhum lead encontrado para essa busca.
                        </p>
                      )}
                      <div className="border-t border-border/70 p-2">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={openCreateLeadDialog}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-muted/60"
                        >
                          <UserPlus className="size-4 text-brand" aria-hidden />
                          Adicionar novo lead
                        </button>
                      </div>
                    </div>
                  ) : null}
                  </div>
                </form>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rota-new-website">Site da empresa</Label>
                <Input
                  id="rota-new-website"
                  name="rota_new_website_url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://site.com.br"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rota-new-instagram">Instagram</Label>
                <Input
                  id="rota-new-instagram"
                  name="rota_new_instagram"
                  value={instagramUrl}
                  onChange={(e) => setInstagramUrl(e.target.value)}
                  placeholder="https://instagram.com/empresa ou @empresa"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rota-new-services">Serviços oferecidos (opcional)</Label>
                <Textarea
                  id="rota-new-services"
                  name="rota_new_services"
                  value={servicesOffered}
                  onChange={(e) => setServicesOffered(e.target.value)}
                  placeholder="Se vazio, a IA tenta inferir pelo site e Instagram."
                  className="min-h-[90px]"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rota-new-objective">Objetivo (opcional)</Label>
                <Textarea
                  id="rota-new-objective"
                  name="rota_new_objective"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="Se vazio, a IA sugere objetivos e gargalos com base na análise."
                  className="min-h-[90px]"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                />
              </div>

              <details className="group rounded-xl border border-border bg-muted/20">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                  <span>
                    Direcionamento da IA nesta rota
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      Começa igual às configurações salvas; altere só para este cliente.
                    </span>
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-4 border-t border-border px-3 pb-3 pt-3">
                  {aiSettingsLoading ? (
                    <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Carregando opções de IA…
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Exigência nas notas</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {SCORING_OPTIONS.map((opt) => {
                            const sel = aiScoringStrictness === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setAiScoringStrictness(opt.id)}
                                className={cn(
                                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                                  scoringCompactClass(opt.id, sel),
                                )}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Diretrizes da IA</Label>
                        <Textarea
                          value={aiBasePromptGuidelines}
                          onChange={(e) =>
                            setAiBasePromptGuidelines(e.target.value.slice(0, MAX_AI_GUIDELINES_ROUTE))
                          }
                          placeholder="Instruções extras só para esta geração…"
                          className="min-h-[64px] resize-y text-sm"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          {aiBasePromptGuidelines.length}/{MAX_AI_GUIDELINES_ROUTE} caracteres
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Canais digitais recomendados</Label>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setAiChannelPolicy("open")}
                            className={cn(
                              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                              aiChannelPolicy === "open"
                                ? "border-primary/50 bg-primary/10 text-foreground"
                                : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                            )}
                          >
                            Livre
                          </button>
                          <button
                            type="button"
                            onClick={() => setAiChannelPolicy("restricted")}
                            className={cn(
                              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                              aiChannelPolicy === "restricted"
                                ? "border-brand/50 bg-brand/10 text-foreground"
                                : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                            )}
                          >
                            Só selecionados
                          </button>
                        </div>
                        {aiChannelPolicy === "open" ? (
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <span className="text-[11px] text-muted-foreground">Quantidade:</span>
                            <Select
                              value={String(aiOpenChannelCount)}
                              onValueChange={(v) =>
                                setAiOpenChannelCount(sanitizeAiOpenRecommendedChannelCount(Number(v)))
                              }
                            >
                              <SelectTrigger size="sm" className="w-[130px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                                  <SelectItem key={n} value={String(n)} className="text-xs">
                                    {n} canais
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                        <div className="max-h-28 overflow-y-auto rounded-md border border-border/80 bg-background/50 px-2 py-1.5">
                          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                            {AI_RECOMMENDED_CHANNEL_OPTIONS.map((opt) => (
                              <label
                                key={opt.id}
                                className={cn(
                                  "flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs",
                                  aiChannelPolicy !== "restricted" && "pointer-events-none opacity-45",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="size-3.5"
                                  checked={aiChannelIds.includes(opt.id)}
                                  disabled={aiChannelPolicy !== "restricted"}
                                  onChange={() => toggleAiChannel(opt.id)}
                                />
                                <span>{opt.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Serviços da agência (foco)</Label>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setAiServicesPolicy("open")}
                            className={cn(
                              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                              aiServicesPolicy === "open"
                                ? "border-primary/50 bg-primary/10 text-foreground"
                                : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                            )}
                          >
                            Livre
                          </button>
                          <button
                            type="button"
                            onClick={() => setAiServicesPolicy("restricted")}
                            className={cn(
                              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                              aiServicesPolicy === "restricted"
                                ? "border-emerald-600/40 bg-emerald-500/10 text-foreground"
                                : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                            )}
                          >
                            Só selecionados
                          </button>
                        </div>
                        <div className="max-h-28 overflow-y-auto rounded-md border border-border/80 bg-background/50 px-2 py-1.5">
                          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                            {AI_AGENCY_SERVICE_OPTIONS.map((opt) => (
                              <label
                                key={opt.id}
                                className={cn(
                                  "flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs",
                                  aiServicesPolicy !== "restricted" && "pointer-events-none opacity-45",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="size-3.5"
                                  checked={aiServiceIds.includes(opt.id)}
                                  disabled={aiServicesPolicy !== "restricted"}
                                  onChange={() => toggleAiService(opt.id)}
                                />
                                <span>{opt.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-2 text-xs",
                            aiServicesPolicy !== "restricted" && "pointer-events-none opacity-45",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="size-3.5"
                            checked={aiCustomServicesOpen}
                            disabled={aiServicesPolicy !== "restricted"}
                            onChange={(e) => setAiCustomServicesOpen(e.target.checked)}
                          />
                          Outros serviços (texto livre, um por linha)
                        </label>
                        {aiServicesPolicy === "restricted" && aiCustomServicesOpen ? (
                          <Textarea
                            value={aiCustomServicesText}
                            onChange={(e) => setAiCustomServicesText(e.target.value)}
                            placeholder={`Ex.: motion, agente de IA (máx. ${MAX_CUSTOM_SERVICE_LABELS} itens)`}
                            className="min-h-[52px] text-xs"
                          />
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              </details>
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
              size="lg"
              onClick={handleGenerate}
              disabled={saving || loadingLeads || !leadId || aiSettingsLoading}
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

      <Dialog open={isLeadDialogOpen} onOpenChange={setIsLeadDialogOpen}>
        <DialogContent
          showCloseButton
          className={cn(
            "max-h-[min(92vh,820px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-y-auto overflow-x-hidden border-white/10 bg-zinc-950 p-0 text-zinc-100 shadow-2xl sm:max-w-xl md:max-w-[36rem]",
            "rounded-2xl ring-1 ring-white/10",
          )}
        >
          <div className="relative border-b border-white/[0.06] bg-white/[0.015] px-6 pb-5 pt-6 pr-14 sm:px-8 sm:pb-6 sm:pt-7 sm:pr-16">
            <DialogHeader className="gap-1.5 space-y-0 text-left">
              <DialogTitle className="font-heading text-lg font-semibold tracking-tight text-white sm:text-xl">
                Novo lead
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed text-zinc-500 sm:text-sm">
                Preencha os dados básicos para criar o contacto e acompanhar o funil na Rota Digital.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-6 px-6 py-6 sm:px-8 sm:py-7">
            <section className="space-y-3.5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <div className="space-y-2">
                  <Label htmlFor="rota-dialog-lead-name" className="text-xs font-medium text-zinc-500">
                    Nome completo <span className="text-red-400/90">*</span>
                  </Label>
                  <Input
                    id="rota-dialog-lead-name"
                    value={newLeadName}
                    onChange={(e) => setNewLeadName(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="Ex.: João Silva"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rota-dialog-lead-company" className="text-xs font-medium text-zinc-500">
                    Empresa <span className="text-red-400/90">*</span>
                  </Label>
                  <Input
                    id="rota-dialog-lead-company"
                    value={newLeadCompany}
                    onChange={(e) => setNewLeadCompany(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="Ex.: Tech Solutions"
                    autoComplete="organization"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3.5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <div className="space-y-2">
                  <Label htmlFor="rota-dialog-lead-email" className="text-xs font-medium text-zinc-500">
                    E-mail <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <Input
                    id="rota-dialog-lead-email"
                    type="email"
                    value={newLeadEmail}
                    onChange={(e) => setNewLeadEmail(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="nome@empresa.com"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rota-dialog-lead-phone" className="text-xs font-medium text-zinc-500">
                    Telefone / WhatsApp <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <div className="relative">
                    <Phone
                      className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600"
                      aria-hidden
                    />
                    <Input
                      id="rota-dialog-lead-phone"
                      type="tel"
                      value={newLeadPhone}
                      onChange={(e) => setNewLeadPhone(formatPhoneBr(e.target.value))}
                      className="h-10 rounded-md border-white/10 bg-white/[0.04] pl-9 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                      placeholder="(11) 99999-9999"
                      autoComplete="tel"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-3.5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <div className="space-y-2">
                  <Label htmlFor="rota-dialog-lead-website" className="text-xs font-medium text-zinc-500">
                    Site da empresa <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <Input
                    id="rota-dialog-lead-website"
                    type="url"
                    value={newLeadWebsite}
                    onChange={(e) => setNewLeadWebsite(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="https://empresa.com.br"
                    autoComplete="url"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rota-dialog-lead-instagram" className="text-xs font-medium text-zinc-500">
                    Instagram <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <Input
                    id="rota-dialog-lead-instagram"
                    value={newLeadInstagram}
                    onChange={(e) => setNewLeadInstagram(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="https://instagram.com/empresa ou @empresa"
                    autoComplete="off"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3.5">
              <div className="space-y-2">
                <Label htmlFor="rota-dialog-lead-status" className="text-xs font-medium text-zinc-500">
                  Status atual
                </Label>
                <Select
                  value={newLeadStatus}
                  onValueChange={(value) => {
                    if (value) setNewLeadStatus(value as LeadStatus);
                  }}
                >
                  <SelectTrigger
                    id="rota-dialog-lead-status"
                    className="h-10 w-full rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 focus-visible:border-brand/45 dark:hover:bg-white/[0.06]"
                  >
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent sideOffset={8}>
                    {LEAD_STATUSES.map((statusOpt) => (
                      <SelectItem
                        key={statusOpt}
                        value={statusOpt}
                        disabled={!isLeadStatusSelectable(statusOpt, false)}
                      >
                        {statusOpt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            {newLeadError ? (
              <div
                role="alert"
                className="rounded-md border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-sm font-medium leading-relaxed text-red-300"
              >
                {newLeadError}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] bg-white/[0.02] px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-8 sm:py-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsLeadDialogOpen(false)}
              disabled={newLeadSaving}
              className="h-10 rounded-md text-zinc-400 hover:bg-white/5 hover:text-zinc-200 sm:min-w-[7rem]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="cta"
              size="lg"
              onClick={() => void handleCreateLead()}
              disabled={newLeadSaving}
              className="min-w-[10rem] gap-2"
            >
              {newLeadSaving ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
              {newLeadSaving ? "A guardar…" : "Salvar lead"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

