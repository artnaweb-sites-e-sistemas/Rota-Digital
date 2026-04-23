/** Opções fixas para a agência marcar o que oferece; a IA só recomenda estes rótulos quando a política está "restrita". */
export const AI_RECOMMENDED_CHANNEL_OPTIONS = [
  { id: "google_ads", label: "Google Ads" },
  { id: "meta_ads", label: "Meta Ads (Instagram e Facebook)" },
  { id: "google_meu_negocio", label: "Google Meu Negócio" },
  { id: "linkedin_ads", label: "LinkedIn Ads" },
  { id: "instagram_organic", label: "Instagram (conteúdo orgânico)" },
  { id: "facebook_organic", label: "Facebook (conteúdo orgânico)" },
  { id: "linkedin_organic", label: "LinkedIn (conteúdo orgânico)" },
  { id: "youtube", label: "YouTube" },
  { id: "website_lp", label: "Website / landing page" },
  { id: "seo_conteudo", label: "SEO / blog / conteúdo" },
  { id: "email_marketing", label: "E-mail marketing" },
  { id: "whatsapp", label: "WhatsApp (disparos / atendimento)" },
] as const;

const VALID_IDS = new Set<string>(AI_RECOMMENDED_CHANNEL_OPTIONS.map((o) => o.id));

/** `tiktok_ads` foi substituído por GMB; migra valores antigos guardados no Firestore. */
function mapLegacyRecommendedChannelId(id: string): string {
  return id === "tiktok_ads" ? "google_meu_negocio" : id;
}

export function sanitizeAiRecommendedChannelIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  for (const x of ids) {
    if (typeof x !== "string") continue;
    const id = mapLegacyRecommendedChannelId(x.trim());
    if (VALID_IDS.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export function labelsForChannelIds(ids: string[]): string[] {
  const byId = Object.fromEntries(AI_RECOMMENDED_CHANNEL_OPTIONS.map((o) => [o.id, o.label])) as Record<
    string,
    string
  >;
  return ids.map((id) => byId[id]).filter(Boolean);
}
