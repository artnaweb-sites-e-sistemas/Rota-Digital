/**
 * Entregáveis de plano: sintaxe opcional na área de texto
 * - Linhas que começam por `- ` (hífen + espaço) = pacote / título principal
 * - Linhas que começam por `• ` ou `* ` = subitens do pacote acima
 * - Linhas sem `-` no início do ficheiro: modo clássico (lista plana, um ícone por linha)
 */

export type PlanDeliverableSection = {
  title: string;
  items: string[];
};

export type PlanDeliverablesDisplay =
  | { kind: "flat"; lines: string[] }
  | { kind: "sections"; sections: PlanDeliverableSection[] };

function stripLegacyListMarker(line: string): string {
  return line.replace(/^[-*•]\s*/, "").trim();
}

/** True se a linha abre um pacote (`- Título`). */
function isDeliverableParentLine(line: string): boolean {
  return /^-\s*\S/.test(line);
}

function parentTitleFromLine(line: string): string {
  return line.replace(/^-\s*/, "").trim();
}

/** Subitem: `• texto` ou `* texto`. */
function isDeliverableSubLine(line: string): boolean {
  return /^[•\*]\s*\S/.test(line);
}

function subItemTextFromLine(line: string): string {
  return line.replace(/^[•\*]\s*/, "").trim();
}

export function parsePlanDeliverablesForDisplay(text: string): PlanDeliverablesDisplay {
  const rawLines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!rawLines.length) return { kind: "flat", lines: [] };

  if (!rawLines.some(isDeliverableParentLine)) {
    return {
      kind: "flat",
      lines: rawLines.map((l) => stripLegacyListMarker(l)).filter(Boolean),
    };
  }

  const sections: PlanDeliverableSection[] = [];
  let current: PlanDeliverableSection | null = null;

  for (const line of rawLines) {
    if (isDeliverableParentLine(line)) {
      current = { title: parentTitleFromLine(line), items: [] };
      sections.push(current);
      continue;
    }
    if (isDeliverableSubLine(line)) {
      const item = subItemTextFromLine(line);
      if (!item) continue;
      if (current) {
        current.items.push(item);
      } else {
        current = { title: "", items: [item] };
        sections.push(current);
      }
      continue;
    }
    if (current) {
      current.items.push(line);
    } else {
      sections.push({ title: stripLegacyListMarker(line), items: [] });
    }
  }

  return { kind: "sections", sections };
}
