import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

import type { DiagnosticScore, RotaDigitalReport } from "@/types/report";

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
    const prompt = `Você vai reanalisar e ajustar um relatório já existente.

Regra principal de escrita:
- Use linguagem simples, direta e fácil de entender.
- Evite termos técnicos complexos.
- Se usar termo técnico, explique em uma frase curta.
- Se website/instagram estiver vazio, quebrado ou genérico, declare isso claramente e ajuste a nota.
- Escreva como alguém explicando o cenário para um cliente comum, não como um consultor tentando impressionar.
- Evite tom excessivamente analítico, acadêmico ou cheio de jargão.
- Evite frases infladas como "presença digital robusta", "sinergia entre canais", "alavancar resultados", "ecossistema digital" e parecidas.
- Prefira frases concretas e humanas, como "a proposta está clara", "o perfil passa confiança", "o CTA pode melhorar", "faltam provas visuais".
- Não repita a mesma ideia em vários campos.
- Se existir o campo report.evidences.instagramBioLinkResolvedUrl, use esse valor como verdade para comentar o link da bio.
- Se o destino final do link da bio for WhatsApp, diga isso claramente e não invente Linktree com várias opções.

Tom por campo:
- "executiveSummary": 1 parágrafo curto, claro e humano, explicando o motivo da nota.
- "companyProfile": texto curto, direto e fácil de entender.
- "strengths", "weaknesses", "opportunities", "quickWins", "longTermActions", "nextSteps": itens curtos e objetivos.
- "recommendedChannels.description": explique de forma comercial simples por que o canal faz sentido.
- "recommendedChannels.actions": ações práticas e diretas.
- "diagnosticScores.comment": comentário específico, natural e acionável.
- Se a nota de um tópico for menor que 10, diga sempre o que falta para chegar a 10/10.
- Nunca escreva frases vagas como "há espaço para melhorar" ou "há espaço para otimizações técnicas" sem explicar exatamente o que deve ser feito.
- Em "Identidade Visual", comente harmonia visual, paleta, contraste, hierarquia, espaçamento, alinhamento, legibilidade e coerência entre site e Instagram.
- Se o texto ficar longo em "diagnosticScores.comment", "websiteResearchNote", "instagramResearchNote" ou "recommendedChannels.description", divida em 2 parágrafos curtos.

Observação do usuário:
${observation}

Relatório atual em JSON:
${JSON.stringify(report, null, 2)}

Retorne SOMENTE um JSON válido com os campos atualizados:
{
  "executiveSummary": "string - 1 parágrafo com motivo da nota",
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
  "researchNotes": "string (2 parágrafos: 1) Website (nota X/10): ... 2) Instagram (nota X/10): ...)",
  "proposalPageHtml": "string"
}`;

    let responseText = "";
    let lastError: unknown = null;

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: "v1" });
        const result = await model.generateContent(prompt);
        responseText = result.response.text();
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
        recommendedChannels:
          (aiData.recommendedChannels as RotaDigitalReport["recommendedChannels"]) ||
          report.recommendedChannels ||
          [],
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

