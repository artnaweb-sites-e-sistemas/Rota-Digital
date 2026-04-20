"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Building2, Check, FileText, ImagePlus, Loader2, Lock, Repeat2, Upload } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { ProposalPlanSectionEditor } from "@/components/propostas/proposal-plan-section-editor";
import { sortPaymentMethods } from "@/components/propostas/plan-payment-methods";
import { describeManualUploadFailure, uploadUserSettingsImage } from "@/lib/evidence-storage";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normalizedSubscriptionPlanKey, planAllowsCustomLogo, type PlanKey } from "@/lib/plan-quotas";
import { PlanLimitModal, type PlanLimitModalState } from "@/components/limits/plan-limit-modal";
import { createEmptyProposalPlan } from "@/lib/proposal-plan-factory";
import { normalizeRecurringPlansForSave } from "@/lib/proposal-plan-coerce";
import { normalizeInstallmentCount } from "@/lib/proposal-plan-installments";
import {
  DEFAULT_COMPANY_ABOUT_NAME,
  resolveCompanyAboutNameForSave,
  resolveCompanyAboutSummaryForSave,
} from "@/lib/company-about-defaults";
import { getUserCompanyAboutSettings, saveUserCompanyAboutSettings } from "@/lib/user-settings";
import {
  digitsFromPhoneInput,
  maskPhoneDisplayLoose,
  normalizeWhatsappDigitsForStorage,
  onlyDigitsPhone,
} from "@/lib/report-cta";
import type { ProposalPaymentMethodId, ProposalPlan } from "@/types/proposal";
import type { UserCompanyAboutSettings } from "@/types/user-settings";
import { cn } from "@/lib/utils";

const DEFAULT_FORM: UserCompanyAboutSettings = {
  companyName: DEFAULT_COMPANY_ABOUT_NAME,
  companySummary: "",
  primaryImageUrl: "",
  secondaryImageUrl: "",
  companyPhone: "",
  whatsApp: "",
  address: "",
  websiteUrl: "",
  instagramUrl: "",
  youtubeUrl: "",
  services: "",
  defaultSpotPlans: [createEmptyProposalPlan()],
  defaultRecurringPlans: [createEmptyProposalPlan()],
};

/** Zona de pré-visualização: mesma altura fixa nos dois cartões (não depende de aspect-ratio). */
const SETTINGS_IMAGE_PREVIEW_PX = 220;

const previewBoxStyle = {
  height: SETTINGS_IMAGE_PREVIEW_PX,
  minHeight: SETTINGS_IMAGE_PREVIEW_PX,
  maxHeight: SETTINGS_IMAGE_PREVIEW_PX,
} as const;

