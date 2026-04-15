"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, ImagePlus, Loader2, Upload } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { describeManualUploadFailure, uploadUserSettingsImage } from "@/lib/evidence-storage";
import { getUserCompanyAboutSettings, saveUserCompanyAboutSettings } from "@/lib/user-settings";
import type { UserCompanyAboutSettings } from "@/types/user-settings";
import { cn } from "@/lib/utils";

const DEFAULT_FORM: UserCompanyAboutSettings = {
  companyName: "Rota Digital",
  companySummary: "",
  primaryImageUrl: "",
  secondaryImageUrl: "",
};

/** Zona de pré-visualização: mesma altura fixa nos dois cartões (não depende de aspect-ratio). */
const SETTINGS_IMAGE_PREVIEW_PX = 220;

const previewBoxStyle = {
  height: SETTINGS_IMAGE_PREVIEW_PX,
  minHeight: SETTINGS_IMAGE_PREVIEW_PX,
  maxHeight: SETTINGS_IMAGE_PREVIEW_PX,
} as const;

function SettingsImageCard({
  title,
  description,
  imageUrl,
  onPickFile,
  busy,
  variant,
}: {
  title: string;
  description: string;
  imageUrl?: string;
  onPickFile: (file: File) => void;
  busy: boolean;
  variant: "logo" | "cover";
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isLogo = variant === "logo";

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col gap-3 rounded-xl border border-border bg-background/70 p-4 dark:border-white/10 dark:bg-white/[0.03]",
        isLogo ? "mx-auto w-full max-w-[260px] lg:mx-0 lg:justify-self-start" : "min-w-0 w-full",
      )}
    >
      <div className="min-h-[5rem] shrink-0 space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "group relative box-border shrink-0 flex cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/40 transition-colors",
          "hover:border-brand/35 hover:bg-muted/70 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-brand/35 dark:hover:bg-white/[0.06]",
          isLogo ? "mx-auto w-[220px] max-w-full" : "w-full",
        )}
        style={{
          ...previewBoxStyle,
          ...(!isLogo ? { width: "100%" } : {}),
        }}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            className="object-cover"
            sizes={isLogo ? `${SETTINGS_IMAGE_PREVIEW_PX}px` : "(max-width: 1024px) 100vw, min(960px, 90vw)"}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <ImagePlus className="size-6" aria-hidden />
            <span className="text-xs font-medium">Adicionar imagem</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/55 px-3 py-1.5 text-xs font-semibold text-white shadow-sm backdrop-blur-sm">
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Upload className="size-3.5" aria-hidden />}
          {busy ? "Enviando…" : "Trocar"}
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPickFile(file);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}

export function CompanyAboutSettingsForm() {
  const { user } = useAuth();
  const [form, setForm] = useState<UserCompanyAboutSettings>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<"primary" | "secondary" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const hasAnyContent = useMemo(
    () =>
      Boolean(
        form.companyName.trim() ||
          form.companySummary.trim() ||
          form.primaryImageUrl.trim() ||
          form.secondaryImageUrl.trim(),
      ),
    [form],
  );

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getUserCompanyAboutSettings(user.uid);
      if (!data) {
        setForm(DEFAULT_FORM);
      } else {
        setForm({
          ...data,
          companyName: data.companyName.trim() || DEFAULT_FORM.companyName,
        });
      }
    } catch (e) {
      console.error(e);
      setForm(DEFAULT_FORM);
      setError("Não foi possível carregar o bloco Sobre a Empresa.");
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

  const handleImageUpload = async (slot: "primary" | "secondary", file: File) => {
    if (!user) return;
    setUploadingSlot(slot);
    setError(null);
    try {
      const result = await uploadUserSettingsImage({
        file,
        userId: user.uid,
        slotLabel: slot === "primary" ? "company-about-primary" : "company-about-secondary",
      });
      if (!result.ok) {
        setError(describeManualUploadFailure(result));
        return;
      }
      setForm((prev) => ({
        ...prev,
        primaryImageUrl: slot === "primary" ? result.url : prev.primaryImageUrl,
        secondaryImageUrl: slot === "secondary" ? result.url : prev.secondaryImageUrl,
      }));
    } catch (e) {
      console.error(e);
      setError("Não foi possível enviar a imagem agora.");
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    const companyName = form.companyName.trim();
    const companySummary = form.companySummary.trim();
    if (!companyName) {
      setError("Informe o nome da empresa/agência.");
      return;
    }
    if (!companySummary) {
      setError("Escreva um resumo curto sobre a empresa.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload: UserCompanyAboutSettings = {
        companyName,
        companySummary,
        primaryImageUrl: form.primaryImageUrl.trim(),
        secondaryImageUrl: form.secondaryImageUrl.trim(),
      };
      await saveUserCompanyAboutSettings(user.uid, payload);
      setForm(payload);
      setSavedAt(Date.now());
    } catch (e) {
      console.error(e);
      setError("Não foi possível salvar o bloco institucional.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="overflow-hidden border-border bg-card shadow-xl dark:border-white/5 dark:bg-white/[0.02]">
      <CardHeader className="space-y-2 border-b border-border pb-4 dark:border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand/10 ring-1 ring-brand/20">
            <Building2 className="size-4 text-brand" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-foreground dark:text-white">Sobre a Empresa</CardTitle>
            <CardDescription className="text-sm leading-relaxed text-muted-foreground">
              Este conteúdo vai aparecer nas propostas para transmitir confiança e profissionalismo.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {loading ? (
          <div className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-brand" aria-hidden />
            Carregando…
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company-about-name" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Nome da empresa
                </Label>
                <Input
                  id="company-about-name"
                  value={form.companyName}
                  onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))}
                  placeholder="Ex.: Rota Digital"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company-about-summary" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Resumo institucional
                </Label>
                <Textarea
                  id="company-about-summary"
                  value={form.companySummary}
                  onChange={(e) => setForm((prev) => ({ ...prev, companySummary: e.target.value }))}
                  placeholder="Explique em poucas linhas o que a sua agência faz, para quem e qual diferencial entrega."
                  className="min-h-40 resize-y"
                />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)] lg:items-stretch">
              <SettingsImageCard
                variant="logo"
                title="Logo da agência"
                description="Identidade visual principal da agência"
                imageUrl={form.primaryImageUrl}
                busy={uploadingSlot === "primary"}
                onPickFile={(file) => void handleImageUpload("primary", file)}
              />
              <SettingsImageCard
                variant="cover"
                title="Capa"
                description="Opcional. Imagem de capa ou destaque visual na proposta."
                imageUrl={form.secondaryImageUrl}
                busy={uploadingSlot === "secondary"}
                onPickFile={(file) => void handleImageUpload("secondary", file)}
              />
            </div>

            {!hasAnyContent ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/35 px-4 py-3 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]">
                Preencha este bloco uma vez e ele será usado como base nas novas propostas.
              </div>
            ) : null}

            {error ? (
              <p className="rounded-md border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-300">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="cta" size="lg" className="gap-2" onClick={() => void handleSave()} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {saving ? "Salvando…" : "Salvar informações"}
              </Button>
              {savedAt && !error ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
                  <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  Informações salvas.
                </span>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
