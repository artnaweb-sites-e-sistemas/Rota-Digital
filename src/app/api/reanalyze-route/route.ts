import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

import type { DiagnosticScore, RotaDigitalReport } from "@/types/report";
import type { AiRecommendedChannelsPolicy, AiServicesFocusPolicy } from "@/types/user-settings";
import {
  buildRecommendedChannelsPolicyPromptSection,
  sanitizeAiOpenRecommendedChannelCount,
} from "@/lib/ai-recommended-channels-prompt";
import { normalizeRecommendedChannels } from "@/lib/recommended-channels-normalize";
import { buildServicesFocusPromptSection } from "@/lib/ai-services-focus-prompt";
import {
  buildScoringStrictnessPromptSection,
  sanitizeAiScoringStrictness,
} from "@/lib/ai-scoring-strictness-prompt";
import { sanitizeAiRecommendedChannelIds } from "@/lib/ai-recommended-channel-options";
import {
  sanitizeAiCustomServiceLabels,
  sanitizeAiServiceOfferingIds,
} from "@/lib/ai-agency-services";
import { getUserAiPromptSettingsAdmin } from "@/lib/user-settings-admin";
import { buildReportCopyVoicePromptSection } from "@/lib/report-copy-voice-prompt";

type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
};

type ModelCostPer1M = {
  inputUsd: number;
  outputUsd: number;
};

const MODEL_COST_PER_1M_USD: Record<string, ModelCostPer1M> = {
  "gemini-2.5-flash": { inputUsd: 0.15, outputUsd: 0.6 },
  "gemini-2.0-flash": { inputUsd: 0.1, outputUsd: 0.4 },
  "gemini-2.0-flash-lite": { inputUsd: 0.075, outputUsd: 0.3 },
};

const USD_TO_BRL_ESTIMATE = 5.2;

function estimateCostUsdFromUsage(modelName: string, usage?: GeminiUsageMetadata): number | undefined {
  if (!usage) return undefined;
  const pricing = MODEL_COST_PER_1M_USD[modelName];
  if (!pricing) return undefined;
  const promptTokens = Number(usage.promptTokenCount || 0);
  const outputTokens = Number(usage.candidatesTokenCount || 0);
  const estimated =
    (promptTokens / 1_000_000) * pricing.inputUsd +
    (outputTokens / 1_000_000) * pricing.outputUsd;
  return Number.isFinite(estimated) ? Number(estimated.toFixed(8)) : undefined;
}

