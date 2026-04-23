import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { incrementCycleUsageAdmin, readCycleUsage } from "@/lib/cycle-usage";
import {
  ROTAS_ADD_ON_PACKS,
  resolveCycleStartMs,
  resolveQuotaLimit,
} from "@/lib/plan-quotas";
import { countReportsSinceAdmin } from "@/lib/reports-admin";
import type { DiagnosticScore, RotaDigitalReport } from "@/types/report";
import {
  type GeminiInlineImagePart,
  downloadImageAsInlinePart,
} from "@/lib/gemini-inline-image";
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
import { parseModelJson } from "@/lib/model-json-parse";
import { maturityFromDiagnosticScores } from "@/lib/maturity-from-diagnostics";

export const runtime = "nodejs";
/** Download das capturas guardadas + Gemini multimodal pode ultrapassar o default da Vercel. */
export const maxDuration = 120;

const GEMINI_REANALYZE_TIMEOUT_MS = 120_000;

async function withGeminiCallTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Tempo limite (${timeoutMs}ms) na chamada do Gemini.`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** URL de evidência: absoluta ou relativa à origem do pedido (ex.: `/api/image-proxy`). */
function absolutizeEvidenceUrl(origin: string, url?: string): string | undefined {
  const t = url?.trim();
  if (!t) return undefined;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("/")) return `${origin.replace(/\/$/, "")}${t}`;
  return undefined;
}

/**
 * Mesma ordem e rótulos que `buildGenerateContentInput` em `generate-route`:
 * anexa as capturas **já guardadas** no relatório (podem ter sido substituídas manualmente).
 */
function buildReanalyzeGenerateContentInput(
  promptText: string,
  options: {
    websiteImagePart?: GeminiInlineImagePart;
    instagramImagePart?: GeminiInlineImagePart;
    instagramBioLinkImagePart?: GeminiInlineImagePart;
  },
): string | Array<{ text: string } | GeminiInlineImagePart> {
  const parts: Array<{ text: string } | GeminiInlineImagePart> = [{ text: promptText }];
  if (options.websiteImagePart) {
    parts.push({
      text:
        "CAPTURA 1 (Website - página completa): use esta imagem como fonte principal para análise visual do site como um todo, incluindo estrutura da página, paleta, contraste, hierarquia, prova social e clareza de CTA. É a versão **atual** guardada no relatório (pode ter sido substituída depois da geração).",
    });
    parts.push(options.websiteImagePart);
  }
  if (options.instagramImagePart) {
    parts.push({
      text:
        "CAPTURA 2 (Instagram): esta é a captura **atual** do perfil guardada no relatório. ANALISE DETALHADAMENTE esta imagem. Extraia o que for legível (nome, bio, métricas, feed, link da bio, estética). É a versão que o utilizador vê hoje no painel (pode ter sido substituída manualmente).",
    });
    parts.push(options.instagramImagePart);
  }
  if (options.instagramBioLinkImagePart) {
    parts.push({
      text:
        "CAPTURA 3 (Destino do link da bio): página aberta após o link da bio — versão **atual** guardada no relatório. Use para validar clareza do destino e CTA.",
    });
    parts.push(options.instagramBioLinkImagePart);
  }
  return parts.length > 1 ? parts : promptText;
}

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
const DIAGNOSTIC_COMMENT_MAX_CHARS = 420;

function fitTextToMaxCharsPreferSentenceEnd(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  const w = t.slice(0, maxLen);
  const floor = Math.min(36, Math.max(20, Math.floor(maxLen * 0.32)));
  for (let i = w.length - 1; i >= floor; i--) {
    const ch = w[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    const next = i + 1 < w.length ? w[i + 1] : "";
    if (next === "" || /\s/.test(next)) {
      return w.slice(0, i + 1).trim();
    }
  }
  return w.replace(/\s+\S*$/, "").trim();
}

function clampDiagnosticComment(raw: string, maxChars: number): string {
  const s = raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]*\u2026[ \t]*$/g, "")
    .replace(/[ \t]*\.{3,}[ \t]*$/g, "")
    .trim();
  if (s.length <= maxChars) return s;
  const paras = s
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (paras.length >= 2) {
    const first = paras[0]!;
    let second = paras.slice(1).join(" ");
    const sep = "\n\n";
    const maxSecond = maxChars - first.length - sep.length;
    if (maxSecond >= 28) {
      if (second.length > maxSecond) {
        second = fitTextToMaxCharsPreferSentenceEnd(second, maxSecond);
      }
      const out = `${first}${sep}${second}`;
      if (out.length <= maxChars) return out;
    }
  }
  return fitTextToMaxCharsPreferSentenceEnd(s.replace(/\n+/g, " "), maxChars);
}

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

    const adminApp = getFirebaseAdminApp();
    if (!adminApp) {
      return NextResponse.json(
        { error: "Servidor sem Firebase Admin (`FIREBASE_SERVICE_ACCOUNT_JSON`)." },
        { status: 503 },
      );
    }
    const authHeader = req.headers.get("authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!bearerToken) {
      return NextResponse.json({ error: "Token ausente. Faça login novamente." }, { status: 401 });
    }
    let authedUid: string;
    try {
      const decoded = await getAuth(adminApp).verifyIdToken(bearerToken);
      authedUid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    if (authedUid !== String(report.userId ?? "")) {
      return NextResponse.json({ error: "Relatório não pertence a esta conta." }, { status: 403 });
    }

    const priorReanalyses = Array.isArray(report.aiUsage?.reanalysis)
      ? report.aiUsage!.reanalysis!.length
      : 0;
    const isFreeReanalysis = priorReanalyses < 1;
    let reanalysisChargeContext: {
      periodStartMs: number;
      docsUsed: number;
    } | null = null;
    if (!isFreeReanalysis) {
      const db = getFirestore(adminApp);
      const userSettingsSnap = await db.collection("userSettings").doc(authedUid).get();
      const userSettings = userSettingsSnap.exists
        ? (userSettingsSnap.data() as Record<string, unknown>)
        : {};
      const quota = resolveQuotaLimit(userSettings, "rotas");
      if (!quota.isUnlimited) {
        const periodStartMs = resolveCycleStartMs(userSettings, Date.now());
        const [docsUsed, counterUsed] = await Promise.all([
          countReportsSinceAdmin(authedUid, periodStartMs),
          Promise.resolve(readCycleUsage(userSettings, periodStartMs, "rotas")),
        ]);
        const usedThisCycle = Math.max(docsUsed, counterUsed);
        if (usedThisCycle >= quota.limit) {
          return NextResponse.json(
            {
              error:
                "Reanálises extras consomem 1 Rota Digital da cota, e seu ciclo já está esgotado.",
              code: "ROTAS_LIMIT_REACHED",
              plan: quota.plan,
              monthlyLimit: quota.limit,
              usedThisMonth: usedThisCycle,
              addOnPacks: ROTAS_ADD_ON_PACKS,
            },
            { status: 429 },
          );
        }
        reanalysisChargeContext = { periodStartMs, docsUsed };
      }
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
- "executiveSummary": **exatamente 2 parágrafos curtos** com \\n\\n. **Meta: no máximo ~520 caracteres no total**; 1º = leitura do digital; 2º = por que o **resultado global** (síntese das notas dos tópicos) faz sentido, sem listar cada tópico. Não repita strengths/diagnosticScores nem liste todos os canais.
- **Coerência de maturidade:** com "diagnosticScores" preenchido, "digitalMaturityScore" deve ser a **média aritmética** dos "score" (uma casa decimal) e "digitalMaturityLevel" coerente: **<4** Iniciante; **≥4 e <7** Intermediário; **≥7** Avançado. O servidor harmoniza; ainda assim mantenha o JSON alinhado.
- "companyProfile": texto curto, direto e fácil de entender.
- "strengths", "weaknesses", "opportunities", "quickWins", "longTermActions", "nextSteps": itens curtos e objetivos.
- "recommendedChannels.description": **exatamente 1 parágrafo curto** (sem \\n\\n); meta total ~160–300 caracteres (teto rígido 320); comercial, com detalhe deste caso (evite genérico).
- "recommendedChannels.actions": ações práticas e diretas.
- "diagnosticScores.comment": **exatamente 2 parágrafos curtos** com \\n\\n; meta **total ~220–380 caracteres** (teto rígido **420**); **preferência: 1 frase por parágrafo** (máximo 2). 1º = fato/evidência do tópico; 2º = uma prioridade ou passo claro. **Cada parágrafo termina com frase completa** (ponto final, exclamação ou interrogação); **proibido** reticências ("..." ou "…") ou frase cortada. Sem clichês nem repetir o mesmo contraste em todos. Se a nota for < 10, o que falta para 10/10 **no máximo uma vez**.
- Nunca escreva frases vagas como "há espaço para melhorar" ou "há espaço para otimizações técnicas" sem explicar exatamente o que deve ser feito.
- Em "Identidade Visual", comente harmonia visual, paleta, contraste, hierarquia, espaçamento, alinhamento, legibilidade e coerência entre site e Instagram.
- "websiteResearchNote" e "instagramResearchNote": **exatamente 2 parágrafos curtos cada** (\\n\\n); meta total ~520–780 caracteres por campo; em Instagram não comece com seguidores/posts e não transcreva a bio entre aspas — sintetize.

Evidências visuais (multimodal):
- Após este texto, quando o servidor conseguir descarregar, serão anexadas as capturas **já guardadas** em \`report.evidences\` (**site**, **Instagram** e, se existir, **destino do link da bio**), **incluindo ficheiros que o utilizador substituiu manualmente** no painel depois da geração.
- **Não** há nova captura por Playwright neste pedido: trate as imagens anexadas como a verdade visual atual.
- Se alguma imagem não vier anexada (falha de download), mencione a limitação com naturalidade e use o JSON e as notas de pesquisa.
- Em \`diagnosticScores\`, preserve \`evidenceImageUrl\` (e correlatos) alinhados às mesmas evidências do JSON quando forem as mesmas URLs de captura.

Observação do usuário:
${observation}

Relatório atual em JSON:
${JSON.stringify(report, null, 2)}

Retorne SOMENTE um JSON válido com os campos atualizados:
{
  "executiveSummary": "string — exatamente 2 parágrafos com \\n\\n; preferencialmente ≤520 caracteres no total",
  "companyProfile": "string",
  "digitalMaturityLevel": "Iniciante" | "Intermediário" | "Avançado",
  "digitalMaturityScore": number (0 a 10, uma casa decimal; com diagnosticScores, igual à média dos score),
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
      "comment": "string — 2 parágrafos \\n\\n; total preferencialmente ≤360 caracteres (máx. 420); denso e específico",
      "evidenceTitle": "string",
      "evidenceImageUrl": "string",
      "evidenceNote": "string"
    }
  ],
  "websiteResearchNote": "string",
  "instagramResearchNote": "string",
  "instagramBioExcerpt": "string",
  "researchNotes": "string (Website (nota X/10): até 2 parágrafos internos \\n\\n; linha em branco; Instagram (nota X/10): idem)",
  "proposalPageHtml": "string"
}`;

    const requestOrigin = req.nextUrl.origin;
    const siteFetchUrl = absolutizeEvidenceUrl(requestOrigin, report.evidences?.siteHeroSnapshotUrl);
    const instagramFetchUrl = absolutizeEvidenceUrl(requestOrigin, report.evidences?.instagramSnapshotUrl);
    const bioLinkFetchUrl = absolutizeEvidenceUrl(
      requestOrigin,
      report.evidences?.instagramBioLinkSnapshotUrl,
    );

    const [websiteImagePart, instagramImagePart, instagramBioLinkImagePart] = await Promise.all([
      downloadImageAsInlinePart(siteFetchUrl, 70_000),
      downloadImageAsInlinePart(instagramFetchUrl, 130_000),
      downloadImageAsInlinePart(bioLinkFetchUrl, 55_000),
    ]);

    const generateContentInput = buildReanalyzeGenerateContentInput(prompt, {
      websiteImagePart,
      instagramImagePart,
      instagramBioLinkImagePart,
    });

    let responseText = "";
    let selectedModelName = "";
    let selectedUsage: GeminiUsageMetadata | undefined;
    let lastError: unknown = null;

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: "v1" });
        const result = await withGeminiCallTimeout(
          model.generateContent(generateContentInput),
          GEMINI_REANALYZE_TIMEOUT_MS,
        );
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

    const prevDiagnosticByTopic = new Map(
      (report.diagnosticScores || []).map((d) => [d.topic.toLowerCase(), d] as const),
    );
    const diagnosticScores = Array.isArray(aiData.diagnosticScores)
      ? (aiData.diagnosticScores as DiagnosticScore[]).map((item) => {
          const topic = String(item.topic || "Tópico");
          const base = {
            topic,
            score: Math.max(0, Math.min(10, Number(item.score) || 0)),
            comment: clampDiagnosticComment(String(item.comment || ""), DIAGNOSTIC_COMMENT_MAX_CHARS),
            evidenceTitle: item.evidenceTitle,
            evidenceImageUrl: item.evidenceImageUrl,
            evidenceNote: item.evidenceNote,
          } satisfies DiagnosticScore;
          const prev = prevDiagnosticByTopic.get(topic.toLowerCase());
          if (!prev) return base;
          return {
            ...base,
            ...(prev.evidenceSiteImageUrl?.trim()
              ? { evidenceSiteImageUrl: prev.evidenceSiteImageUrl }
              : {}),
            ...(prev.evidenceInstagramImageUrl?.trim()
              ? { evidenceInstagramImageUrl: prev.evidenceInstagramImageUrl }
              : {}),
          };
        })
      : report.diagnosticScores || [];

    const maturityFromTopics = maturityFromDiagnosticScores(diagnosticScores);
    const normalizedScore = maturityFromTopics
      ? maturityFromTopics.digitalMaturityScore
      : (() => {
          const raw = Number(aiData.digitalMaturityScore) || report.digitalMaturityScore || 0;
          const normalized = raw > 10 ? raw / 10 : raw;
          return Math.max(0, Math.min(10, Number(normalized.toFixed(1))));
        })();
    const resolvedMaturityLevel = maturityFromTopics
      ? maturityFromTopics.digitalMaturityLevel
      : ((aiData.digitalMaturityLevel as RotaDigitalReport["digitalMaturityLevel"]) ||
          report.digitalMaturityLevel);

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

    if (reanalysisChargeContext) {
      try {
        await incrementCycleUsageAdmin({
          uid: authedUid,
          resource: "rotas",
          cycleStartMs: reanalysisChargeContext.periodStartMs,
          by: 1,
          seed: Math.max(0, reanalysisChargeContext.docsUsed),
        });
      } catch (counterErr) {
        console.error("[reanalyze-route] falha ao incrementar cycleUsage", counterErr);
      }
    }

    return NextResponse.json({
      report: {
        executiveSummary: String(aiData.executiveSummary || report.executiveSummary || ""),
        companyProfile: String(aiData.companyProfile || report.companyProfile || ""),
        digitalMaturityLevel: resolvedMaturityLevel,
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

