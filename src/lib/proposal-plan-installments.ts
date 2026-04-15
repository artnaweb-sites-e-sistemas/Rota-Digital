/** Máximo de parcelas disponível nos formulários (cartão / condição comercial). */
export const PROPOSAL_PLAN_MAX_INSTALLMENTS = 12;

export function normalizeInstallmentCount(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(PROPOSAL_PLAN_MAX_INSTALLMENTS, Math.floor(n));
}

/** Reparte centavos em parcelas inteiras (sobra distribuída nas primeiras parcelas). */
export function splitCentsAcrossInstallments(totalCents: number, count: number): number[] {
  const n = normalizeInstallmentCount(count);
  if (!Number.isFinite(totalCents) || totalCents < 0) return [];
  const base = Math.floor(totalCents / n);
  const remainder = totalCents % n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}
