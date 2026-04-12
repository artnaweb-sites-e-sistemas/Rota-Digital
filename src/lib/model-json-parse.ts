import { jsonrepair } from "jsonrepair";

/**
 * Extrai o primeiro objeto `{ ... }` com chaves balanceadas, respeitando strings e escapes.
 * Evita cortar no `}` errado quando há `lastIndexOf` e lixo após o JSON.
 */
export function extractBalancedJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }
  return null;
}

function stripInvalidControlChars(raw: string): string {
  // Remove controlos ASCII (inclui \n, \r, \t) que a IA às vezes mete dentro de strings.
  return raw.replace(/[\u0000-\u001F]/g, " ");
}

function cleanupCommonJsonIssues(raw: string): string {
  return stripInvalidControlChars(raw)
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/,\s*,+/g, ",")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function tryParseJsonString(cleaned: string): Record<string, unknown> | null {
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    /* continuar */
  }
  const balanced = extractBalancedJsonObject(cleaned);
  if (balanced) {
    const again = cleanupCommonJsonIssues(balanced);
    try {
      return JSON.parse(again) as Record<string, unknown>;
    } catch {
      /* continuar */
    }
  }
  return null;
}

function tryJsonrepairThenParse(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(jsonrepair(raw)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Parse da resposta do modelo: markdown, objeto balanceado, limpezas e jsonrepair. */
export function parseModelJson(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  let cleaned = cleanupCommonJsonIssues(trimmed);
  const direct = tryParseJsonString(cleaned);
  if (direct) return direct;

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) {
    cleaned = cleanupCommonJsonIssues(fence[1].trim());
    const fromFence = tryParseJsonString(cleaned);
    if (fromFence) return fromFence;
    const fenceRepaired = tryJsonrepairThenParse(cleaned);
    if (fenceRepaired) return fenceRepaired;
  }

  cleaned = cleanupCommonJsonIssues(trimmed);
  const balancedOnly = extractBalancedJsonObject(cleaned);
  if (balancedOnly) {
    const fromBalanced = tryParseJsonString(cleanupCommonJsonIssues(balancedOnly));
    if (fromBalanced) return fromBalanced;
    const repairedBalanced = tryJsonrepairThenParse(balancedOnly);
    if (repairedBalanced) return repairedBalanced;
  }

  const repairedCleaned = tryJsonrepairThenParse(cleaned);
  if (repairedCleaned) return repairedCleaned;

  const repairedTrimmed = tryJsonrepairThenParse(trimmed);
  if (repairedTrimmed) return repairedTrimmed;

  throw new Error("Resposta da IA não é um JSON válido.");
}
