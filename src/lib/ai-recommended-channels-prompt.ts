import type { AiRecommendedChannelsPolicy } from "@/types/user-settings";
import { labelsForChannelIds } from "@/lib/ai-recommended-channel-options";

/** Texto injetado no prompt (geração e reanálise) para respeitar a política de **canais** da conta. */
export function buildRecommendedChannelsPolicyPromptSection(
  policy: AiRecommendedChannelsPolicy,
  channelIds: string[]
): string {
  if (policy !== "restricted" || channelIds.length === 0) {
    return `**Política de recommendedChannels:** Você pode sugerir quaisquer canais digitais relevantes para o caso. Retorne no mínimo 3 itens em "recommendedChannels", com nomes claros em português.`;
  }

  const labels = labelsForChannelIds(channelIds);
  const quoted = labels.map((l) => `"${l}"`).join(", ");

  return `**Política de recommendedChannels (OBRIGATÓRIA — conta restrita):** A agência só trabalha com estes **canais**. Todo item de "recommendedChannels" deve ter "name" EXATAMENTE igual a um destes rótulos (copie o texto):
${labels.map((l) => `- ${l}`).join("\n")}

Regras:
- NÃO inclua em "recommendedChannels" nenhum canal que não esteja na lista acima.
- Não duplique canais: use cada "name" no máximo uma vez.
- Se a lista permitida tiver 1 ou 2 canais, retorne exatamente esses canais (sem inventar extras).
- Em "opportunities", "quickWins", "longTermActions" e "nextSteps", não peça para o cliente abrir canais fora de: ${quoted}. Pode falar em melhorias genéricas (ex.: "melhorar página de destino", "revisar criativos dos anúncios") sem nomear canais proibidos.`;
}
