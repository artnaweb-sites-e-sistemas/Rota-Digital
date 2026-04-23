"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { switchThemeCircularFromElement } from "@/lib/theme-switch-animation";
import { getUserUiTheme, saveUserUiTheme } from "@/lib/user-settings";
import type { UserUiTheme } from "@/types/user-settings";
import { Loader2, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS: { id: UserUiTheme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Escuro", icon: Moon },
  { id: "system", label: "Sistema", icon: Monitor },
];

function ThemeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex flex-1 flex-col items-center gap-1.5 overflow-hidden rounded-md border px-3 py-3 text-center sm:flex-row sm:justify-start sm:text-left",
        active
          ? "border-brand/45 bg-brand/12 text-foreground ring-1 ring-brand/30 dark:border-brand/50 dark:bg-brand/15 dark:text-white dark:ring-brand/25"
          : "border-border bg-background text-foreground hover:border-input hover:bg-muted dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400 dark:hover:border-white/15 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200",
      )}
    >
      <span className="relative z-[1] flex w-full flex-col items-center gap-1.5 sm:flex-row sm:justify-start sm:text-left">
        {children}
      </span>
    </button>
  );
}

export function AppearanceSettingsForm() {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preference, setPreference] = useState<UserUiTheme>("dark");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const stored = await getUserUiTheme(user.uid);
      const next = stored ?? "dark";
      setPreference(next);
      setTheme(next);
    } catch (e) {
      console.error(e);
      setError("Não foi possível carregar a aparência.");
    } finally {
      setLoading(false);
    }
    // Não depender de `setTheme`: no next-themes a referência pode mudar ao alternar tema e
    // dispararia um novo load, revertendo "Claro" para o valor ainda salvo no Firestore.
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const selectTheme = (mode: UserUiTheme, trigger?: Element) => {
    if (loading) return;
    if (mode === preference && !error) return;

    const apply = () => {
      setPreference(mode);
      setTheme(mode);
    };

    if (reduceMotion || !trigger) {
      apply();
    } else {
      switchThemeCircularFromElement({
        switchThemeFunction: apply,
        element: trigger,
        disableAnimation: reduceMotion,
      });
    }

    setError(null);
    if (!user) return;
    void saveUserUiTheme(user.uid, mode).catch((e) => {
      console.error(e);
      setError("Não foi possível salvar. Escolha outra vez.");
    });
  };

  return (
    <Card className="min-w-0 border-border bg-card shadow-xl overflow-hidden dark:border-white/5 dark:bg-white/[0.02]">
      <CardHeader className="space-y-2 border-b border-border pb-4 dark:border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand/10 ring-1 ring-brand/20">
            <Sun className="size-4 text-brand dark:text-brand" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-foreground dark:text-white">Aparência</CardTitle>
            <CardDescription className="text-sm text-muted-foreground leading-relaxed">
              Tema claro, escuro ou o do dispositivo no painel. A escolha fica na sua conta.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {loading ? (
          <div className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin shrink-0 text-brand" aria-hidden />
            Carregando…
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              {OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = preference === opt.id;
                return (
                  <ThemeChip
                    key={opt.id}
                    active={active}
                    onClick={(e) => selectTheme(opt.id, e.currentTarget)}
                  >
                    <span className="inline-flex shrink-0 text-brand dark:text-brand">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          active ? "opacity-100" : "opacity-[0.82]",
                        )}
                      >
                        {opt.label}
                      </p>
                    </div>
                  </ThemeChip>
                );
              })}
            </div>
            {error ? (
              <p className="rounded-md border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-300">
                {error}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
