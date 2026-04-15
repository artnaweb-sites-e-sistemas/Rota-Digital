/**
 * Máscara de moeda BRL enquanto o utilizador digita.
 * Só os algarismos contam; o valor é interpretado em centavos (ex.: digitar12345 → R$ 123,45).
 */
export function formatCurrencyInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const amount = Number(digits) / 100;
  return amount.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Normaliza texto já guardado (com ou sem símbolo) para o mesmo formato da máscara ao abrir edição. */
export function normalizePriceForCurrencyInput(stored: string): string {
  const trimmed = stored.trim();
  if (!trimmed) return "";
  return formatCurrencyInput(trimmed);
}

/** Centavos totais a partir do texto da máscara (só dígitos, igual a `formatCurrencyInput`). */
export function parseCurrencyInputToCents(value: string): number | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const cents = Number(digits);
  return Number.isFinite(cents) ? cents : null;
}

export function formatCentsAsBrl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
