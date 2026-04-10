"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { getUserUiTheme, saveUserUiTheme } from "@/lib/user-settings";
import type { UserUiTheme } from "@/types/user-settings";
import { Loader2, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS: { id: UserUiTheme; label: string; hint: string; icon: typeof Sun }[] = [
  { id: "light", label: "Claro", hint: "Fundo claro, texto escuro", icon: Sun },
  { id: "dark", label: "Escuro", hint: "Igual ao painel atual", icon: Moon },
  { id: "system", label: "Sistema", hint: "Segue o dispositivo", icon: Monitor },
];

function ThemeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex flex-1 flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center transition-all sm:flex-row sm:justify-start sm:text-left",
        active
          ? "border-indigo-600/45 bg-indigo-500/12 text-indigo-950 ring-1 ring-indigo-600/30 dark:border-indigo-500/50 dark:bg-indigo-500/15 dark:text-white dark:ring-indigo-500/25"
          : "border-border bg-background text-foreground hover:border-input hover:bg-muted dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400 dark:hover:border-white/15 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200",
      )}
    >
      {children}
    </button>
  );
}

export function AppearanceSettingsForm() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
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

  const apply = (mode: UserUiTheme) => {
    setPreference(mode);
    setTheme(mode);
    setError(null);
    setSavedAt(null);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await saveUserUiTheme(user.uid, preference);
      setTheme(preference);
      setSavedAt(Date.now());
    } catch (e) {
      console.error(e);
      setSavedAt(null);
      setError("Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-white/5 bg-white/[0.02] shadow-xl overflow-hidden">
      <CardHeader className="space-y-2 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
            <Sun className="size-4 text-indigo-400" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-foreground dark:text-white">Aparência</CardTitle>
            <CardDescription className="text-sm text-muted-foreground leading-relaxed">
              Modo claro ou escuro no painel. O link público do relatório também pode ser alternado pelo
              cliente.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {loading ? (
          <div className="flex items-center gap-3 py-10 text-sm text-zinc-500">
            <Loader2 className="size-5 animate-spin shrink-0 text-indigo-400" aria-hidden />
            Carregando…
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              {OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = preference === opt.id;
                return (
                  <ThemeChip key={opt.id} active={active} onClick={() => apply(opt.id)}>
                    <Icon className="size-4 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="text-xs font-normal text-muted-foreground">{opt.hint}</p>
                    </div>
                  </ThemeChip>
                );
              })}
            </div>
            <p className="text-xs text-zinc-500">
              Ativo agora (pré-visualização):{" "}
              <span className="font-medium text-zinc-300">
                {theme === "system" ? "Sistema" : theme === "light" ? "Claro" : "Escuro"}
              </span>
            </p>
            {error ? (
              <p className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-300">
                {error}
              </p>
            ) : null}
            {savedAt && !error ? (
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Preferência salva.</p>
            ) : null}
            <Button
              type="button"
              className="w-full gap-2 rounded-xl bg-indigo-600 font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 sm:w-auto"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
                  Salvando…
                </>
              ) : (
                "Salvar aparência"
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
