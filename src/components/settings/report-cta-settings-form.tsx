"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { getUserReportCtaSettings, saveUserReportCtaSettings } from "@/lib/user-settings";
import {
  buildWhatsAppHref,
  maskWhatsappBRDisplay,
  normalizeWhatsappDigitsForStorage,
  onlyDigitsPhone,
} from "@/lib/report-cta";
import type { UserReportCtaMode, UserReportCtaSettings } from "@/types/user-settings";
import { Loader2, Link2 } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { cn } from "@/lib/utils";

const DEFAULT_FORM: UserReportCtaSettings = {
  ctaMode: "url",
  whatsappPhone: "",
  ctaUrl: "",
};

function ModeChip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all duration-200",
        active
          ? "border-indigo-600/45 bg-indigo-500/12 text-indigo-950 ring-1 ring-indigo-600/30 dark:border-indigo-500/50 dark:bg-indigo-500/15 dark:text-white dark:ring-indigo-500/25"
          : "border-border bg-background text-foreground hover:border-input hover:bg-muted dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400 dark:hover:border-white/15 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ReportCtaSettingsForm() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<UserReportCtaSettings>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getUserReportCtaSettings(user.uid);
      setForm(data ?? DEFAULT_FORM);
    } catch (e) {
      console.error(e);
      setError("Não foi possível carregar suas preferências.");
      setForm(DEFAULT_FORM);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const setMode = (ctaMode: UserReportCtaMode) => {
    setForm((f) => ({ ...f, ctaMode }));
    setError(null);
  };

  const handleSave = async () => {
    if (!user) return;
    setError(null);

    if (form.ctaMode === "whatsapp") {
      const normalized = normalizeWhatsappDigitsForStorage(form.whatsappPhone);
      if (normalized.length < 12 || !buildWhatsAppHref(normalized)) {
        setError("WhatsApp incompleto. Ex.: +55 (11) 98765-4321");
        return;
      }
    } else {
      const t = form.ctaUrl.trim();
      if (!t) {
        setError("Informe uma URL de destino (ex.: link do Calendly ou página de contato).");
        return;
      }
      const withProto = /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
      try {
        new URL(withProto);
      } catch {
        setError("URL inválida. Use algo como https://seusite.com/contato");
        return;
      }
    }

    setSaving(true);
    try {
      const toSave: UserReportCtaSettings =
        form.ctaMode === "whatsapp"
          ? {
              ctaMode: "whatsapp",
              whatsappPhone: normalizeWhatsappDigitsForStorage(form.whatsappPhone),
              ctaUrl: "",
            }
          : (() => {
              const t = form.ctaUrl.trim();
              const normalized = /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
              return {
                ctaMode: "url" as const,
                whatsappPhone: "",
                ctaUrl: normalized,
              };
            })();
      await saveUserReportCtaSettings(user.uid, toSave);
      setForm(toSave);
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
    <Card className="border-border bg-card shadow-xl overflow-hidden dark:border-white/5 dark:bg-white/[0.02]">
      <CardHeader className="space-y-2 pb-4 border-b border-border dark:border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
            <Link2 className="size-4 text-indigo-400" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-white">Destino dos CTAs</CardTitle>
            <CardDescription className="text-sm text-zinc-500 leading-relaxed">
              Aplica-se aos botões do relatório (ex.: falar com especialista / agendar).
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {loading ? (
          <div className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin shrink-0 text-indigo-400" aria-hidden />
            Carregando…
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <ModeChip active={form.ctaMode === "whatsapp"} onClick={() => setMode("whatsapp")}>
                <WhatsAppIcon className="size-4" />
                WhatsApp
              </ModeChip>
              <ModeChip active={form.ctaMode === "url"} onClick={() => setMode("url")}>
                <Link2 className="size-4" />
                Link
              </ModeChip>
            </div>

            {form.ctaMode === "whatsapp" ? (
              <div className="space-y-2">
                <Label htmlFor="wa-phone" className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  WhatsApp
                </Label>
                <Input
                  id="wa-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="+55 (11) 98765-4321"
                  value={maskWhatsappBRDisplay(form.whatsappPhone)}
                  onChange={(e) => {
                    const digits = onlyDigitsPhone(e.target.value).slice(0, 15);
                    setForm((f) => ({ ...f, whatsappPhone: digits }));
                  }}
                  className="h-11 rounded-xl border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-indigo-500/50 focus-visible:ring-indigo-500/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="cta-url" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  URL
                </Label>
                <Input
                  id="cta-url"
                  type="url"
                  placeholder="https://…"
                  value={form.ctaUrl}
                  onChange={(e) => setForm((f) => ({ ...f, ctaUrl: e.target.value }))}
                  className="h-11 rounded-xl border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-indigo-500/50 focus-visible:ring-indigo-500/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                />
              </div>
            )}

            {error ? (
              <p className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-300">{error}</p>
            ) : null}
            {savedAt && !error ? (
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Preferências salvas.</p>
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
                "Salvar alterações"
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
