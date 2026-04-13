"use client";

import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { getUserUiTheme, saveUserUiTheme } from "@/lib/user-settings";
import type { UserUiTheme } from "@/types/user-settings";
import { Check, Loader2, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { switchThemeWithCircularReveal } from "@/lib/theme-switch-circular";

const OPTIONS: { id: UserUiTheme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Escuro", icon: Moon },
  { id: "system", label: "Sistema", icon: Monitor },
];

function ThemeChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative flex flex-1 flex-col items-center gap-1.5 rounded-md border px-3 py-3 text-center transition-all sm:flex-row sm:justify-start sm:text-left disabled:pointer-events-none disabled:opacity-60",
        active
          ? "border-brand/45 bg-brand/12 text-foreground ring-1 ring-brand/30 dark:border-brand/50 dark:bg-brand/15 dark:text-white dark:ring-brand/25"
          : "border-border bg-background text-foreground hover:border-input hover:bg-muted dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400 dark:hover:border-white/15 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200",
      )}
    >
      {children}
    </button>
  );
}

export function AppearanceSettingsForm() {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preference, setPreference] = useState<UserUiTheme>("dark");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

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
    if (savedAt == null) return;
    const id = window.setTimeout(() => setSavedAt(null), 3200);
    return () => window.clearTimeout(id);
  }, [savedAt]);

  const selectTheme = async (mode: UserUiTheme, originEl?: HTMLElement | null) => {
    if (loading || saving) return;
    if (mode === preference && !error) return;
    const applyLocal = () => {
      setPreference(mode);
      setTheme(mode);
    };
    if ((mode === "light" || mode === "dark") && originEl) {
      await switchThemeWithCircularReveal(originEl, mode, applyLocal);
    } else {
      applyLocal();
    }
    setError(null);
    setSavedAt(null);
    if (!user) return;
    setSaving(true);
    try {
      await saveUserUiTheme(user.uid, mode);
      setSavedAt(Date.now());
    } catch (e) {
      console.error(e);
      setError("Não foi possível salvar. Escolha outra vez.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border bg-card shadow-xl overflow-hidden dark:border-white/5 dark:bg-white/[0.02]">
      <CardHeader className="space-y-2 border-b border-border pb-4 dark:border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand/10 ring-1 ring-brand/20">
            <Sun className="size-4 text-brand dark:text-brand" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-foreground dark:text-white">Aparência</CardTitle>
            <CardDescription className="text-sm text-muted-foreground leading-relaxed">
              Modo claro ou escuro no painel; a escolha guarda-se automaticamente. O link público do relatório
              também pode ser alternado pelo cliente.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
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
                    disabled={saving}
                    onClick={(e) => void selectTheme(opt.id, e.currentTarget)}
                  >
                    <Icon className="size-4 shrink-0 text-brand dark:text-brand" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{opt.label}</p>
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
            {saving ? (
              <p
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                <Loader2 className="size-3.5 shrink-0 animate-spin text-brand" aria-hidden />
                A guardar…
              </p>
            ) : null}
            {savedAt && !error && !saving ? (
              <span
                className="inline-flex max-w-full items-center gap-1.5 text-xs text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
                role="status"
                aria-live="polite"
              >
                <Check className="size-3.5 shrink-0 opacity-50 text-emerald-700 dark:text-emerald-500/80" aria-hidden />
                Preferência salva.
              </span>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
