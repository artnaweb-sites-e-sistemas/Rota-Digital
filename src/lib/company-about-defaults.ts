/** Nome da agência quando o utilizador deixa o campo vazio nas Configurações. */
export const DEFAULT_COMPANY_ABOUT_NAME = "Rota Digital";

/**
 * Resumo institucional de apoio quando o resumo está vazio (propostas e bloco Sobre a Empresa).
 * Dois parágrafos curtos, tom profissional.
 */
export const DEFAULT_COMPANY_ABOUT_SUMMARY = [
  "A Rota Digital é uma plataforma e metodologia para orientar a presença digital de empresas com diagnóstico claro, priorização de canais e próximos passos práticos. O foco é alinhar site, redes sociais e contacto com clientes ao que realmente gera resultado para o negócio.",
  "Nas propostas e materiais assinados pela Rota Digital, o texto é direto, acessível e pensado para decisores que precisam de visão rápida e um roteiro de evolução — desde o primeiro site até rotinas de conteúdo, campanhas ou suporte recorrente, conforme o contexto de cada cliente.",
].join("\n\n");

export function resolveCompanyAboutNameForSave(companyName: string | undefined | null): string {
  const t = (companyName ?? "").trim();
  return t || DEFAULT_COMPANY_ABOUT_NAME;
}

export function resolveCompanyAboutSummaryForSave(companySummary: string | undefined | null): string {
  const t = (companySummary ?? "").trim();
  return t || DEFAULT_COMPANY_ABOUT_SUMMARY;
}
