"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Briefcase, ListTree, Loader2, Scale } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { getUserAiPromptSettings, saveUserAiPromptSettings } from "@/lib/user-settings";
import type {
  AiRecommendedChannelsPolicy,
  AiScoringStrictness,
  AiServicesFocusPolicy,
} from "@/types/user-settings";
import { sanitizeAiScoringStrictness } from "@/lib/ai-scoring-strictness-prompt";
import { AI_RECOMMENDED_CHANNEL_OPTIONS } from "@/lib/ai-recommended-channel-options";
import {
  AI_AGENCY_SERVICE_OPTIONS,
  MAX_CUSTOM_SERVICE_LABEL_LEN,
  MAX_CUSTOM_SERVICE_LABELS,
  parseCustomServiceLabelsFromMultiline,
} from "@/lib/ai-agency-services";
import { cn } from "@/lib/utils";

const MAX_GUIDELINES_LENGTH = 3000;

const SCORING_STRICTNESS_OPTIONS: { id: AiScoringStrictness; label: string }[] = [
  { id: "free", label: "Livre" },
  { id: "low", label: "Baixa" },
  { id: "medium", label: "Média" },
  { id: "high", label: "Alta" },
];

function scoringStrictnessSelectedClasses(id: AiScoringStrictness): string {
  switch (id) {
    case "free":
      return "border-border bg-muted text-foreground shadow-sm ring-1 ring-border dark:border-white/35 dark:bg-white/[0.12] dark:text-white dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] dark:ring-white/25";
    case "low":
      return "border-emerald-600/45 bg-emerald-500/12 text-emerald-950 ring-1 ring-emerald-600/30 dark:border-emerald-500/50 dark:bg-emerald-500/15 dark:text-white dark:ring-emerald-500/25";
    case "medium":
      return "border-amber-600/45 bg-amber-500/12 text-amber-950 ring-1 ring-amber-600/30 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-white dark:ring-amber-500/25";
    case "high":
      return "border-red-600/45 bg-red-500/12 text-red-950 ring-1 ring-red-600/30 dark:border-red-500/50 dark:bg-red-500/15 dark:text-white dark:ring-red-500/25";
  }
}

function policyOpenSelectedClasses(): string {
  return "border-border bg-muted text-foreground shadow-sm ring-1 ring-border dark:border-white/30 dark:bg-white/[0.08] dark:text-zinc-100 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] dark:ring-white/20";
}

function policyUnselectedClasses(): string {
  return "border-border bg-background text-muted-foreground hover:border-input hover:bg-muted dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400 dark:hover:border-white/15 dark:hover:bg-white/[0.06]";
}

/** Indicador de seleção no canto do botão: identidade (índigo) ou neutro. */
function SelectedBadge({ variant }: { variant: "brand" | "neutral" }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute right-2.5 top-2.5 z-10 h-2 w-2 rounded-full sm:right-3 sm:top-3",
        variant === "brand"
          ? "bg-indigo-500 ring-2 ring-indigo-500/35 dark:bg-indigo-400 dark:ring-indigo-400/30"
          : "bg-foreground/35 ring-2 ring-foreground/15 dark:bg-zinc-300/90 dark:ring-white/10",
      )}
    />
  );
}

