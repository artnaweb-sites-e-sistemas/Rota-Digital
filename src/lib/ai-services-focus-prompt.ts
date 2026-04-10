import type { AiServicesFocusPolicy } from "@/types/user-settings";
import { labelsForServiceIds } from "@/lib/ai-agency-services";

/** Orienta a IA a alinhar TODO o relatório aos serviços que a agência realmente vende. */
export function buildServicesFocusPromptSection(
  policy: AiServicesFocusPolicy,
  serviceIds: string[],
  customServiceLabels: string[] = []
): string {
  const preset = labelsForServiceIds(serviceIds);
  const customs = customServiceLabels.map((c) => c.trim()).filter(Boolean);
  const hasRestricted = policy === "restricted" && (preset.length > 0 || customs.length > 0);

  if (!hasRestricted) {
    return `**Foco em serviços da agência:** Sem restrição definida pela conta. Você pode sugerir quaisquer entregas e próximos passos que façam sentido com base na análise.

Importante: quando o usuário citar serviços específicos no briefing (ex.: logotipo, branding, tráfego pago), leve isso em conta em "strengths", "weaknesses", "opportunities", "quickWins", "longTermActions" e "nextSteps".`;
  }

  let listSection = "";
  if (preset.length && customs.length) {
    listSection = `Da lista padrão:\n${preset.map((l) => `- ${l}`).join("\n")}\n\nServiços personalizados informados pela agência:\n${customs.map((l) => `- ${l}`).join("\n")}`;
  } else if (preset.length) {
    listSection = preset.map((l) => `- ${l}`).join("\n");
  } else {
    listSection = `Serviços personalizados informados pela agência:\n${customs.map((l) => `- ${l}`).join("\n")}`;
  }

  const all = [...preset, ...customs];
  const quoted = all.map((l) => `"${l}"`).join(", ");

  return `**Foco em serviços da agência (OBRIGATÓRIO):** A conta definiu que você deve priorizar TODA a leitura estratégica com base nestes serviços (a análise do site/Instagram continua completa e honesta):
${listSection}

Regras:
- Em "strengths", "weaknesses", "opportunities", "quickWins", "longTermActions", "nextSteps", em "diagnosticScores.comment" e na proposta em HTML, conecte os achados aos serviços da lista: ${quoted}.
- Para cada gap relevante, tente traduzir em ação prática dentro desses serviços (ex.: branding/logotipo, tráfego pago, site/landing page, social, etc., conforme a lista permitida).
- Não empurre o cliente para contratar serviços fora dessa lista como caminho principal (ex.: não colocar edição de vídeo como prioridade se não estiver na lista).
- Se surgir um gap fora da cobertura da agência, mencione de forma neutra e breve ("pode exigir parceiro externo"), sem detalhar proposta comercial fora do escopo.
- Se um serviço estiver na lista e houver evidência relacionada (ex.: qualidade de logotipo/identidade, estrutura de tráfego pago, comunicação visual, clareza da oferta), explicite isso nas forças/fraquezas/oportunidades e priorize em quick wins quando couber.
- "recommendedChannels" continua seguindo a política de canais da conta; serviços e canais são dimensões diferentes — alinhe ambos quando fizer sentido.`;
}
