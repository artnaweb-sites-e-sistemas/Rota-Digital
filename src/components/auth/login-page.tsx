"use client";

import { useState } from "react";
import Link from "next/link";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Eye, EyeOff, Heart, Loader2, Shield } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth, isFirebaseAuthConfigured } from "@/lib/firebase";
import { PublicThemeToggle } from "@/components/public-theme-toggle";
import Grainient from "@/components/grainient";
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

function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-11 items-center justify-center rounded-xl border border-white/15 bg-white/5",
        className
      )}
      aria-hidden
    >
      <span className="size-3 rounded-full bg-white" />
    </div>
  );
}

export function LoginPage({ passwordResetSuccess = false }: { passwordResetSuccess?: boolean } = {}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    if (!isFirebaseAuthConfigured || !auth) {
      setError("Firebase nao configurado. Defina as variaveis NEXT_PUBLIC_FIREBASE_* na Vercel.");
      setIsSubmitting(false);
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      const message =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "auth/invalid-api-key"
          ? "Chave da API Firebase invalida. Revise NEXT_PUBLIC_FIREBASE_API_KEY na Vercel."
          : "Falha no login. Verifique suas credenciais.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-svh w-full flex-col bg-background p-[max(1rem,min(3vw,2.75rem))] text-foreground sm:p-[max(1.25rem,min(3.5vw,3rem))]">
      <div className="mx-auto flex min-h-0 w-full max-w-[1450px] flex-1 flex-col">
        <div className="flex min-h-0 w-full flex-1 flex-col lg:flex-row lg:gap-x-3">
        <aside
          className="relative hidden min-h-0 w-[32%] min-w-[280px] max-w-[420px] shrink-0 flex-col justify-between overflow-hidden rounded-3xl bg-[#121217] px-10 py-12 text-white shadow-[0_24px_80px_-24px_rgba(15,23,42,0.14)] lg:flex"
          aria-label="Marca Rota Digital"
        >
          <div className="absolute inset-0 z-0 overflow-hidden rounded-3xl">
            <Grainient
              color1="#e8dcc4"
              color2="#8e7d4d"
              color3="#3d3528"
              timeSpeed={0.25}
              colorBalance={0}
              warpStrength={1}
              warpFrequency={5}
              warpSpeed={2}
              warpAmplitude={50}
              blendAngle={0}
              blendSoftness={0.05}
              rotationAmount={500}
              noiseScale={2}
              grainAmount={0.1}
              grainScale={2}
              grainAnimated={false}
              contrast={1.5}
              gamma={1}
              saturation={1}
              centerX={0}
              centerY={0}
              zoom={0.9}
              className="h-full min-h-full w-full"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 z-[1] rounded-3xl bg-gradient-to-b from-[#121217]/58 via-[#121217]/16 to-[#121217]/48" />

          <div className="relative z-10 flex flex-col gap-5 sm:gap-6">
            <span className="text-[1.05rem] font-semibold tracking-tight text-white">Rota Digital</span>
            <h1 className="pr-2 text-4xl font-bold leading-[1.12] tracking-tight text-white sm:text-5xl lg:text-[2.75rem] xl:text-6xl">
              Bem-vindo de volta!
            </h1>
          </div>

          <div className="relative z-10 rounded-2xl bg-white/[0.07] px-4 py-3.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_12px_44px_-14px_rgba(0,0,0,0.55)] backdrop-blur-2xl backdrop-saturate-150">
            <div className="flex gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/12">
                <Shield className="size-[1.15rem] text-white" strokeWidth={2} aria-hidden />
              </div>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold text-white">Plataforma 100% segura</p>
                <p className="text-xs leading-snug text-zinc-200/95">Dados totalmente protegidos</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Área do login — mesmo fundo da página (transparente até o shell externo) */}
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-transparent px-5 pt-10 pb-0 sm:px-8 lg:px-12 xl:px-16">
          <div className="absolute top-4 right-4 z-20 sm:top-5 sm:right-5">
            <PublicThemeToggle
              id="login-theme-toggle"
              className={cn(
                "h-11 min-h-11 w-11 rounded-full border border-zinc-700/85 bg-zinc-900 shadow-none",
                "[&_svg]:!text-zinc-50",
                "transition-[background-color,border-color,box-shadow,color] duration-150",
                "hover:border-zinc-600 hover:bg-zinc-800 hover:shadow-sm",
                "focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "dark:border-zinc-300/90 dark:bg-zinc-100 dark:shadow-none dark:[&_svg]:!text-zinc-900",
                "dark:hover:border-zinc-400 dark:hover:bg-zinc-200 dark:hover:shadow-sm"
              )}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-center">
          <div className="mx-auto w-full max-w-[420px]">
            {/* Cabeçalho mobile: mesma identidade da faixa */}
            <div className="mb-10 flex items-center justify-center gap-3 lg:hidden">
              <div className="flex size-11 items-center justify-center rounded-xl bg-[#121217]">
                <BrandMark className="size-10 border-0 bg-transparent" />
              </div>
              <span className="text-lg font-semibold tracking-tight text-foreground">Rota Digital</span>
            </div>

            <header className="mb-8 space-y-2 text-center lg:text-left">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Login</h2>
              <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
                Acesse a plataforma para visualizar os leads e as rotas
              </p>
            </header>

            <form onSubmit={handleLogin} className="space-y-5">
              {passwordResetSuccess ? (
                <div
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-900 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-100"
                  role="status"
                >
                  Palavra-passe atualizada. Já pode entrar com a nova senha.
                </div>
              ) : null}
              {error && (
                <div
                  className="rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold text-foreground">
                  E-mail
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Digite seu e-mail"
                  required
                  autoComplete="email"
                  disabled={isSubmitting}
                  className="h-12 rounded-xl border-border bg-card px-4 text-base text-foreground shadow-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 md:text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold text-foreground">
                  Senha
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    required
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    className="h-12 rounded-xl border-border bg-card py-1 pr-12 pl-4 text-base text-foreground shadow-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 md:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={isSubmitting}
                    className={cn(
                      "absolute top-1/2 right-1.5 flex size-10 min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors",
                      "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                    )}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="size-[1.125rem]" /> : <Eye className="size-[1.125rem]" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5 text-sm">
                <label className="flex cursor-pointer items-center gap-2.5 text-muted-foreground select-none">
                  <input
                    type="checkbox"
                    name="remember"
                    disabled={isSubmitting}
                    className="size-4 shrink-0 cursor-pointer rounded border-input text-foreground accent-foreground"
                  />
                  <span>Lembrar de mim</span>
                </label>
                <button
                  type="button"
                  className="cursor-pointer font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  Esqueceu a senha?
                </button>
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting}
                className="mt-1 h-12 w-full cursor-pointer rounded-xl bg-foreground text-[0.9375rem] font-semibold text-background shadow-sm hover:bg-foreground/90 disabled:opacity-70"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Entrando…
                  </>
                ) : (
                  "Entrar"
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
              Não tem uma conta?{" "}
              <Link
                href="/"
                className="font-semibold text-foreground underline-offset-4 hover:underline"
              >
                Cadastre-se
              </Link>
            </p>
          </div>
          </div>

          <footer className="mt-auto grid w-full shrink-0 grid-cols-1 gap-2 border-t border-border pt-5 pb-1 text-xs text-muted-foreground sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-x-4 sm:gap-y-0 sm:pt-6 sm:pb-2">
            <span className="text-left sm:justify-self-start">
              Copyright © {new Date().getFullYear()} Rota Digital.
            </span>
            <span className="mx-auto flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 sm:mx-0 sm:justify-self-center">
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
            <Link href="/" className="justify-self-end text-right hover:text-foreground">
              Política de privacidade
            </Link>
          </footer>
        </main>
        </div>
      </div>
    </div>
  );
}
