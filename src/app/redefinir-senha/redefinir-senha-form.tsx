"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { PublicThemeToggle } from "@/components/public-theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth, isFirebaseAuthConfigured } from "@/lib/firebase";
import { cn } from "@/lib/utils";

export function RedefinirSenhaForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");
  const oobCode = searchParams.get("oobCode");

  const [phase, setPhase] = useState<"checking" | "ready" | "invalid" | "submitting">("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!isFirebaseAuthConfigured || !auth) {
      setPhase("invalid");
      return;
    }
    if (mode !== "resetPassword" || !oobCode?.trim()) {
      setPhase("invalid");
      return;
    }
    let cancelled = false;
    void verifyPasswordResetCode(auth, oobCode)
      .then((mail) => {
        if (!cancelled) {
          setEmail(mail);
          setPhase("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setPhase("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [mode, oobCode]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!oobCode?.trim() || !auth) return;
      if (password.length < 6) {
        setErrorMsg("A palavra-passe deve ter pelo menos 6 caracteres.");
        return;
      }
      setErrorMsg(null);
      setPhase("submitting");
      try {
        await confirmPasswordReset(auth, oobCode, password);
        router.replace("/login?redefinicao=ok");
      } catch {
        setPhase("ready");
        setErrorMsg("Não foi possível redefinir a palavra-passe. O link pode ter expirado ou já foi usado.");
      }
    },
    [oobCode, password, router],
  );

  if (phase === "checking") {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 bg-background px-4 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <span>A validar o link…</span>
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          Este link é inválido ou expirou. Peça uma nova redefinição de palavra-passe.
        </p>
        <Link href="/login" className={cn(buttonVariants({ variant: "outline" }))}>
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh w-full flex-col bg-background p-[max(1rem,min(3vw,2.75rem))] text-foreground sm:p-[max(1.25rem,min(3.5vw,3rem))]">
      <div className="relative mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">
        <div className="absolute top-0 right-0 z-10 sm:top-1">
          <PublicThemeToggle
            id="reset-password-theme-toggle"
            className={cn(
              "h-11 min-h-11 w-11 rounded-full border border-zinc-700/85 bg-zinc-900 shadow-none",
              "[&_svg]:!text-zinc-50",
              "transition-[background-color,border-color,box-shadow,color] duration-150",
              "hover:border-zinc-600 hover:bg-zinc-800 hover:shadow-sm",
              "focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "dark:border-zinc-300/90 dark:bg-zinc-100 dark:shadow-none dark:[&_svg]:!text-zinc-900",
              "dark:hover:border-zinc-400 dark:hover:bg-zinc-200 dark:hover:shadow-sm",
            )}
          />
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8 dark:border-white/10 dark:bg-white/[0.02]">
          <header className="mb-6 space-y-2">
            <h1 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">Nova palavra-passe</h1>
            <p className="text-sm text-muted-foreground">
              {email ? (
                <>
                  Conta <span className="font-medium text-foreground/90">{email}</span>
                </>
              ) : (
                "Defina uma nova palavra-passe para a sua conta."
              )}
            </p>
          </header>

          <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
            {errorMsg ? (
              <div
                className="rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
                role="alert"
              >
                {errorMsg}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm font-semibold text-foreground">
                Nova palavra-passe
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  disabled={phase === "submitting"}
                  className="h-12 rounded-xl border-border bg-background py-1 pr-12 pl-4 text-base text-foreground shadow-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 md:text-sm dark:border-white/10 dark:bg-white/5"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={phase === "submitting"}
                  className={cn(
                    "absolute top-1/2 right-1.5 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors",
                    "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
                  )}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="size-[1.125rem]" /> : <Eye className="size-[1.125rem]" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={phase === "submitting"}
              className="h-12 w-full gap-2 rounded-xl bg-foreground text-[0.9375rem] font-semibold text-background shadow-sm hover:bg-foreground/90 disabled:opacity-70"
            >
              {phase === "submitting" ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  A guardar…
                </>
              ) : (
                "Guardar palavra-passe"
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Voltar ao login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
