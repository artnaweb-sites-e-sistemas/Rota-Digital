import { LoginPage } from "@/components/auth/login-page";

type LoginSearchParams = {
  redefinicao?: string | string[];
  redirect?: string | string[];
};

export default async function LoginRoute({ searchParams }: { searchParams?: Promise<LoginSearchParams> }) {
  const sp = searchParams != null ? await searchParams : {};
  const r = sp.redefinicao;
  const passwordResetSuccess = r === "ok" || (Array.isArray(r) && r[0] === "ok");
  const redirectRaw = sp.redirect;
  const redirectParam = Array.isArray(redirectRaw) ? redirectRaw[0] : redirectRaw;
  return (
    <LoginPage passwordResetSuccess={passwordResetSuccess} redirectTo={redirectParam ?? null} />
  );
}
