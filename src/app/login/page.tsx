import { LoginPage } from "@/components/auth/login-page";

type LoginSearchParams = {
  redefinicao?: string | string[];
  redirect?: string | string[];
  email?: string | string[];
};

export default async function LoginRoute({ searchParams }: { searchParams?: Promise<LoginSearchParams> }) {
  const sp = searchParams != null ? await searchParams : {};
  const r = sp.redefinicao;
  const passwordResetSuccess = r === "ok" || (Array.isArray(r) && r[0] === "ok");
  const redirectRaw = sp.redirect;
  const redirectParam = Array.isArray(redirectRaw) ? redirectRaw[0] : redirectRaw;
  const emailRaw = sp.email;
  const emailParam = Array.isArray(emailRaw) ? emailRaw[0] : emailRaw;
  return (
    <LoginPage
      passwordResetSuccess={passwordResetSuccess}
      redirectTo={redirectParam ?? null}
      prefillEmail={emailParam != null && emailParam !== "" ? emailParam : null}
    />
  );
}
