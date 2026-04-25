/** Teto de parcelas no cartão exibido na proposta (texto comercial; o cliente escolhe no checkout Stripe). */
export const PROPOSAL_PLAN_MAX_INSTALLMENTS = 12;

export function normalizeInstallmentCount(raw: unknown): number {
  return normalizeMaxCardInstallments(raw);
}

/** Limite 1–12: usado em `maxCardInstallments` e migração de `installmentCount` antigo. */
export function normalizeMaxCardInstallments(raw: unknown): number {
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
