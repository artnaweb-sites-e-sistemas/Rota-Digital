import type { AiRecommendedChannelsPolicy } from "@/types/user-settings";
import { labelsForChannelIds } from "@/lib/ai-recommended-channel-options";

export const AI_OPEN_RECOMMENDED_CHANNEL_COUNT_MIN = 2;
export const AI_OPEN_RECOMMENDED_CHANNEL_COUNT_MAX = 8;
export const AI_OPEN_RECOMMENDED_CHANNEL_COUNT_DEFAULT = 2;

export function sanitizeAiOpenRecommendedChannelCount(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return AI_OPEN_RECOMMENDED_CHANNEL_COUNT_DEFAULT;
  return Math.max(
    AI_OPEN_RECOMMENDED_CHANNEL_COUNT_MIN,
    Math.min(AI_OPEN_RECOMMENDED_CHANNEL_COUNT_MAX, Math.round(n)),
  );
}

/** Texto injetado no prompt (geração e reanálise) para respeitar a política de **canais** da conta. */
export function buildRecommendedChannelsPolicyPromptSection(
  policy: AiRecommendedChannelsPolicy,
  channelIds: string[],
  openChannelCount: number = AI_OPEN_RECOMMENDED_CHANNEL_COUNT_DEFAULT,
): string {
  if (policy !== "restricted" || channelIds.length === 0) {
    const n = sanitizeAiOpenRecommendedChannelCount(openChannelCount);
    return `**Política de recommendedChannels (modo livre):** Sugira canais digitais realmente relevantes para o caso. Retorne **exatamente ${n}** itens em "recommendedChannels" (nem mais nem menos), com nomes claros em português. Para cada item, defina "priority" como "Alta", "Média" ou "Baixa" conforme o peso na sua análise — distribua as prioridades de forma coerente (não use a mesma prioridade em todos se houver diferença clara de impacto).`;
  }

  const labels = labelsForChannelIds(channelIds);
  const quoted = labels.map((l) => `"${l}"`).join(", ");

  return `**Política de recommendedChannels (OBRIGATÓRIA — conta restrita):** A agência só trabalha com estes **canais**. Todo item de "recommendedChannels" deve ter "name" EXATAMENTE igual a um destes rótulos (copie o texto):
${labels.map((l) => `- ${l}`).join("\n")}

Regras:
- NÃO inclua em "recommendedChannels" nenhum canal que não esteja na lista acima.
- Não duplique canais: use cada "name" no máximo uma vez.
- Se a lista permitida tiver 1 ou 2 canais, retorne exatamente esses canais (sem inventar extras).
- Copie cada "name" **caractere a caractere** como na lista (incluindo maiúsculas, espaços e parênteses). Ex.: use "TikTok Ads", não "TikTok", "tiktok" nem "Tik Tok Ads".
- Para **cada** canal da lista restrita que você incluir, preencha "description" e "actions" com análise **específica** deste lead (negócio, público, jornada, criativos ou dados já observados). Frases genéricas do tipo "canal autorizado na configuração" ou só "definir plano de execução" sem contexto são **proibidas**.
- Em "opportunities", "quickWins", "longTermActions" e "nextSteps", não peça para o cliente abrir canais fora de: ${quoted}. Pode falar em melhorias genéricas (ex.: "melhorar página de destino", "revisar criativos dos anúncios") sem nomear canais proibidos.`;
}
