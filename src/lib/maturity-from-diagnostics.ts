import type { DiagnosticScore, RotaDigitalReport } from "@/types/report";

function clampDiagnosticScoreValue(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(10, v));
}

/** Nível a partir da média (mesmas faixas do painel: &lt;4, 4–6,9, ≥7). */
export function digitalMaturityLevelFromMeanScore(score: number): RotaDigitalReport["digitalMaturityLevel"] {
  const s = clampDiagnosticScoreValue(score);
  if (s < 4) return "Iniciante";
  if (s < 7) return "Intermediário";
  return "Avançado";
}

/**
 * Maturidade digital = média aritmética das notas dos tópicos (0–10, uma casa decimal).
 * Sem tópicos, devolve null (mantém valores vindos da IA ou do relatório).
 */
export function maturityFromDiagnosticScores(
  diagnosticScores: DiagnosticScore[] | undefined,
): { digitalMaturityScore: number; digitalMaturityLevel: RotaDigitalReport["digitalMaturityLevel"] } | null {
  const list = diagnosticScores || [];
  if (list.length === 0) return null;
  const sum = list.reduce((acc, d) => acc + clampDiagnosticScoreValue(d.score), 0);
  const mean = sum / list.length;
  const digitalMaturityScore = Number(clampDiagnosticScoreValue(mean).toFixed(1));
  return {
    digitalMaturityScore,
    digitalMaturityLevel: digitalMaturityLevelFromMeanScore(digitalMaturityScore),
  };
}
