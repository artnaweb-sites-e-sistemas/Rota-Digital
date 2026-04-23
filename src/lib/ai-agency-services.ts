/** Serviços que a agência pode marcar para a IA priorizar nas recomendações. */
export const AI_AGENCY_SERVICE_OPTIONS = [
  { id: "trafego_pago", label: "Gestão de tráfego pago (mídia)" },
  { id: "meta_ads", label: "Meta Ads (Instagram e Facebook)" },
  { id: "google_ads", label: "Google Ads" },
  { id: "google_meu_negocio", label: "Google Meu Negócio" },
  { id: "linkedin_ads", label: "LinkedIn Ads" },
  { id: "producao_criativos", label: "Produção de criativos (imagem e vídeo)" },
  { id: "edicao_video", label: "Edição de vídeo" },
  { id: "identidade_visual", label: "Identidade visual / branding" },
  { id: "social_media", label: "Gestão de redes sociais (conteúdo orgânico)" },
  { id: "landing_website", label: "Landing page / website" },
  { id: "seo_conteudo", label: "SEO / blog / conteúdo" },
  { id: "email_marketing", label: "E-mail marketing" },
  { id: "automacao_crm", label: "Automação / CRM / integrações" },
  { id: "consultoria", label: "Consultoria estratégica" },
] as const;

const VALID_SERVICE_IDS = new Set<string>(AI_AGENCY_SERVICE_OPTIONS.map((o) => o.id));

function mapLegacyServiceId(id: string): string {
  return id === "tiktok_ads" ? "google_meu_negocio" : id;
}

export function sanitizeAiServiceOfferingIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  for (const x of ids) {
    if (typeof x !== "string") continue;
    const id = mapLegacyServiceId(x.trim());
    if (VALID_SERVICE_IDS.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export const MAX_CUSTOM_SERVICE_LABELS = 12;
export const MAX_CUSTOM_SERVICE_LABEL_LEN = 100;

export function sanitizeAiCustomServiceLabels(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of input) {
    if (typeof x !== "string") continue;
    let s = x.trim().replace(/\s+/g, " ");
    if (!s) continue;
    if (s.length > MAX_CUSTOM_SERVICE_LABEL_LEN) s = s.slice(0, MAX_CUSTOM_SERVICE_LABEL_LEN);
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= MAX_CUSTOM_SERVICE_LABELS) break;
  }
  return out;
}

export function parseCustomServiceLabelsFromMultiline(raw: string): string[] {
  const parts = raw
    .split(/[\n,;]+/)
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  return sanitizeAiCustomServiceLabels(parts);
}

export function labelsForServiceIds(ids: string[]): string[] {
  const byId = Object.fromEntries(AI_AGENCY_SERVICE_OPTIONS.map((o) => [o.id, o.label])) as Record<
    string,
    string
  >;
  return ids.map((id) => byId[id]).filter(Boolean);
}
