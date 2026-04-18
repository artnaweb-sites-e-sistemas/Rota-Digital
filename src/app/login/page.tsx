import { LoginPage } from "@/components/auth/login-page";

type LoginSearchParams = { redefinicao?: string | string[] };

export default async function LoginRoute({ searchParams }: { searchParams?: Promise<LoginSearchParams> }) {
  const sp = searchParams != null ? await searchParams : {};
  const r = sp.redefinicao;
  const passwordResetSuccess = r === "ok" || (Array.isArray(r) && r[0] === "ok");
  return <LoginPage passwordResetSuccess={passwordResetSuccess} />;
}
