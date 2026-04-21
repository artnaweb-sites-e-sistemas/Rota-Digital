import { RegisterPage } from "@/components/auth/register-page";

type CadastroSearchParams = { redirect?: string | string[] };

export default async function CadastroRoute({
  searchParams,
}: {
  searchParams?: Promise<CadastroSearchParams>;
}) {
  const sp = searchParams != null ? await searchParams : {};
  const redirectRaw = sp.redirect;
  const redirectParam = Array.isArray(redirectRaw) ? redirectRaw[0] : redirectRaw;
  return <RegisterPage redirectTo={redirectParam ?? null} />;
}
