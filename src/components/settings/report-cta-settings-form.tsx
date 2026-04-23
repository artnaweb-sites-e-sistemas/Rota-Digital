"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { getUserReportCtaSettings, saveUserReportCtaSettings } from "@/lib/user-settings";
import {
  buildWhatsAppHref,
  isValidReportCtaEmail,
  maskWhatsappBRDisplay,
  normalizeWhatsappDigitsForStorage,
  onlyDigitsPhone,
} from "@/lib/report-cta";
import type { UserReportCtaMode, UserReportCtaSettings } from "@/types/user-settings";
import { Check, Link2, Loader2, Mail } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { cn } from "@/lib/utils";

const DEFAULT_FORM: UserReportCtaSettings = {
  ctaMode: "url",
  whatsappPhone: "",
  ctaUrl: "",
  ctaEmail: "",
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
        "flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold transition-all duration-200",
        active
          ? "border-brand/45 bg-brand/12 text-foreground ring-1 ring-brand/30 dark:border-brand/50 dark:bg-brand/15 dark:text-white dark:ring-brand/25"
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
  const formRef = useRef(form);
  formRef.current = form;
  const hydratedRef = useRef(false);
  const lastSavedJsonRef = useRef<string>("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getUserReportCtaSettings(user.uid);
      if (!data) {
        setForm(DEFAULT_FORM);
      } else {
        const base: UserReportCtaSettings = { ...DEFAULT_FORM, ...data };
        if (base.ctaMode === "email" && !base.ctaEmail.trim() && user.email) {
          base.ctaEmail = user.email;
        }
        setForm(base);
      }
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

  useEffect(() => {
    if (savedAt == null) return;
    const id = window.setTimeout(() => setSavedAt(null), 3200);
    return () => window.clearTimeout(id);
  }, [savedAt]);

  useEffect(() => {
    hydratedRef.current = false;
    lastSavedJsonRef.current = "";
  }, [user?.uid]);

  const buildReportCtaPayload = useCallback((f: UserReportCtaSettings): UserReportCtaSettings | null => {
    if (f.ctaMode === "whatsapp") {
      const normalized = normalizeWhatsappDigitsForStorage(f.whatsappPhone);
      if (normalized.length < 12 || !buildWhatsAppHref(normalized)) return null;
      return { ctaMode: "whatsapp", whatsappPhone: normalized, ctaUrl: "", ctaEmail: "" };
    }
    if (f.ctaMode === "email") {
      const e = f.ctaEmail.trim();
      if (e && !isValidReportCtaEmail(e)) return null;
      return { ctaMode: "email", whatsappPhone: "", ctaUrl: "", ctaEmail: e };
    }
    const t = f.ctaUrl.trim();
    if (!t) return null;
    const withProto = /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
    try {
      new URL(withProto);
    } catch {
      return null;
    }
    return { ctaMode: "url", whatsappPhone: "", ctaUrl: withProto, ctaEmail: "" };
  }, []);

  useEffect(() => {
    if (!user || loading) return;
    const f = formRef.current;
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      const initial = buildReportCtaPayload(f);
      lastSavedJsonRef.current = JSON.stringify(initial ?? f);
      return;
    }
    const payload = buildReportCtaPayload(f);
    if (!payload) return;
    const nextJson = JSON.stringify(payload);
    if (nextJson === lastSavedJsonRef.current) return;
    const t = window.setTimeout(() => {
      void (async () => {
        if (!user) return;
        const latest = formRef.current;
        const p = buildReportCtaPayload(latest);
        if (!p) return;
        const json = JSON.stringify(p);
        if (json === lastSavedJsonRef.current) return;
        setSaving(true);
        setError(null);
        try {
          await saveUserReportCtaSettings(user.uid, p);
          setForm(p);
          lastSavedJsonRef.current = json;
          setSavedAt(Date.now());
        } catch (e) {
          console.error(e);
          setSavedAt(null);
          setError("Não foi possível salvar. Tente de novo.");
        } finally {
          setSaving(false);
        }
      })();
    }, 850);
    return () => window.clearTimeout(t);
  }, [form, loading, user, buildReportCtaPayload]);

  const setMode = (ctaMode: UserReportCtaMode) => {
    setForm((f) => {
      if (ctaMode === "email" && !f.ctaEmail.trim() && user?.email) {
        return { ...f, ctaMode, ctaEmail: user.email };
      }
      return { ...f, ctaMode };
    });
    setError(null);
    setSavedAt(null);
  };

  return (
    <Card className="min-w-0 border-border bg-card shadow-xl overflow-hidden dark:border-white/5 dark:bg-white/[0.02]">
      <CardHeader className="space-y-2 border-b border-border pb-4 dark:border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand/10 ring-1 ring-brand/20">
            <Link2 className="size-4 text-brand dark:text-brand" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-foreground dark:text-white">Destino dos CTAs</CardTitle>
            <CardDescription className="text-sm text-muted-foreground leading-relaxed">
              Aplica-se aos botões do relatório (ex.: falar com especialista / agendar).
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <ModeChip active={form.ctaMode === "whatsapp"} onClick={() => setMode("whatsapp")}>
                <WhatsAppIcon className="size-4 text-brand dark:text-brand" />
                WhatsApp
              </ModeChip>
              <ModeChip active={form.ctaMode === "url"} onClick={() => setMode("url")}>
                <Link2 className="size-4 text-brand dark:text-brand" aria-hidden />
                Link
              </ModeChip>
              <ModeChip active={form.ctaMode === "email"} onClick={() => setMode("email")}>
                <Mail className="size-4 text-brand dark:text-brand" aria-hidden />
                E-mail
              </ModeChip>
            </div>

            {form.ctaMode === "whatsapp" ? (
              <div className="space-y-2">
                <Label htmlFor="wa-phone" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  WhatsApp
                </Label>
                <Input
                  id="wa-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="off"
                  name="report_cta_whatsapp"
                  data-1p-ignore
                  data-lpignore="true"
                  placeholder="+55 (11) 98765-4321"
                  value={maskWhatsappBRDisplay(form.whatsappPhone)}
                  onChange={(e) => {
                    const digits = onlyDigitsPhone(e.target.value).slice(0, 15);
                    setForm((f) => ({ ...f, whatsappPhone: digits }));
                  }}
                  className="h-11 rounded-md border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-brand/50 focus-visible:ring-brand/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                />
              </div>
            ) : null}
            {form.ctaMode === "url" ? (
              <div className="space-y-2">
                <Label htmlFor="cta-url" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  URL
                </Label>
                <Input
                  id="cta-url"
                  type="url"
                  name="report_cta_url"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  placeholder="https://…"
                  value={form.ctaUrl}
                  onChange={(e) => setForm((f) => ({ ...f, ctaUrl: e.target.value }))}
                  className="h-11 rounded-md border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-brand/50 focus-visible:ring-brand/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                />
              </div>
            ) : null}
            {form.ctaMode === "email" ? (
              <div className="space-y-2">
                <Label htmlFor="cta-email" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  E-mail
                </Label>
                <Input
                  id="cta-email"
                  type="email"
                  name="report_cta_email"
                  autoComplete="email"
                  data-1p-ignore
                  data-lpignore="true"
                  placeholder={user?.email || "seu@email.com"}
                  value={form.ctaEmail}
                  onChange={(e) => setForm((f) => ({ ...f, ctaEmail: e.target.value }))}
                  className="h-11 rounded-md border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-brand/50 focus-visible:ring-brand/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                />
                <p className="text-xs text-muted-foreground">
                  Por defeito usa o e-mail da sua conta. Pode alterar se quiser outro contacto.
                </p>
              </div>
            ) : null}

            {error ? (
              <p className="rounded-md border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-300">{error}</p>
            ) : null}
            {saving || (savedAt && !error) ? (
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {saving ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin shrink-0 text-brand" aria-hidden />
                    A guardar…
                  </span>
                ) : (
                  <span className="inline-flex max-w-full items-center gap-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
                    <Check className="size-3.5 shrink-0 text-emerald-700 dark:text-emerald-500/80" aria-hidden />
                    Guardado automaticamente.
                  </span>
                )}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