function parseModelJson(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fence) return JSON.parse(fence[1].trim()) as Record<string, unknown>;
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("Resposta da IA não é um JSON válido.");
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Chave da API Gemini não configurada." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const report = body.report as RotaDigitalReport | undefined;
    const observation = String(body.observation || "").trim();

    if (!report) {
      return NextResponse.json({ error: "Relatório ausente." }, { status: 400 });
    }
    if (!observation) {
      return NextResponse.json(
        { error: "Informe uma observação para reanálise." },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"];

    const storedAi = await getUserAiPromptSettingsAdmin(report.userId);
    let channelPolicy: AiRecommendedChannelsPolicy =
      storedAi?.aiRecommendedChannelsPolicy === "restricted" ? "restricted" : "open";
    const channelIds = sanitizeAiRecommendedChannelIds(storedAi?.aiRecommendedChannelIds);
    if (channelPolicy === "restricted" && channelIds.length === 0) {
      channelPolicy = "open";
    }
    const openChannelCount = sanitizeAiOpenRecommendedChannelCount(
      storedAi?.aiOpenRecommendedChannelCount,
    );
    const channelsPolicyBlock = `${buildRecommendedChannelsPolicyPromptSection(
      channelPolicy,
      channelIds,
      openChannelCount,
    )}\n\n`;

    let servicesPolicy: AiServicesFocusPolicy =
      storedAi?.aiServicesFocusPolicy === "restricted" ? "restricted" : "open";
    const serviceOfferingIds = sanitizeAiServiceOfferingIds(storedAi?.aiServiceOfferingIds);
    const customServiceLabels = sanitizeAiCustomServiceLabels(storedAi?.aiCustomServiceLabels);
    if (servicesPolicy === "restricted" && serviceOfferingIds.length === 0 && customServiceLabels.length === 0) {
      servicesPolicy = "open";
    }
    const servicesFocusBlock = `${buildServicesFocusPromptSection(servicesPolicy, serviceOfferingIds, customServiceLabels)}\n\n`;
    const scoringStrictness = sanitizeAiScoringStrictness(storedAi?.aiScoringStrictness);
    const scoringStrictnessBlock = `${buildScoringStrictnessPromptSection(scoringStrictness)}\n\n`;

    const prompt = `Você vai reanalisar e ajustar um relatório já existente.

${channelsPolicyBlock}${servicesFocusBlock}${scoringStrictnessBlock}${buildReportCopyVoicePromptSection()}
Regra principal de escrita:
- Use linguagem simples, direta e fácil de entender; cumpra o bloco **Voz do relatório** em todos os textos atualizados.
- Se website/instagram estiver vazio, quebrado ou genérico, declare isso claramente e ajuste a nota.
- Escreva como alguém explicando o cenário para um cliente comum, não como um consultor tentando impressionar.
- Evite tom excessivamente analítico, acadêmico ou cheio de jargão.
- Evite frases infladas como "presença digital robusta", "sinergia entre canais", "alavancar resultados", "ecossistema digital" e parecidas.
- Prefira frases concretas e humanas, como "a proposta está clara", "o perfil passa confiança", "o CTA pode melhorar", "faltam provas visuais".
- Não repita a mesma ideia em vários campos.
- Se existir o campo report.evidences.instagramBioLinkResolvedUrl, use esse valor como verdade para comentar o link da bio.
- Se o destino final do link da bio for WhatsApp, diga isso claramente e não invente Linktree com várias opções.

Tom por campo:
- "executiveSummary": **um único parágrafo corrido** (sem \\n\\n). **Meta: no máximo ~420 caracteres**, 2 a 4 frases: motivo da nota de maturidade de forma objetiva; não repita strengths/diagnosticScores nem liste todos os canais.
- "companyProfile": texto curto, direto e fácil de entender.
- "strengths", "weaknesses", "opportunities", "quickWins", "longTermActions", "nextSteps": itens curtos e objetivos.
- "recommendedChannels.description": explique de forma comercial simples por que o canal faz sentido.
- "recommendedChannels.actions": ações práticas e diretas.
- "diagnosticScores.comment": comentário específico, natural e acionável. Se a nota for < 10, deixe claro o que falta para 10/10 **no máximo uma vez** no texto (não repita "Para chegar a 10/10" / "Para chegar a 10" em cada parágrafo).
- Nunca escreva frases vagas como "há espaço para melhorar" ou "há espaço para otimizações técnicas" sem explicar exatamente o que deve ser feito.
- Em "Identidade Visual", comente harmonia visual, paleta, contraste, hierarquia, espaçamento, alinhamento, legibilidade e coerência entre site e Instagram.
- Se o texto ficar longo em "diagnosticScores.comment" ou "recommendedChannels.description", divida em 2 parágrafos curtos.
- "websiteResearchNote" e "instagramResearchNote": no máximo 2 parágrafos cada (\\n\\n), texto corrido; em Instagram não comece com seguidores/posts e não transcreva a bio entre aspas — sintetize.

Observação do usuário:
${observation}

Relatório atual em JSON:
${JSON.stringify(report, null, 2)}

Retorne SOMENTE um JSON válido com os campos atualizados:
{
  "executiveSummary": "string — 1 parágrafo corrido, sem \\n\\n; preferencialmente ≤420 caracteres",
  "companyProfile": "string",
  "digitalMaturityLevel": "Iniciante" | "Intermediário" | "Avançado",
  "digitalMaturityScore": number (0 a 10),
  "strengths": ["string"],
  "weaknesses": ["string"],
  "opportunities": ["string"],
  "recommendedChannels": [
    { "name": "string", "priority": "Alta" | "Média" | "Baixa", "description": "string", "actions": ["string"] }
  ],
  "quickWins": ["string"],
  "longTermActions": ["string"],
  "estimatedTimelineMonths": number,
  "nextSteps": ["string"],
  "diagnosticScores": [
    {
      "topic": "string",
      "score": number,
      "comment": "string",
      "evidenceTitle": "string",
      "evidenceImageUrl": "string",
      "evidenceNote": "string"
    }
  ],
  "websiteResearchNote": "string",
  "instagramResearchNote": "string",
  "instagramBioExcerpt": "string",
  "researchNotes": "string (bloco Website (nota X/10): até 2 parágrafos internos \\n\\n; linha em branco; bloco Instagram (nota X/10): idem)",
  "proposalPageHtml": "string"
}`;

    let responseText = "";
    let selectedModelName = "";
    let selectedUsage: GeminiUsageMetadata | undefined;
    let lastError: unknown = null;

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: "v1" });
        const result = await model.generateContent(prompt);
        responseText = result.response.text();
        selectedModelName = modelName;
        selectedUsage = result.response.usageMetadata as GeminiUsageMetadata | undefined;
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!responseText) {
      throw new Error(
        `Nenhum modelo Gemini disponível para reanálise. Último erro: ${
          lastError instanceof Error ? lastError.message : "desconhecido"
        }`
      );
    }

    const aiData = parseModelJson(responseText);
    const normalizedScore = (() => {
      const raw = Number(aiData.digitalMaturityScore) || report.digitalMaturityScore || 0;
      const normalized = raw > 10 ? raw / 10 : raw;
      return Math.max(0, Math.min(10, Number(normalized.toFixed(1))));
    })();

    const diagnosticScores = Array.isArray(aiData.diagnosticScores)
      ? (aiData.diagnosticScores as DiagnosticScore[]).map((item) => ({
          topic: String(item.topic || "Tópico"),
          score: Math.max(0, Math.min(10, Number(item.score) || 0)),
          comment: String(item.comment || ""),
          evidenceTitle: item.evidenceTitle,
          evidenceImageUrl: item.evidenceImageUrl,
          evidenceNote: item.evidenceNote,
        }))
      : report.diagnosticScores || [];

    const reanalysisEstimatedCostUsd = estimateCostUsdFromUsage(selectedModelName, selectedUsage);
    const reanalysisEstimatedCostBrl =
      typeof reanalysisEstimatedCostUsd === "number"
        ? Number((reanalysisEstimatedCostUsd * USD_TO_BRL_ESTIMATE).toFixed(6))
        : undefined;
    const reanalysisTotalTokens = Number(selectedUsage?.totalTokenCount || 0) || 0;
    const previousReanalysis = report.aiUsage?.reanalysis || [];
    const nextReanalysisEntry = {
      model: selectedModelName || undefined,
      promptTokens: Number(selectedUsage?.promptTokenCount || 0) || undefined,
      candidateTokens: Number(selectedUsage?.candidatesTokenCount || 0) || undefined,
      totalTokens: reanalysisTotalTokens || undefined,
      estimatedCostUsd: reanalysisEstimatedCostUsd,
      estimatedCostBrl: reanalysisEstimatedCostBrl,
      createdAt: Date.now(),
    };
    const totalTokens =
      Number(report.aiUsage?.totalTokens || 0) + reanalysisTotalTokens;
    const totalEstimatedCostUsd =
      Number(report.aiUsage?.totalEstimatedCostUsd || 0) +
      Number(reanalysisEstimatedCostUsd || 0);
    const totalEstimatedCostBrl =
      Number(report.aiUsage?.totalEstimatedCostBrl || 0) +
      Number(reanalysisEstimatedCostBrl || 0);

    return NextResponse.json({
      report: {
        executiveSummary: String(aiData.executiveSummary || report.executiveSummary || ""),
        companyProfile: String(aiData.companyProfile || report.companyProfile || ""),
        digitalMaturityLevel:
          (aiData.digitalMaturityLevel as RotaDigitalReport["digitalMaturityLevel"]) ||
          report.digitalMaturityLevel,
        digitalMaturityScore: normalizedScore,
        strengths: (aiData.strengths as string[]) || report.strengths || [],
        weaknesses: (aiData.weaknesses as string[]) || report.weaknesses || [],
        opportunities: (aiData.opportunities as string[]) || report.opportunities || [],
        recommendedChannels: normalizeRecommendedChannels(
          aiData.recommendedChannels ?? report.recommendedChannels,
          channelPolicy,
          channelIds,
          channelPolicy === "open" ? openChannelCount : undefined,
        ),
        quickWins: (aiData.quickWins as string[]) || report.quickWins || [],
        longTermActions: (aiData.longTermActions as string[]) || report.longTermActions || [],
        estimatedTimelineMonths:
          Number(aiData.estimatedTimelineMonths) || report.estimatedTimelineMonths || 6,
        nextSteps: (aiData.nextSteps as string[]) || report.nextSteps || [],
        diagnosticScores,
        evidences: {
          ...(report.evidences || {}),
          instagramBioExcerpt:
            String(aiData.instagramBioExcerpt || report.evidences?.instagramBioExcerpt || ""),
          researchNotes: String(aiData.researchNotes || report.evidences?.researchNotes || ""),
        },
        proposalHtml:
          typeof aiData.proposalPageHtml === "string" && aiData.proposalPageHtml.trim()
            ? aiData.proposalPageHtml
            : report.proposalHtml,
        aiUsage: {
          generation: report.aiUsage?.generation,
          reanalysis: [...previousReanalysis, nextReanalysisEntry],
          totalTokens: totalTokens || undefined,
          totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(8)) || undefined,
          totalEstimatedCostBrl: Number(totalEstimatedCostBrl.toFixed(6)) || undefined,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json(
      { error: `Falha ao reanalisar Rota Digital: ${message}` },
      { status: 500 }
    );
  }
}