/** Campos de nome/resumo institucional: só editáveis com plano pago (mesma regra do logo). */
function BrandingLockedOverlay({
  locked,
  onLockedClick,
  children,
}: {
  locked: boolean;
  onLockedClick: () => void;
  children: ReactNode;
}) {
  if (!locked) return <>{children}</>;
  return (
    <div className="relative w-full min-w-0">
      {children}
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/60 backdrop-blur-[1px] dark:bg-background/65">
        <Button
          type="button"
          variant="cta"
          size="sm"
          className="pointer-events-auto gap-1.5 shadow-md"
          onClick={onLockedClick}
        >
          <Lock className="size-3.5" aria-hidden />
          Bloqueado
        </Button>
      </div>
    </div>
  );
}

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
  const [planKey, setPlanKey] = useState<PlanKey>("pro");
  const [canUploadLogo, setCanUploadLogo] = useState(true);
  const [limitModalState, setLimitModalState] = useState<PlanLimitModalState | null>(null);
  const formRef = useRef(form);
  formRef.current = form;
  const hydratedRef = useRef(false);
  const lastSavedJsonRef = useRef<string>("");

  const hasAnyContent = useMemo(
    () =>
      Boolean(
        form.companyName.trim() ||
          form.companySummary.trim() ||
          form.primaryImageUrl.trim() ||
          form.secondaryImageUrl.trim() ||
          form.companyPhone.trim() ||
          form.whatsApp.trim() ||
          form.address.trim() ||
          form.websiteUrl.trim() ||
          form.instagramUrl.trim() ||
          form.youtubeUrl.trim() ||
          form.services.trim(),
      ),
    [form],
  );

  /** Nome e resumo institucional: exigem plano pago (Pro/Agency); Starter vê overlay «Bloqueado». */
  const brandingLocked = !loading && !canUploadLogo;

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      try {
        const snap = await getDoc(doc(db, "userSettings", user.uid));
        if (snap.exists()) {
          const raw = snap.data() as Record<string, unknown>;
          const key = normalizedSubscriptionPlanKey(raw.subscriptionPlan ?? raw.plan);
          setPlanKey(key);
          setCanUploadLogo(planAllowsCustomLogo(raw));
        } else {
          setPlanKey("starter");
          setCanUploadLogo(false);
        }
      } catch {
        setPlanKey("pro");
        setCanUploadLogo(true);
      }
      const data = await getUserCompanyAboutSettings(user.uid);
      if (!data) {
        setForm(DEFAULT_FORM);
      } else {
        const spot =
          data.defaultSpotPlans.length > 0 ? data.defaultSpotPlans : [createEmptyProposalPlan()];
        const recurring =
          data.defaultRecurringPlans.length > 0 ? data.defaultRecurringPlans : [createEmptyProposalPlan()];
        setForm({
          ...data,
          companyName: data.companyName.trim() || DEFAULT_COMPANY_ABOUT_NAME,
          companyPhone: onlyDigitsPhone(data.companyPhone ?? "").slice(0, 15),
          whatsApp: data.whatsApp?.trim()
            ? normalizeWhatsappDigitsForStorage(onlyDigitsPhone(data.whatsApp))
            : "",
          defaultSpotPlans: spot,
          defaultRecurringPlans: normalizeRecurringPlansForSave(recurring),
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

  useEffect(() => {
    hydratedRef.current = false;
    lastSavedJsonRef.current = "";
  }, [user?.uid]);

  const buildCompanyAboutPayload = useCallback((f: UserCompanyAboutSettings): UserCompanyAboutSettings => {
    const companyName = resolveCompanyAboutNameForSave(f.companyName);
    const companySummary = resolveCompanyAboutSummaryForSave(f.companySummary);
    return {
      companyName,
      companySummary,
      primaryImageUrl: f.primaryImageUrl.trim(),
      secondaryImageUrl: f.secondaryImageUrl.trim(),
      companyPhone: f.companyPhone.trim() ? onlyDigitsPhone(f.companyPhone).slice(0, 15) : "",
      whatsApp: f.whatsApp.trim() ? normalizeWhatsappDigitsForStorage(f.whatsApp) : "",
      address: f.address.trim(),
      websiteUrl: f.websiteUrl.trim(),
      instagramUrl: f.instagramUrl.trim(),
      youtubeUrl: f.youtubeUrl.trim(),
      services: f.services.trim(),
      defaultSpotPlans: f.defaultSpotPlans,
      defaultRecurringPlans: normalizeRecurringPlansForSave(f.defaultRecurringPlans),
    };
  }, []);

  useEffect(() => {
    if (!user || loading) return;
    const f = formRef.current;
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      const initial = buildCompanyAboutPayload(f);
      lastSavedJsonRef.current = JSON.stringify(initial);
      return;
    }
    const payload = buildCompanyAboutPayload(f);
    const nextJson = JSON.stringify(payload);
    if (nextJson === lastSavedJsonRef.current) return;
    const t = window.setTimeout(() => {
      void (async () => {
        if (!user) return;
        const latest = formRef.current;
        const p = buildCompanyAboutPayload(latest);
        const json = JSON.stringify(p);
        if (json === lastSavedJsonRef.current) return;
        setSaving(true);
        setError(null);
        try {
          await saveUserCompanyAboutSettings(user.uid, p);
          setForm({
            ...p,
            companyName: latest.companyName.trim() ? p.companyName : "",
            companySummary: latest.companySummary.trim() ? p.companySummary : "",
          });
          lastSavedJsonRef.current = json;
          setSavedAt(Date.now());
        } catch (e) {
          console.error(e);
          setError("Não foi possível salvar o bloco institucional.");
        } finally {
          setSaving(false);
        }
      })();
    }, 850);
    return () => window.clearTimeout(t);
  }, [form, loading, user, buildCompanyAboutPayload]);

  const updateDefaultPlan = useCallback(
    (kind: "spot" | "recurring", planId: string, field: keyof ProposalPlan, value: string) => {
      const key = kind === "spot" ? "defaultSpotPlans" : "defaultRecurringPlans";
      setForm((prev) => ({
        ...prev,
        [key]: prev[key].map((plan) => (plan.id === planId ? { ...plan, [field]: value } : plan)),
      }));
    },
    [],
  );

  const updateDefaultInstallments = useCallback(
    (kind: "spot" | "recurring", planId: string, count: number) => {
      const key = kind === "spot" ? "defaultSpotPlans" : "defaultRecurringPlans";
      const n = normalizeInstallmentCount(count);
      setForm((prev) => ({
        ...prev,
        [key]: prev[key].map((plan) =>
          plan.id === planId ? { ...plan, installmentCount: n, ...(n <= 1 ? { cashPrice: "" } : {}) } : plan,
        ),
      }));
    },
    [],
  );

  const updateDefaultPaymentMethods = useCallback(
    (kind: "spot" | "recurring", planId: string, methods: ProposalPaymentMethodId[]) => {
      const key = kind === "spot" ? "defaultSpotPlans" : "defaultRecurringPlans";
      const next = sortPaymentMethods(methods);
      setForm((prev) => ({
        ...prev,
        [key]: prev[key].map((plan) => (plan.id === planId ? { ...plan, paymentMethods: next } : plan)),
      }));
    },
    [],
  );

  const addDefaultPlan = useCallback((kind: "spot" | "recurring") => {
    const key = kind === "spot" ? "defaultSpotPlans" : "defaultRecurringPlans";
    setForm((prev) => ({ ...prev, [key]: [...prev[key], createEmptyProposalPlan()] }));
  }, []);

  const removeDefaultPlan = useCallback((kind: "spot" | "recurring", planId: string) => {
    const key = kind === "spot" ? "defaultSpotPlans" : "defaultRecurringPlans";
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].length <= 1 ? prev[key] : prev[key].filter((p) => p.id !== planId),
    }));
  }, []);

  const handleImageUpload = async (slot: "primary" | "secondary", file: File) => {
    if (!user) return;
    if (!canUploadLogo) {
      setLimitModalState({ kind: "logo", plan: planKey });
      return;
    }
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
                  Nome da empresa{" "}
                  <span className="font-normal normal-case text-muted-foreground/80">(opcional)</span>
                </Label>
                <BrandingLockedOverlay
                  locked={brandingLocked}
                  onLockedClick={() => setLimitModalState({ kind: "logo", plan: planKey })}
                >
                  <Input
                    id="company-about-name"
                    value={form.companyName}
                    onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))}
                    placeholder={`Vazio = “${DEFAULT_COMPANY_ABOUT_NAME}” na proposta`}
                    className="h-11"
                    disabled={brandingLocked}
                    readOnly={brandingLocked}
                    aria-describedby={brandingLocked ? "company-about-name-locked-hint" : undefined}
                  />
                </BrandingLockedOverlay>
                {brandingLocked ? (
                  <p id="company-about-name-locked-hint" className="sr-only">
                    Disponível em planos pagos. Use o botão Bloqueado para ver opções de assinatura.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="company-about-summary" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Resumo institucional{" "}
                  <span className="font-normal normal-case text-muted-foreground/80">(opcional)</span>
                </Label>
                <BrandingLockedOverlay
                  locked={brandingLocked}
                  onLockedClick={() => setLimitModalState({ kind: "logo", plan: planKey })}
                >
                  <Textarea
                    id="company-about-summary"
                    value={form.companySummary}
                    onChange={(e) => setForm((prev) => ({ ...prev, companySummary: e.target.value }))}
                    placeholder="O que a agência faz e para quem. Se deixar vazio, guardamos um resumo de apoio sobre a Rota Digital (dois parágrafos) para usar nas propostas."
                    className="min-h-40 resize-y"
                    disabled={brandingLocked}
                    readOnly={brandingLocked}
                    aria-describedby={brandingLocked ? "company-about-summary-locked-hint" : undefined}
                  />
                </BrandingLockedOverlay>
                {brandingLocked ? (
                  <p id="company-about-summary-locked-hint" className="sr-only">
                    Disponível em planos pagos. Use o botão Bloqueado para ver opções de assinatura.
                  </p>
                ) : null}
              </div>

              <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4 dark:border-white/10 dark:bg-white/[0.02]">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Contacto e presença online</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Campos opcionais. Só aparecem na proposta o que estiver preenchido.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="company-about-phone" className="text-xs font-semibold text-muted-foreground">
                      Telefone
                    </Label>
                    <Input
                      id="company-about-phone"
                      inputMode="tel"
                      autoComplete="tel"
                      value={maskPhoneDisplayLoose(form.companyPhone)}
                      onChange={(e) => {
                        const digits = onlyDigitsPhone(e.target.value).slice(0, 15);
                        setForm((prev) => ({ ...prev, companyPhone: digits }));
                      }}
                      placeholder="+55 (11) 98765-4321"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="company-about-whatsapp" className="text-xs font-semibold text-muted-foreground">
                      WhatsApp
                    </Label>
                    <Input
                      id="company-about-whatsapp"
                      inputMode="tel"
                      value={maskPhoneDisplayLoose(form.whatsApp)}
                      onChange={(e) => {
                        const digits = digitsFromPhoneInput(e.target.value).slice(0, 15);
                        setForm((prev) => ({
                          ...prev,
                          whatsApp: digits ? normalizeWhatsappDigitsForStorage(digits) : "",
                        }));
                      }}
                      placeholder="+55 (11) 98765-4321 ou wa.me/5511…"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="company-about-address" className="text-xs font-semibold text-muted-foreground">
                      Endereço
                    </Label>
                    <Textarea
                      id="company-about-address"
                      value={form.address}
                      onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                      placeholder="Morada completa ou cidade — como quiser exibir ao cliente."
                      className="min-h-20 resize-y"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="company-about-site" className="text-xs font-semibold text-muted-foreground">
                      Site
                    </Label>
                    <Input
                      id="company-about-site"
                      value={form.websiteUrl}
                      onChange={(e) => setForm((prev) => ({ ...prev, websiteUrl: e.target.value }))}
                      placeholder="https://…"
                      className="h-10"
                      autoComplete="url"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="company-about-instagram" className="text-xs font-semibold text-muted-foreground">
                      Instagram
                    </Label>
                    <Input
                      id="company-about-instagram"
                      value={form.instagramUrl}
                      onChange={(e) => setForm((prev) => ({ ...prev, instagramUrl: e.target.value }))}
                      placeholder="@perfil ou URL"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="company-about-youtube" className="text-xs font-semibold text-muted-foreground">
                      YouTube
                    </Label>
                    <Input
                      id="company-about-youtube"
                      value={form.youtubeUrl}
                      onChange={(e) => setForm((prev) => ({ ...prev, youtubeUrl: e.target.value }))}
                      placeholder="URL do canal ou vídeo"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="company-about-services" className="text-xs font-semibold text-muted-foreground">
                      Serviços
                    </Label>
                    <Textarea
                      id="company-about-services"
                      value={form.services}
                      onChange={(e) => setForm((prev) => ({ ...prev, services: e.target.value }))}
                      placeholder="Liste serviços ou áreas de atuação (várias linhas)."
                      className="min-h-24 resize-y"
                    />
                  </div>
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
            </div>

            <div className="space-y-4">
              <ProposalPlanSectionEditor
                accent="spot"
                title="Execução pontual"
                description="Modelos de planos por escopo único; copiados ao criar uma proposta nova."
                icon={FileText}
                plans={form.defaultSpotPlans}
                onChange={(planId, field, value) => updateDefaultPlan("spot", planId, field, value)}
                onInstallmentCountChange={(planId, count) => updateDefaultInstallments("spot", planId, count)}
                onPaymentMethodsChange={(planId, methods) => updateDefaultPaymentMethods("spot", planId, methods)}
                onAdd={() => addDefaultPlan("spot")}
                onRemove={(planId) => removeDefaultPlan("spot", planId)}
              />

              <ProposalPlanSectionEditor
                accent="emerald"
                title="Execução recorrente"
                description="Modelos de planos contínuos ou mensais; copiados ao criar uma proposta nova."
                icon={Repeat2}
                plans={form.defaultRecurringPlans}
                hideInstallments
                onChange={(planId, field, value) => updateDefaultPlan("recurring", planId, field, value)}
                onInstallmentCountChange={(planId, count) => updateDefaultInstallments("recurring", planId, count)}
                onPaymentMethodsChange={(planId, methods) => updateDefaultPaymentMethods("recurring", planId, methods)}
                onAdd={() => addDefaultPlan("recurring")}
                onRemove={(planId) => removeDefaultPlan("recurring", planId)}
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

            {saving || (savedAt && !error) ? (
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground" role="status" aria-live="polite">
                {saving ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin text-brand" aria-hidden />
                    A guardar…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    Guardado automaticamente.
                  </span>
                )}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
      <PlanLimitModal
        state={limitModalState}
        onClose={() => setLimitModalState(null)}
        getIdToken={user ? () => user.getIdToken() : undefined}
      />
    </Card>
  );
}
