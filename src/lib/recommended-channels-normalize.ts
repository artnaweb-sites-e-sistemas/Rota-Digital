import type { DigitalChannel } from "@/types/report";
import type { AiRecommendedChannelsPolicy } from "@/types/user-settings";
import { labelsForChannelIds } from "@/lib/ai-recommended-channel-options";

function normalizeChannelName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeChannelEntry(input: unknown, forcedName?: string): DigitalChannel | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const rawName = typeof row.name === "string" ? row.name.trim() : "";
  const name = (forcedName || rawName).trim();
  if (!name) return null;
  const priority: DigitalChannel["priority"] =
    row.priority === "Alta" || row.priority === "Baixa" ? row.priority : "Média";
  const description =
    typeof row.description === "string" && row.description.trim().length > 0
      ? row.description.trim()
      : `Canal recomendado para acelerar resultados em ${name}.`;
  const actions = Array.isArray(row.actions)
    ? row.actions.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 5)
    : [];
  return {
    name,
    priority,
    description,
    actions: actions.length > 0 ? actions : [`Iniciar plano de execução para ${name}.`],
  };
}

function priorityRank(p: DigitalChannel["priority"]): number {
  if (p === "Alta") return 0;
  if (p === "Média") return 1;
  return 2;
}

/** Normaliza e deduplica canais; no modo livre, limita à quantidade configurada (prioridade Alta primeiro). */
export function normalizeRecommendedChannels(
  input: unknown,
  policy: AiRecommendedChannelsPolicy,
  restrictedChannelIds: string[],
  openTargetCount?: number
): DigitalChannel[] {
  const source = Array.isArray(input) ? input : [];
  const deduped: DigitalChannel[] = [];
  const used = new Set<string>();

  const pushIfUnique = (row: DigitalChannel | null) => {
    if (!row) return;
    const key = normalizeChannelName(row.name);
    if (!key || used.has(key)) return;
    used.add(key);
    deduped.push(row);
  };

  if (policy === "restricted" && restrictedChannelIds.length > 0) {
    const allowedLabels = labelsForChannelIds(restrictedChannelIds);
    const allowedByNorm = new Map<string, string>();
    for (const label of allowedLabels) {
      allowedByNorm.set(normalizeChannelName(label), label);
    }
    for (const row of source) {
      const rawName = typeof (row as Record<string, unknown>)?.name === "string"
        ? String((row as Record<string, unknown>).name)
        : "";
      const canonical = allowedByNorm.get(normalizeChannelName(rawName));
      if (!canonical) continue;
      pushIfUnique(sanitizeChannelEntry(row, canonical));
    }
    for (const label of allowedLabels) {
      pushIfUnique({
        name: label,
        priority: "Média",
        description: `Canal autorizado na configuração da agência para este diagnóstico.`,
        actions: [`Definir plano de execução para ${label}.`],
      });
    }
    return deduped.slice(0, allowedLabels.length);
  }

  for (const row of source) {
    pushIfUnique(sanitizeChannelEntry(row));
  }

  if (policy === "open" && typeof openTargetCount === "number" && openTargetCount > 0) {
    const withIdx = deduped.map((item, i) => ({ item, i }));
    withIdx.sort((a, b) => {
      const dr = priorityRank(a.item.priority) - priorityRank(b.item.priority);
      return dr !== 0 ? dr : a.i - b.i;
    });
    return withIdx.map((x) => x.item).slice(0, openTargetCount);
  }

  return deduped;
}
