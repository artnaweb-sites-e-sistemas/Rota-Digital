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
        "flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "border-violet-500/70 bg-violet-500/15 text-foreground"
          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

export default function SettingsPage() {
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
        form.ctaMode === "whatsapp" ?
          {
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
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Botões nos relatórios: WhatsApp ou um link.</p>
      </div>

      <Card className="border-border shadow-none">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-base font-medium">Destino dos CTAs</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Aplica-se aos botões do relatório (ex.: falar com especialista / agendar).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-0">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
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
                <div className="space-y-1.5">
                  <Label htmlFor="wa-phone" className="text-xs text-muted-foreground">
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
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="cta-url" className="text-xs text-muted-foreground">
                    URL
                  </Label>
                  <Input
                    id="cta-url"
                    type="url"
                    placeholder="https://…"
                    value={form.ctaUrl}
                    onChange={(e) => setForm((f) => ({ ...f, ctaUrl: e.target.value }))}
                  />
                </div>
              )}

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {savedAt && !error ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">Salvo.</p>
              ) : null}

              <Button
                type="button"
                className="w-full gap-2 sm:w-auto"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
                    Salvando…
                  </>
                ) : (
                  "Salvar"
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
