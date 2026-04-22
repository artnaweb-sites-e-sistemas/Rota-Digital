"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { ArrowLeft, Eye, EyeOff, Heart, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth, isFirebaseAuthConfigured } from "@/lib/firebase";
import { safeInternalPath } from "@/lib/safe-internal-path";
import Grainient from "@/components/grainient";
import { AuthAsideHeading } from "@/components/auth/auth-aside-heading";
import { cn } from "@/lib/utils";

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function firebaseSignupErrorMessage(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: string }).code)
      : "";
  if (code === "auth/invalid-api-key") {
    return "Chave da API Firebase invalida. Revise NEXT_PUBLIC_FIREBASE_API_KEY na Vercel.";
  }
  if (code === "auth/email-already-in-use") {
    return "Este e-mail já está registado. Entre ou use outro e-mail.";
  }
  if (code === "auth/invalid-email") {
    return "E-mail inválido.";
  }
  if (code === "auth/weak-password") {
    return "A senha deve ter pelo menos 6 caracteres.";
  }
  return "Não foi possível criar a conta. Tente novamente.";
}

export function RegisterPage({
  redirectTo = null,
}: {
  /** Caminho interno após cadastro (ex.: `/assinatura?plan=pro&cycle=monthly`). */
  redirectTo?: string | null;
} = {}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const loginHref =
    safeInternalPath(redirectTo) != null
      ? `/login?redirect=${encodeURIComponent(safeInternalPath(redirectTo)!)}`
      : "/login";

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setIsSubmitting(true);

    if (!isFirebaseAuthConfigured || !auth) {
      setError("Firebase nao configurado. Defina as variaveis NEXT_PUBLIC_FIREBASE_* na Vercel.");
      setIsSubmitting(false);
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const name = displayName.trim();
      if (name) {
        await updateProfile(cred.user, { displayName: name });
      }
      const next = safeInternalPath(redirectTo);
      router.push(next ?? "/dashboard");
    } catch (err: unknown) {
      setError(firebaseSignupErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-svh w-full flex-col bg-background p-[max(1rem,min(3vw,2.75rem))] text-foreground sm:p-[max(1.25rem,min(3.5vw,3rem))]">
      <div className="mx-auto flex min-h-0 w-full max-w-[1450px] flex-1 flex-col">
        <div className="flex min-h-0 w-full flex-1 flex-col lg:flex-row lg:gap-x-3">
          <aside
            className="relative hidden min-h-0 w-[32%] min-w-[280px] max-w-[420px] shrink-0 flex-col justify-between overflow-hidden rounded-3xl border border-[#d2b56a]/24 bg-[#f9f3e4] px-10 py-12 text-zinc-900 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.14)] lg:flex dark:border-[#c9a95f]/24 dark:bg-[#f3ead4]"
            aria-label="Marca Rota Digital"
          >
            <div className="absolute inset-0 z-0 overflow-hidden rounded-3xl">
              <Grainient
                color1="#f1e3bd"
                color2="#d5b36a"
                color3="#a8843d"
                timeSpeed={0.72}
                colorBalance={0}
                warpStrength={1.5}
                warpFrequency={4}
                warpSpeed={3.7}
                warpAmplitude={64}
                blendAngle={0}
                blendSoftness={0.05}
                rotationAmount={500}
                noiseScale={2}
                grainAmount={0.1}
                grainScale={2}
                grainAnimated={false}
                contrast={1.58}
                gamma={1}
                saturation={1.02}
                centerX={0}
                centerY={0}
                zoom={0.9}
                className="h-full min-h-full w-full"
              />
            </div>
            <div className="pointer-events-none absolute inset-0 z-[1] rounded-3xl bg-gradient-to-b from-[#f2e2ba]/64 via-[#e8cf96]/42 to-[#d9b973]/48" />

            <div className="relative z-10 flex flex-col gap-5 sm:gap-6">
              <Image
                src="/assets/logo/logo-dark.png"
                alt="Rota Digital"
                width={220}
                height={62}
                className="h-auto w-[10.5rem]"
                priority
              />
              <AuthAsideHeading>Crie sua conta</AuthAsideHeading>
            </div>

            <div className="relative z-10 rounded-2xl border border-zinc-900/6 bg-[#fff9ec]/32 px-4 py-3.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.34),0_12px_44px_-14px_rgba(0,0,0,0.15)] backdrop-blur-xl backdrop-saturate-140">
              <div className="flex gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#6f5a2f]/12">
                  <ShieldCheck className="size-[1.15rem] text-[#6f5a2f]" strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold text-[#6f5a2f]">Plataforma 100% segura</p>
                  <p className="text-xs leading-snug text-[#6f5a2f]/88">Dados totalmente protegidos</p>
                </div>
              </div>
            </div>
          </aside>

          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-transparent px-5 pt-10 pb-0 sm:px-8 lg:px-12 xl:px-16">
            <div className="absolute top-4 left-4 z-20 sm:top-5 sm:left-5">
              <Link
                href="/"
                className={cn(
                  "inline-flex size-9 items-center justify-center rounded-lg text-[#8e7d4d] dark:text-[#d8c383]",
                  "transition-colors duration-150",
                  "hover:bg-transparent hover:text-zinc-950 dark:hover:text-zinc-100",
                  "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                )}
                aria-label="Voltar para o início"
              >
                <ArrowLeft className="size-[1.125rem]" strokeWidth={2} aria-hidden />
              </Link>
            </div>

            <div className="flex min-h-0 flex-1 flex-col justify-center">
              <div className="mx-auto w-full max-w-[420px]">
                <div className="mb-10 flex items-center justify-center gap-3 lg:hidden">
                  <div className="rounded-md bg-[#121217] px-2 py-1.5">
                    <Image
                      src="/assets/logo/logo-white.png"
                      alt="Rota Digital"
                      width={220}
                      height={62}
                      className="h-auto w-[8.5rem]"
                      priority
                    />
                  </div>
                </div>

                <header className="mb-8 space-y-2 text-center lg:text-left">
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">Cadastro</h2>
                  <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
                    Preencha os dados para começar a usar a plataforma
                  </p>
                </header>

                <form onSubmit={handleRegister} className="space-y-5">
                  {error && (
                    <div
                      className="rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
                      role="alert"
                    >
                      {error}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="displayName" className="text-sm font-semibold text-foreground">
                      Nome <span className="font-normal text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input
                      id="displayName"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Como devemos chamar você"
                      autoComplete="name"
                      disabled={isSubmitting}
                      className="h-12 rounded-xl border-border bg-card px-4 text-base text-foreground shadow-none placeholder:text-muted-foreground focus:border-ring focus:ring-ring/40 md:text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-email" className="text-sm font-semibold text-foreground">
                      E-mail
                    </Label>
                    <Input
                      id="register-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Digite seu e-mail"
                      required
                      autoComplete="email"
                      disabled={isSubmitting}
                      className="h-12 rounded-xl border-border bg-card px-4 text-base text-foreground shadow-none placeholder:text-muted-foreground focus:border-ring focus:ring-ring/40 md:text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-password" className="text-sm font-semibold text-foreground">
                      Senha
                    </Label>
                    <div className="relative">
                      <Input
                        id="register-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        required
                        autoComplete="new-password"
                        disabled={isSubmitting}
                        className="h-12 rounded-xl border-border bg-card py-1 pr-12 pl-4 text-base text-foreground shadow-none placeholder:text-muted-foreground focus:border-ring focus:ring-ring/40 md:text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        disabled={isSubmitting}
                        className={cn(
                          "absolute top-1/2 right-1.5 flex size-10 min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors",
                          "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
                        )}
                        aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showPassword ? <EyeOff className="size-[1.125rem]" /> : <Eye className="size-[1.125rem]" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password" className="text-sm font-semibold text-foreground">
                      Confirmar senha
                    </Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a senha"
                        required
                        autoComplete="new-password"
                        disabled={isSubmitting}
                        className="h-12 rounded-xl border-border bg-card py-1 pr-12 pl-4 text-base text-foreground shadow-none placeholder:text-muted-foreground focus:border-ring focus:ring-ring/40 md:text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        disabled={isSubmitting}
                        className={cn(
                          "absolute top-1/2 right-1.5 flex size-10 min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors",
                          "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
                        )}
                        aria-label={showConfirmPassword ? "Ocultar confirmação" : "Mostrar confirmação"}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="size-[1.125rem]" />
                        ) : (
                          <Eye className="size-[1.125rem]" />
                        )}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    disabled={isSubmitting}
                    className="mt-1 h-12 w-full cursor-pointer gap-2 rounded-xl bg-foreground text-[0.9375rem] font-semibold text-background shadow-sm hover:bg-foreground/90 disabled:opacity-70"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Criando conta…
                      </>
                    ) : (
                      <>
                        <UserPlus className="size-4 shrink-0 opacity-90" aria-hidden />
                        Criar conta
                      </>
                    )}
                  </Button>
                </form>

                <div className="relative my-8">
                  <div className="absolute inset-0 flex items-center" aria-hidden>
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs font-medium tracking-wide text-muted-foreground">
                    <span className="bg-background px-4">ou</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled
                  className="h-12 w-full cursor-not-allowed rounded-xl border-border bg-card text-[0.9375rem] font-medium text-card-foreground opacity-80"
                >
                  <GoogleGlyph className="size-5 shrink-0" />
                  Continuar com Google
                </Button>

                <p className="mt-9 text-center text-sm text-muted-foreground">
                  Já tem uma conta?{" "}
                  <Link href={loginHref} className="font-semibold text-foreground underline-offset-4 hover:underline">
                    Entrar
                  </Link>
                </p>
              </div>
            </div>

            <footer className="mt-auto w-full shrink-0 pt-5 pb-1 text-xs text-muted-foreground sm:pt-6 sm:pb-2">
              <div className="relative h-px w-full overflow-visible" aria-hidden>
                <div className="h-px w-full bg-gradient-to-r from-transparent via-zinc-500/22 to-transparent dark:via-white/20" />
                <div className="pointer-events-none absolute left-1/2 top-full h-2 w-[42%] -translate-x-1/2 bg-gradient-to-b from-zinc-400/8 to-transparent blur-sm dark:from-white/7" />
              </div>
              <div className="mt-5 flex w-full flex-col items-center gap-2 text-center sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-x-4 sm:gap-y-0 sm:text-left">
                <p className="inline-flex max-w-full flex-wrap items-center justify-center gap-0 text-sm text-muted-foreground sm:justify-self-start sm:justify-start">
                  <span className="shrink-0 leading-[1.4]">Copyright © {new Date().getFullYear()}</span>
                  <span className="ml-1.5 inline-flex h-3 min-w-0 -translate-y-px items-center" aria-label="RouteLAB">
                    <Image
                      src="/assets/logo/logo-dark.png"
                      alt=""
                      width={200}
                      height={56}
                      className="h-3 w-auto max-w-[4.75rem] object-contain object-left dark:hidden"
                    />
                    <Image
                      src="/assets/logo/logo-white.png"
                      alt=""
                      width={200}
                      height={56}
                      className="hidden h-3 w-auto max-w-[4.75rem] object-contain object-left dark:block"
                    />
                  </span>
                  <span className="shrink-0 pl-0.5 leading-[1.4]" aria-hidden>
                    .
                  </span>
                </p>
                <span className="flex w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 sm:w-auto sm:justify-self-center">
                  <span>Desenvolvido com</span>
                  <span className="inline-flex items-center gap-1">
                    <Heart
                      className="size-3 shrink-0 fill-red-500 text-red-500 motion-safe:animate-pulse"
                      aria-hidden
                    />
                    <span className="inline-flex items-center gap-0">
                      <span>por:&nbsp;</span>
                      <a
                        href="https://artnawebsite.com.br"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        Artnaweb
                      </a>
                    </span>
                  </span>
                </span>
                <Link
                  href="/"
                  className="block w-full hover:text-foreground sm:w-auto sm:justify-self-end sm:text-right"
                >
                  Política de privacidade
                </Link>
              </div>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
