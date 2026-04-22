/** Nome da agência quando o utilizador deixa o campo vazio nas Configurações. */
export const DEFAULT_COMPANY_ABOUT_NAME = "RouteLAB";
const LEGACY_COMPANY_ABOUT_NAME = "Rota Digital";

/**
 * Imagem “principal” padrão (RouteLAB) quando ainda não há upload ou o plano não permite trocar.
 * Ficheiro em `public/`.
 */
export const DEFAULT_COMPANY_PRIMARY_IMAGE_PATH = "/assets/logo/logo-fundo-completo.png" as const;

/** URL de exibição do logo: mantém a URL customizada ou cai no asset RouteLAB. */
export function resolveCompanyPrimaryImageForDisplay(url: string | undefined | null): string {
  const t = (url ?? "").trim();
  return t || DEFAULT_COMPANY_PRIMARY_IMAGE_PATH;
}

/**
 * Imagem de capa padrão (identidade Rota / RouteLAB) quando não há upload.
 * Ficheiro em `public/`.
 */
export const DEFAULT_COMPANY_COVER_IMAGE_PATH = "/assets/logo/img-capa@3x.png" as const;

export function resolveCompanySecondaryImageForDisplay(url: string | undefined | null): string {
  const t = (url ?? "").trim();
  return t || DEFAULT_COMPANY_COVER_IMAGE_PATH;
}

export function resolveCompanyAboutNameForDisplay(companyName: string | undefined | null): string {
  const t = (companyName ?? "").trim();
  if (!t || t === LEGACY_COMPANY_ABOUT_NAME) return DEFAULT_COMPANY_ABOUT_NAME;
  return t;
}

/**
 * Resumo institucional de apoio quando o resumo está vazio (propostas e bloco Sobre a Empresa).
 * Dois parágrafos curtos, tom profissional.
 */
const LEGACY_DEFAULT_COMPANY_ABOUT_SUMMARY = [
  "A Rota Digital é uma plataforma e metodologia para orientar a presença digital de empresas com diagnóstico claro, priorização de canais e próximos passos práticos. O foco é alinhar site, redes sociais e contacto com clientes ao que realmente gera resultado para o negócio.",
  "Nas propostas e materiais assinados pela Rota Digital, o texto é direto, acessível e pensado para decisores que precisam de visão rápida e um roteiro de evolução — desde o primeiro site até rotinas de conteúdo, campanhas ou suporte recorrente, conforme o contexto de cada cliente.",
].join("\n\n");

export const DEFAULT_COMPANY_ABOUT_SUMMARY = [
  "A RouteLAB combina diagnóstico, direção estratégica e clareza de execução para ajudar empresas a evoluírem sua presença digital com mais foco, consistência e potencial de crescimento.",
  "Neste projeto, atuamos como parceiro estratégico para identificar oportunidades, organizar prioridades e transformar complexidade em um plano prático, objetivo e fácil de apresentar para a tomada de decisão.",
].join("\n\n");

export function resolveCompanyAboutNameForSave(companyName: string | undefined | null): string {
  return resolveCompanyAboutNameForDisplay(companyName);
}

export function resolveCompanyAboutSummaryForDisplay(companySummary: string | undefined | null): string {
  const t = (companySummary ?? "").trim();
  if (!t || t === LEGACY_DEFAULT_COMPANY_ABOUT_SUMMARY) return DEFAULT_COMPANY_ABOUT_SUMMARY;
  return t;
}

export function resolveCompanyAboutSummaryForSave(companySummary: string | undefined | null): string {
  return resolveCompanyAboutSummaryForDisplay(companySummary);
}
