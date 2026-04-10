import type { AiScoringStrictness } from "@/types/user-settings";

const VALID: AiScoringStrictness[] = ["free", "low", "medium", "high"];

export function sanitizeAiScoringStrictness(input: unknown): AiScoringStrictness {
  return typeof input === "string" && VALID.includes(input as AiScoringStrictness)
    ? (input as AiScoringStrictness)
    : "free";
}

/**
 * O relatório colore notas assim: &lt;4 vermelho, &lt;7 amarelo, ≥7 verde.
 * Estas regras calibram o que a IA deve devolver em diagnosticScores e digitalMaturityScore.
 */
export function buildScoringStrictnessPromptSection(level: AiScoringStrictness): string {
  if (level === "free") {
    return `**Nível de exigência nas notas (livre):** Distribua as notas 0-10 com total autonomia, sempre respeitando evidências e a regra de não inventar dados. Use a escala de forma natural: problemas leves vs graves devem se refletir nas notas.`;
  }
  if (level === "low") {
    return `**Nível de exigência nas notas (baixa — relatório mais “brand-friendly”):** O painel do sistema mostra vermelho para notas abaixo de 4, amarelo entre 4 e 6,9, e verde a partir de 7.
- Em **diagnosticScores** (cada "score") e em **digitalMaturityScore**, use **nunca valor menor que 4,0** — assim nenhum indicador aparece vermelho.
- Para imperfeições comuns, prefira notas entre **5,0 e 8,5**; reserve 7,5-8,5 quando o desempenho for claramente bom.
- Os **comentários** podem ser diretos sobre o que melhorar; a nota numérica segue esta calibração indulgente.`;
  }
  if (level === "medium") {
    return `**Nível de exigência nas notas (média):** Equilíbrio entre rigor e leitura positiva para o cliente.
- Use a escala 0-10 com honestidade. Notas **abaixo de 4** só quando o problema for **claramente grave** e **baseado em evidência** (não por detalhe pequeno).
- Problemas moderados costumam ficar na faixa **4-6,9** (amarelo no painel). Bom desempenho: **7-8,5**. Excelente: **8,5-10**.
- Não “forçar” vermelho nem verde: vermelho só quando o diagnóstico realmente exigir.`;
  }
  return `**Nível de exigência nas notas (alta — rigor):** O cliente quer um diagnóstico mais duro; as notas tendem a ser **mais baixas** quando houver gaps reais.
- Seja exigente: fragilidades moderadas devem **puxar a nota para baixo** (muitas vezes **4-6**). Use **abaixo de 4** quando o gap for relevante e comprovado — **só quando necessário**, não por picuinha.
- Não inflacione notas “para agradar”. Comentários e notas devem estar alinhados.
- Lembrete visual do sistema: &lt;4 vermelho, 4-6,9 amarelo, ≥7 verde — use vermelho só se o caso justificar.`;
}