export function AiPromptSettingsForm() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guidelines, setGuidelines] = useState("");
  const [channelPolicy, setChannelPolicy] = useState<AiRecommendedChannelsPolicy>("open");
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [servicesPolicy, setServicesPolicy] = useState<AiServicesFocusPolicy>("open");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [servicesOthersEnabled, setServicesOthersEnabled] = useState(false);
  const [servicesOthersText, setServicesOthersText] = useState("");
  const [scoringStrictness, setScoringStrictness] = useState<AiScoringStrictness>("free");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getUserAiPromptSettings(user.uid);
      setGuidelines((data?.aiBasePromptGuidelines || "").trim());
      setChannelPolicy(data?.aiRecommendedChannelsPolicy === "restricted" ? "restricted" : "open");
      setChannelIds(
        data?.aiRecommendedChannelIds?.length ? [...data.aiRecommendedChannelIds] : []
      );
      setServicesPolicy(data?.aiServicesFocusPolicy === "restricted" ? "restricted" : "open");
      setServiceIds(data?.aiServiceOfferingIds?.length ? [...data.aiServiceOfferingIds] : []);
      const customServ = data?.aiCustomServiceLabels?.length ? [...data.aiCustomServiceLabels] : [];
      setServicesOthersText(customServ.join("\n"));
      setServicesOthersEnabled(customServ.length > 0);
      setScoringStrictness(sanitizeAiScoringStrictness(data?.aiScoringStrictness));
    } catch (e) {
      console.error(e);
      setError("Não foi possível carregar as configurações de IA.");
      setGuidelines("");
      setChannelPolicy("open");
      setChannelIds([]);
      setServicesPolicy("open");
      setServiceIds([]);
      setServicesOthersEnabled(false);
      setServicesOthersText("");
      setScoringStrictness("free");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleChannel = (id: string) => {
    setChannelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleService = (id: string) => {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    if (!user) return;
    const trimmed = guidelines.trim();
    if (trimmed.length > MAX_GUIDELINES_LENGTH) {
      setError(`Limite de ${MAX_GUIDELINES_LENGTH} caracteres nas diretrizes.`);
      return;
    }
    if (channelPolicy === "restricted" && channelIds.length === 0) {
      setError("Com política restrita em canais, marque ao menos um canal da lista ou escolha “livre”.");
      return;
    }
    const parsedServicesCustom =
      servicesPolicy === "restricted" && servicesOthersEnabled
        ? parseCustomServiceLabelsFromMultiline(servicesOthersText)
        : [];
    if (servicesPolicy === "restricted" && serviceIds.length === 0 && parsedServicesCustom.length === 0) {
      setError(
        "Com foco restrito em serviços, marque ao menos um serviço da lista, use “Outros serviços” com texto, ou escolha “livre”.",
      );
      return;
    }
    if (servicesPolicy === "restricted" && servicesOthersEnabled && parsedServicesCustom.length === 0) {
      setError("Preencha os serviços personalizados em “Outros” ou desmarque a opção.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await saveUserAiPromptSettings(user.uid, {
        aiBasePromptGuidelines: trimmed,
        aiRecommendedChannelsPolicy: channelPolicy,
        aiRecommendedChannelIds: channelPolicy === "restricted" ? channelIds : [],
        aiServicesFocusPolicy: servicesPolicy,
        aiServiceOfferingIds: servicesPolicy === "restricted" ? serviceIds : [],
        aiCustomServiceLabels: servicesPolicy === "restricted" ? parsedServicesCustom : [],
        aiScoringStrictness: scoringStrictness,
      });
      setGuidelines(trimmed);
      if (channelPolicy === "open") setChannelIds([]);
      if (servicesPolicy === "open") {
        setServiceIds([]);
        setServicesOthersText("");
        setServicesOthersEnabled(false);
      } else if (!servicesOthersEnabled) {
        setServicesOthersText("");
      } else {
        setServicesOthersText(parsedServicesCustom.join("\n"));
      }
      setSavedAt(Date.now());
    } catch (e) {
      console.error(e);
      setSavedAt(null);
      setError("Não foi possível salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-6 py-14 text-sm text-muted-foreground dark:border-white/5 dark:bg-white/[0.02]">
        <Loader2 className="size-5 animate-spin shrink-0 text-indigo-400" aria-hidden />
        Carregando configurações...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card shadow-xl overflow-hidden dark:border-white/5 dark:bg-white/[0.02]">
        <CardHeader className="space-y-2 pb-4 border-b border-border dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
              <Scale className="size-4 text-indigo-400" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-foreground dark:text-white">Exigência nas notas</CardTitle>
              <CardDescription className="text-sm text-muted-foreground leading-relaxed">
                Define como a IA calibra as pontuações do diagnóstico e da maturidade digital no relatório.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-nowrap gap-2">
            {SCORING_STRICTNESS_OPTIONS.map((opt) => {
              const selected = scoringStrictness === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setScoringStrictness(opt.id)}
                  className={cn(
                    "relative flex min-h-12 flex-1 items-center justify-center rounded-xl border px-2 py-2.5 text-center transition-all sm:min-h-[3.25rem] sm:px-3 sm:py-3",
                    selected
                      ? scoringStrictnessSelectedClasses(opt.id)
                      : policyUnselectedClasses(),
                  )}
                >
                  {selected ? (
                    <SelectedBadge variant={opt.id === "free" ? "brand" : "neutral"} />
                  ) : null}
                  <span className="text-xs font-semibold leading-tight sm:text-sm">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card shadow-xl overflow-hidden dark:border-white/5 dark:bg-white/[0.02]">
        <CardHeader className="space-y-2 pb-4 border-b border-border dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
              <Bot className="size-4 text-indigo-400" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-foreground dark:text-white">Diretrizes da IA</CardTitle>
              <CardDescription className="text-sm text-muted-foreground leading-relaxed">
                Texto extra no prompt em toda geração. As regras de canais e de serviços abaixo também
                entram automaticamente.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label
              htmlFor="ai-prompt-guidelines"
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              Prompt base customizado
            </Label>
            <Textarea
              id="ai-prompt-guidelines"
              value={guidelines}
              onChange={(e) => setGuidelines(e.target.value)}
              placeholder="Ex.: priorize tom consultivo, foco em clínicas, evitar termos em inglês..."
              className="min-h-[180px] rounded-xl border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-indigo-500/50 focus-visible:ring-indigo-500/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            />
            <p className="text-xs text-muted-foreground">
              {guidelines.length}/{MAX_GUIDELINES_LENGTH} caracteres.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card shadow-xl overflow-hidden dark:border-white/5 dark:bg-white/[0.02]">
        <CardHeader className="space-y-2 pb-4 border-b border-border dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
              <ListTree className="size-4 text-indigo-400" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-foreground dark:text-white">Canais digitais recomendados</CardTitle>
              <CardDescription className="text-sm text-muted-foreground leading-relaxed">
                Apenas canais de mídia e distribuição (onde o cliente investe presença). Lista fixa, sem
                campo livre neste bloco.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Política de canais
            </Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setChannelPolicy("open")}
                className={cn(
                  "relative rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-all",
                  channelPolicy === "open" && "pr-[3.35rem] sm:pr-[3.85rem]",
                  channelPolicy === "open" ? policyOpenSelectedClasses() : policyUnselectedClasses(),
                )}
              >
                {channelPolicy === "open" ? <SelectedBadge variant="brand" /> : null}
                Livre
                {channelPolicy === "open" ? null : (
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    A IA sugere os canais que fizerem sentido no relatório.
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setChannelPolicy("restricted")}
                className={cn(
                  "relative rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-all",
                  channelPolicy === "restricted" && "pr-[3.35rem] sm:pr-[3.85rem]",
                  channelPolicy === "restricted"
                    ? "border-indigo-500/50 bg-indigo-500/15 text-white ring-1 ring-indigo-500/25"
                    : policyUnselectedClasses(),
                )}
              >
                {channelPolicy === "restricted" ? <SelectedBadge variant="neutral" /> : null}
                Somente selecionados
                {channelPolicy === "restricted" ? null : (
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    Só estes canais entram em “Canais recomendados” no relatório.
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Canais permitidos
            </Label>
            <p className="text-xs text-muted-foreground">
              {channelPolicy === "restricted"
                ? "Marque os canais que a agência realmente opera para o cliente."
                : "Ative “Somente selecionados” para marcar."}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {AI_RECOMMENDED_CHANNEL_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                    channelPolicy === "restricted" && channelIds.includes(opt.id)
                      ? "border-indigo-500/40 bg-indigo-500/10"
                      : "border-border bg-muted/20 dark:border-white/10 dark:bg-white/[0.02]",
                    channelPolicy !== "restricted" && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 rounded border-input bg-background text-indigo-600 focus:ring-indigo-500/30 dark:border-white/20 dark:bg-zinc-900 dark:text-indigo-500"
                    checked={channelIds.includes(opt.id)}
                    disabled={channelPolicy !== "restricted"}
                    onChange={() => toggleChannel(opt.id)}
                  />
                  <span className="text-sm text-foreground dark:text-zinc-200">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card shadow-xl overflow-hidden dark:border-white/5 dark:bg-white/[0.02]">
        <CardHeader className="space-y-2 pb-4 border-b border-border dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
              <Briefcase className="size-4 text-indigo-400" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-foreground dark:text-white">Serviços da agência (foco)</CardTitle>
              <CardDescription className="text-sm text-muted-foreground leading-relaxed">
                O que a agência entrega como serviço (tráfego, vídeo, identidade, etc.). A análise do site
                e do Instagram segue completa; o foco aqui é alinhar oportunidades e planos de ação ao que
                vocês vendem.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Política de serviços
            </Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setServicesPolicy("open")}
                className={cn(
                  "relative rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-all",
                  servicesPolicy === "open" && "pr-[3.35rem] sm:pr-[3.85rem]",
                  servicesPolicy === "open" ? policyOpenSelectedClasses() : policyUnselectedClasses(),
                )}
              >
                {servicesPolicy === "open" ? <SelectedBadge variant="brand" /> : null}
                Livre
                {servicesPolicy === "open" ? null : (
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    A IA sugere entregas e ações sem amarrar à sua carta de serviços.
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setServicesPolicy("restricted")}
                className={cn(
                  "relative rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-all",
                  servicesPolicy === "restricted" && "pr-[3.35rem] sm:pr-[3.85rem]",
                  servicesPolicy === "restricted"
                    ? "border-emerald-600/45 bg-emerald-500/12 text-emerald-950 ring-1 ring-emerald-600/30 dark:border-emerald-500/50 dark:bg-emerald-500/15 dark:text-white dark:ring-emerald-500/25"
                    : policyUnselectedClasses(),
                )}
              >
                {servicesPolicy === "restricted" ? <SelectedBadge variant="neutral" /> : null}
                Somente selecionados
                {servicesPolicy === "restricted" ? null : (
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    Oportunidades e planos de ação priorizam só estes serviços.
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Serviços que vocês oferecem
            </Label>
            <p className="text-xs text-muted-foreground">
              {servicesPolicy === "restricted"
                ? "Marque a lista e/ou acrescente itens em “Outros serviços”."
                : "Ative “Somente selecionados” para configurar."}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {AI_AGENCY_SERVICE_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                    servicesPolicy === "restricted" && serviceIds.includes(opt.id)
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-white/10 bg-white/[0.02]",
                    servicesPolicy !== "restricted" && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 rounded border-input bg-background text-emerald-600 focus:ring-emerald-500/30 dark:border-white/20 dark:bg-zinc-900 dark:text-emerald-500"
                    checked={serviceIds.includes(opt.id)}
                    disabled={servicesPolicy !== "restricted"}
                    onChange={() => toggleService(opt.id)}
                  />
                  <span className="text-sm text-zinc-200">{opt.label}</span>
                </label>
              ))}
            </div>

            <div className="space-y-2 pt-1">
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                  servicesPolicy === "restricted" && servicesOthersEnabled
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-border bg-muted/20 dark:border-white/10 dark:bg-white/[0.02]",
                  servicesPolicy !== "restricted" && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 rounded border-input bg-background text-emerald-600 focus:ring-emerald-500/30 dark:border-white/20 dark:bg-zinc-900 dark:text-emerald-500"
                  checked={servicesOthersEnabled}
                  disabled={servicesPolicy !== "restricted"}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setServicesOthersEnabled(on);
                    if (!on) setServicesOthersText("");
                  }}
                />
                <span className="text-sm font-medium text-zinc-200">
                  Outros serviços (personalizar)
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Ex.: agente de IA no WhatsApp, motion 3D, podcast.
                  </span>
                </span>
              </label>

              {servicesPolicy === "restricted" && servicesOthersEnabled ? (
                <div className="space-y-2 pl-1 sm:pl-2">
                  <Textarea
                    id="ai-custom-services"
                    value={servicesOthersText}
                    onChange={(e) => setServicesOthersText(e.target.value)}
                    placeholder={
                      "Um item por linha (ou separados por vírgula):\nAutomação comercial no WhatsApp\nCriação de agente de IA"
                    }
                    className="min-h-[120px] rounded-xl border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                  />
                  <p className="text-xs text-muted-foreground">
                    Até {MAX_CUSTOM_SERVICE_LABELS} itens, até {MAX_CUSTOM_SERVICE_LABEL_LEN} caracteres
                    cada.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {savedAt && !error ? (
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Configurações de IA salvas.</p>
      ) : null}

      <Button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="gap-2 rounded-xl bg-indigo-600 font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500"
      >
        {saving ? (
          <>
            <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
            Salvando...
          </>
        ) : (
          "Salvar configurações de IA"
        )}
      </Button>
    </div>
  );
}
