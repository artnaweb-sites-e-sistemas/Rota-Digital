/** Conta “admin geral” (login Firebase deve usar este e-mail para permissões de admin na app). */
export const GENERAL_ADMIN_EMAIL = "rotadigital@biraoliveira.com.br";

export function isGeneralAdminEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return email.trim().toLowerCase() === GENERAL_ADMIN_EMAIL.toLowerCase();
}
