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

/**
 * Quando a política é restrita, a IA costuma encurtar rótulos ("TikTok" vs "TikTok Ads").
 * Mapeia variações comuns para o rótulo canônico permitido, sem ambiguidade agressiva.
 */
function resolveCanonicalRestrictedLabel(rawName: string, allowedLabels: string[]): string | undefined {
  const norm = normalizeChannelName(rawName);
  if (!norm) return undefined;
  const rawLower = rawName.toLowerCase();

  const pick = (predicate: (label: string) => boolean) => allowedLabels.find(predicate);

  if (/\btiktok\b|\btik\s*tok\b/i.test(rawLower)) {
    const row = pick((l) => /\btiktok\b/i.test(l));
    if (row) return row;
  }
  if (/\bwhatsapp\b|\bzap\b/i.test(rawLower)) {
    const row = pick((l) => normalizeChannelName(l).includes("whatsapp"));
    if (row) return row;
  }
  if (/\byoutube\b/i.test(rawLower)) {
    const row = pick((l) => normalizeChannelName(l).includes("youtube"));
    if (row) return row;
  }
  if (/\bgoogle\b/.test(rawLower) && /\bads\b/.test(rawLower)) {
    const row = pick((l) => /google/i.test(l) && /ads/i.test(l));
    if (row) return row;
  }
  if (/\blinkedin\b/.test(rawLower) && /\bads\b/.test(rawLower)) {
    const row = pick((l) => /linkedin/i.test(l) && /ads/i.test(l));
    if (row) return row;
  }
  if (/\bmeta\b/.test(rawLower) && /\bads\b/.test(rawLower)) {
    const row = pick((l) => /meta ads/i.test(l));
    if (row) return row;
  }
  if (/\bfacebook\b/.test(rawLower) && /\bads\b/.test(rawLower)) {
    const row = pick((l) => /meta ads/i.test(l));
    if (row) return row;
  }
  if (/\binstagram\b/.test(rawLower) && /\bads\b/.test(rawLower)) {
    const row = pick((l) => /meta ads/i.test(l));
    if (row) return row;
  }
  if (/\bemail\b|\be-mail\b|\bmailing\b/i.test(rawLower)) {
    const row = pick((l) => normalizeChannelName(l).includes("e-mail") || normalizeChannelName(l).includes("email"));
    if (row) return row;
  }
  if (/\bseo\b|\bblog\b/i.test(rawLower)) {
    const row = pick((l) => normalizeChannelName(l).includes("seo"));
    if (row) return row;
  }

  return undefined;
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
      const canonical =
        allowedByNorm.get(normalizeChannelName(rawName)) ||
        resolveCanonicalRestrictedLabel(rawName, allowedLabels);
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
