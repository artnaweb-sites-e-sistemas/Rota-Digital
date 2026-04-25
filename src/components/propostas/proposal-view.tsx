"use client";

import Image from "next/image";
import { doc, getDoc } from "firebase/firestore";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  AtSign,
  FileText,
  Globe,
  ImagePlus,
  ListChecks,
  Loader2,
  MapPin,
  Mail,
  MessageCircle,
  Minus,
  Pencil,
  Phone,
  PlayCircle,
  Plus,
  RefreshCw,
  Trash2,
  Save,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PaymentLinksPanel } from "@/components/propostas/payment-links-panel";
import { PlanPriceHero } from "@/components/propostas/plan-installment-summary";
import { DeliverablesFormatHint } from "@/components/propostas/deliverables-format-hint";
import { PlanPaymentMethodsChips, PlanPaymentMethodsPicker, normalizePlanPaymentMethods, sortPaymentMethods } from "@/components/propostas/plan-payment-methods";
import {
  DEFAULT_COMPANY_ABOUT_NAME,
  resolveCompanyAboutNameForDisplay,
  resolveCompanyAboutSummaryForDisplay,
  resolveCompanyPrimaryImageForDisplay,
  resolveCompanySecondaryImageForDisplay,
} from "@/lib/company-about-defaults";
import type { Lead } from "@/types/lead";
import type { Proposal, ProposalAgencySnapshot, ProposalLeadSnapshot, ProposalPlan } from "@/types/proposal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardSpotlight } from "@/components/ui/card-spotlight";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  formatCurrencyInput,
  normalizePriceForCurrencyInput,
  parseCurrencyInputToCents,
} from "@/lib/currency-brl-input";
import { DEFAULT_PROPOSAL_NEXT_STEPS } from "@/lib/proposal-default-next-steps";
import { createEmptyProposalPlan, planLooksEmpty } from "@/lib/proposal-plan-factory";
import { PROPOSAL_PLAN_MAX_INSTALLMENTS, normalizeInstallmentCount } from "@/lib/proposal-plan-installments";
import { parsePlanDeliverablesForDisplay } from "@/lib/proposal-plan-deliverables-display";
import { cn } from "@/lib/utils";
import { proposalPlanPromoBadgeClassName } from "@/lib/proposal-floating-badges";
import { getLead } from "@/lib/leads";
import {
  proposalLeadSnapshotFromLead,
  proposalLeadSnapshotsDiffer,
  proposalTitleIfDefaultForCompany,
} from "@/lib/proposal-lead-from-source";
import { updateProposal } from "@/lib/proposals";
import { describeManualUploadFailure, uploadUserProposalImage } from "@/lib/evidence-storage";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useAuth } from "@/lib/auth-context";
import { PlanLimitModal, type PlanLimitModalState } from "@/components/limits/plan-limit-modal";
import { normalizedSubscriptionPlanKey, planAllowsCustomLogo, type PlanKey } from "@/lib/plan-quotas";
import { getUserCompanyAboutSettings, getUserReportCtaSettings } from "@/lib/user-settings";
import { maskPhoneDisplayLoose, resolveReportCtas, type ResolvedReportCta } from "@/lib/report-cta";
import type { UserCompanyAboutSettings, UserReportCtaSettings } from "@/types/user-settings";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { PublicThemeToggle } from "@/components/public-theme-toggle";
import { PublicThemeToggleHint } from "@/components/public-theme-toggle-hint";

type ProposalViewProps = {
  proposal: Proposal;
  variant: "dashboard" | "public";
  onProposalChange?: (proposal: Proposal) => void;
  /** Página pública: CTA resolvido no servidor. Dashboard: opcional (carrega no cliente). */
  reportCta?: ResolvedReportCta;
};

/** Fallback na UI (propostas antigas sem `nextSteps` no documento). */
const PROPOSAL_NEXT_STEPS_COPY = DEFAULT_PROPOSAL_NEXT_STEPS;

/** Topo alinhado ao conteúdo; base mais contida (evita “vazio” em baixo). */
const PROPOSAL_NEXT_STEPS_CARD_BOX = "pt-6 sm:pt-7 pb-4 sm:pb-5";

/** Texto do botão na proposta: foco em contacto (o `href` continua o das configurações / relatório). */
function proposalNextStepsCtaCopy(bottom: ResolvedReportCta["bottom"]): {
  label: string;
  title: string;
  ariaLabel: string;
} {
  if (bottom.useWhatsAppIcon) {
    return {
      label: "Falar conosco no WhatsApp",
      title: "Abre o WhatsApp para conversarmos sobre a proposta",
      ariaLabel: "Falar conosco pelo WhatsApp sobre esta proposta",
    };
  }
  if (bottom.href.trim().toLowerCase().startsWith("mailto:")) {
    return {
      label: "Entrar em contato por e-mail",
      title: "Enviar mensagem por e-mail sobre a proposta",
      ariaLabel: "Entrar em contato por e-mail sobre esta proposta",
    };
  }
  return {
    label: "Entrar em contato",
    title: "Abre o link para conversarmos sobre a proposta",
    ariaLabel: "Entrar em contato sobre esta proposta",
  };
}

function ProposalSectionHeaderIcon({ Icon, tone = "indigo" }: { Icon: LucideIcon; tone?: "indigo" | "neutral" }) {
  return (
    <div
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
        tone === "indigo" && "border-brand/30 bg-brand/10 text-brand dark:text-brand",
        tone === "neutral" && "border-border bg-muted text-muted-foreground",
      )}
    >
      <Icon size={14} aria-hidden />
    </div>
  );
}

function ProposalNextStepsSpotlight({
  stepsForList,
  leadEmail,
  bottomCta,
  isDashboard,
  editing,
  saving,
  onStartEdit,
  onCancel,
  onSave,
  onDraftChange,
  onAddStep,
  onRemoveStep,
}: {
  stepsForList: string[];
  leadEmail: string;
  bottomCta: ResolvedReportCta["bottom"];
  isDashboard: boolean;
  editing: boolean;
  saving: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
  onDraftChange: (index: number, value: string) => void;
  onAddStep: () => void;
  onRemoveStep: (index: number) => void;
}) {
  const mail = leadEmail.trim();
  const mailtoHref = mail
    ? `mailto:${encodeURIComponent(mail)}?subject=${encodeURIComponent("Re: Proposta personalizada")}`
    : undefined;

  const ctaCopy = proposalNextStepsCtaCopy(bottomCta);

  return (
    <CardSpotlight
      className={cn(
        "scroll-mt-6 w-full print:border-zinc-200 print:bg-white",
        PROPOSAL_NEXT_STEPS_CARD_BOX,
      )}
    >
      <Card
        id="proposal-proximos-passos"
        className="relative border-0 !bg-transparent py-0 shadow-none ring-0 print:bg-white"
      >
        <div>
          <CardHeader className="px-4 pb-6 pt-0 sm:px-7 sm:pb-7 sm:pt-0">
            <div className="flex items-center gap-2.5">
              <ProposalSectionHeaderIcon Icon={ArrowRight} tone="indigo" />
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground/78 dark:text-muted-foreground">
                Próximos passos
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-0 sm:px-7">
            <div className="space-y-3">
              {stepsForList.length === 0 && editing ? (
                <p className="text-sm text-muted-foreground">Sem passos — use «Adicionar passo».</p>
              ) : null}
              {stepsForList.map((step, i) => (
                <div key={i} className="group/step relative min-w-0 w-full pl-3 sm:pl-4">
                  <div
                    className={cn(
                      "relative min-w-0 rounded-md border border-l-transparent bg-card/80 py-4 pl-8 pr-4 sm:pr-6",
                      editing && "pr-12 sm:pr-14",
                      "transition-[border-color,box-shadow] duration-300",
                      // Modo claro: mesma borda/sombra que antes só no hover
                      "border-brand/45 shadow-md shadow-brand/5",
                      // Modo escuro: neutro até hover
                      "dark:border-border dark:bg-secondary/60 dark:shadow-sm",
                      "dark:group-hover/step:border-brand/35 dark:group-hover/step:shadow-md dark:group-hover/step:shadow-brand/5",
                      "before:pointer-events-none before:absolute before:-left-[20px] before:top-1/2 before:h-10 before:w-6 before:-translate-y-full before:rounded-br-md before:border-b before:border-brand/45 before:content-[''] dark:before:border-border dark:group-hover/step:before:border-brand/45",
                      "after:pointer-events-none after:absolute after:-left-[20px] after:top-1/2 after:h-10 after:w-6 after:rounded-tr-md after:border-t after:border-brand/45 after:content-[''] dark:after:border-border dark:group-hover/step:after:border-brand/45",
                    )}
                  >
                    <div className="absolute -left-[21px] top-1/2 z-30 -translate-y-1/2">
                      <div className="relative size-11 rounded-full bg-card transition-transform duration-300 group-hover/step:scale-110 dark:bg-zinc-950">
                        <div
                          className="pointer-events-none absolute inset-0 overflow-hidden [clip-path:inset(0_0_0_50%)]"
                          aria-hidden
                        >
                          <div
                            className={cn(
                              "absolute left-1/2 top-1/2 size-11 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/50 bg-card shadow-sm shadow-brand/20",
                              "dark:border-zinc-600/80 dark:bg-zinc-950 dark:shadow-sm",
                              "transition-[border-color,box-shadow] duration-300 dark:group-hover/step:border-brand/50 dark:group-hover/step:shadow-brand/20",
                            )}
                          />
                        </div>
                        <div
                          className={cn(
                            "absolute left-1/2 top-1/2 z-10 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-brand/30 bg-card text-[13px] font-black tabular-nums text-brand",
                            "dark:border-brand/35 dark:bg-zinc-900",
                          )}
                        >
                          {i + 1}
                        </div>
                      </div>
                    </div>
                    {editing ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={saving}
                        onClick={() => onRemoveStep(i)}
                        className="no-print absolute right-2 top-2 z-20 size-8 text-muted-foreground hover:text-destructive"
                        aria-label="Remover passo"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    ) : null}
                    <div className="min-w-0">
                      {editing ? (
                        <Textarea
                          value={step}
                          onChange={(e) => onDraftChange(i, e.target.value)}
                          disabled={saving}
                          rows={3}
                          className="min-h-[4.5rem] resize-y text-[14.5px] leading-relaxed"
                          aria-label={`Texto do passo ${i + 1}`}
                        />
                      ) : (
                        <p className="m-0 text-[14.5px] leading-relaxed text-foreground">{step}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {editing ? (
              <div className="no-print mt-4 flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={saving}
                  onClick={onAddStep}
                  className="shrink-0 text-muted-foreground/75 hover:bg-muted/50 hover:text-foreground"
                  aria-label="Adicionar passo"
                >
                  <Plus className="size-3.5" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="cta"
                  size="sm"
                  className="gap-1.5"
                  disabled={saving}
                  onClick={() => void onSave()}
                >
                  {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                  Salvar
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={saving} onClick={onCancel}>
                  <X className="size-4" aria-hidden />
                  Cancelar
                </Button>
              </div>
            ) : null}
          </CardContent>
        </div>
        <div
          id="proposal-chamada-acao"
          className="scroll-mt-6 mt-3 box-border w-full min-w-0 max-w-full shrink-0 space-y-2 px-5 pb-0 pt-0 sm:mt-4 sm:px-7"
        >
          <a
            href={bottomCta.href}
            {...(bottomCta.openInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            title={ctaCopy.title}
            aria-label={ctaCopy.ariaLabel}
            className={cn(
              buttonVariants({ variant: "ctaMotionGreen", size: "lg" }),
              "no-print box-border h-10 min-h-10 items-center justify-center gap-2 overflow-hidden px-4 md:px-5",
              "flex w-full min-w-0 max-w-full md:inline-flex md:w-auto md:max-w-none md:shrink-0",
            )}
          >
            {bottomCta.useWhatsAppIcon ? (
              <WhatsAppIcon className="size-4 shrink-0" />
            ) : bottomCta.useMailIcon ? (
              <Mail className="size-4 shrink-0" aria-hidden />
            ) : (
              <Calendar className="size-4 shrink-0" aria-hidden />
            )}
            {ctaCopy.label}
          </a>
          {mailtoHref ? (
            <p className="no-print m-0 text-center text-sm text-muted-foreground">
              <a href={mailtoHref} className="font-medium text-brand underline-offset-4 hover:underline">
                Responder por e-mail
              </a>
            </p>
          ) : null}
        </div>
        {isDashboard && !editing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={saving}
            onClick={onStartEdit}
            className="no-print absolute bottom-3 right-4 z-[6] size-8 rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-foreground sm:bottom-4 sm:right-7"
            aria-label="Editar próximos passos"
          >
            <Pencil className="size-3.5" aria-hidden />
          </Button>
        ) : null}
      </Card>
    </CardSpotlight>
  );
}

/** Raios da vista da proposta (mais contidos que antes). */
const RR = {
  btn: "rounded-lg",
  stat: "rounded-lg",
  panel: "rounded-xl",
  logoMark: "rounded-md",
} as const;

function getInitials(value: string): string {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "RD";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function formatDate(value: number): string {
  if (!value) return "Não definido";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** Texto da validade restante; o número usa algarismos tabulares quando aplicável. */
function remainingValidityDisplay(validUntilDate: number): ReactNode {
  if (!validUntilDate) return "Não definido";

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const end = new Date(validUntilDate);
  end.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return "Expirada";
  if (diffDays === 0) return "Vence hoje";
  if (diffDays === 1) {
    return (
      <>
        <span className="tabular-nums">1</span>
        <span className="text-muted-foreground"> dia</span>
      </>
    );
  }
  return (
    <>
      <span className="tabular-nums">{diffDays}</span>
      <span className="text-muted-foreground"> dias</span>
    </>
  );
}

function splitReadableParagraphs(value: string): string[] {
  const text = value.trim();
  if (!text) return [];

  const byLineBreak = text
    .split(/\n{2,}|\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (byLineBreak.length > 1) return byLineBreak;

  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((item) => item.trim()).filter(Boolean) ?? [text];
  if (sentences.length <= 2) return [text];

  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(sentences.slice(index, index + 2).join(" "));
  }
  return paragraphs;
}

function telHrefFromDisplay(raw: string): string | undefined {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 5) return undefined;
  const compact = raw.replace(/[^\d+]/g, "");
  return `tel:${compact || digits}`;
}

function hrefIfWebsite(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function hrefIfInstagram(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  if (/^https?:\/\//i.test(t)) return t;
  const h = t.replace(/^@/, "").replace(/^instagram\.com\/?/i, "").replace(/^\//, "");
  if (!h) return undefined;
  return `https://instagram.com/${h}`;
}

function hrefIfYoutube(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

function hrefIfWhatsapp(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  if (/^https?:\/\//i.test(t)) return t;
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 10) return `https://wa.me/${digits}`;
  return undefined;
}

type AgencyContactRow = {
  key: string;
  label: string;
  icon: typeof Phone;
  value: string;
  href?: string;
  external?: boolean;
  multiline?: boolean;
  /** Serviços: lista para exibir em tópicos (cor de marca). */
  topicLines?: string[];
};

function buildAgencyContactRows(
  snap: ProposalAgencySnapshot,
  live: UserCompanyAboutSettings | null,
  isDashboard: boolean,
): AgencyContactRow[] {
  /** Com configurações carregadas no dashboard, vazio nas Configurações = não mostrar (não voltar ao snapshot antigo). */
  const pick = (liveVal?: string | null, snapVal?: string | null) =>
    isDashboard && live ? (liveVal ?? "").trim() : (snapVal ?? "").trim();

  const phone = pick(live?.companyPhone, snap.companyPhone);
  const whatsApp = pick(live?.whatsApp, snap.whatsApp);
  const address = pick(live?.address, snap.address);
  const websiteUrl = pick(live?.websiteUrl, snap.websiteUrl);
  const instagramUrl = pick(live?.instagramUrl, snap.instagramUrl);
  const youtubeUrl = pick(live?.youtubeUrl, snap.youtubeUrl);
  const services = pick(live?.services, snap.services);

  const rows: AgencyContactRow[] = [];
  if (phone) {
    rows.push({
      key: "phone",
      label: "Telefone",
      icon: Phone,
      value: maskPhoneDisplayLoose(phone),
      href: telHrefFromDisplay(phone),
    });
  }
  if (whatsApp) {
    const href = hrefIfWhatsapp(whatsApp);
    rows.push({
      key: "whatsapp",
      label: "WhatsApp",
      icon: MessageCircle,
      value: maskPhoneDisplayLoose(whatsApp),
      href,
      external: Boolean(href?.startsWith("http")),
    });
  }
  if (address) {
    rows.push({
      key: "address",
      label: "Endereço",
      icon: MapPin,
      value: address,
      multiline: true,
    });
  }
  if (websiteUrl) {
    const href = hrefIfWebsite(websiteUrl);
    rows.push({
      key: "site",
      label: "Site",
      icon: Globe,
      value: websiteUrl,
      href,
      external: true,
    });
  }
  if (instagramUrl) {
    const href = hrefIfInstagram(instagramUrl);
    rows.push({
      key: "instagram",
      label: "Instagram",
      icon: AtSign,
      value: instagramUrl,
      href,
      external: true,
    });
  }
  if (youtubeUrl) {
    const href = hrefIfYoutube(youtubeUrl);
    rows.push({
      key: "youtube",
      label: "YouTube",
      icon: PlayCircle,
      value: youtubeUrl,
      href,
      external: true,
    });
  }
  if (services) {
    rows.push({
      key: "services",
      label: "Serviços",
      icon: ListChecks,
      value: services,
      multiline: true,
      topicLines: parseAgencyServiceTopics(services),
    });
  }
  return rows;
}

function validityTone(validUntilDate: number): { label: string; className: string } {
  if (!validUntilDate) {
    return {
      label: "Não definido",
      className: "border-border bg-muted text-muted-foreground",
    };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const end = new Date(validUntilDate);
  end.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays < 0) {
    return {
      label: "Expirada",
      className:
        "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-500/25 dark:bg-red-500/15 dark:text-red-200",
    };
  }
  
  if (diffDays <= 1) {
    return {
      label: diffDays === 0 ? "Vence hoje" : "Vence amanhã",
      className:
        "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-200",
    };
  }

  return {
    label: "Válida",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-100",
  };
}

function InlineCopyButton({ value, label, tooltip }: { value: string; label: string; tooltip?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="relative inline-flex shrink-0 items-center ml-2 align-middle">
      <span
        className={cn(
          "pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded border border-emerald-500/40 bg-emerald-500/12 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-200 transition-all duration-200 z-10",
          copied ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
        )}
        aria-hidden
      >
        Copiado
      </span>
      <button
        type="button"
        className="inline-flex size-[22px] shrink-0 items-center justify-center rounded border border-border bg-background/70 text-muted-foreground transition-[color,transform] duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40 active:scale-[0.92]"
        aria-label={`Copiar ${label}`}
        title={tooltip || `Copiar ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        <Copy className="size-3 transition-colors duration-200" aria-hidden />
      </button>
    </span>
  );
}

function IdentityThumb({
  title,
  imageUrl,
  fallback,
  tone = "brand",
  busy = false,
  onPickFile,
  replaceButtonSide = "right",
  /** Quando true, o círculo encolhe em ecrãs estreitos (hero da proposta) para caber sem scroll horizontal. */
  shrinkOnNarrow = false,
}: {
  title: string;
  imageUrl?: string;
  fallback: string;
  tone?: "brand" | "muted";
  busy?: boolean;
  onPickFile?: (file: File) => void;
  replaceButtonSide?: "left" | "right";
  shrinkOnNarrow?: boolean;
}) {
  const ringClass = shrinkOnNarrow
    ? "relative flex aspect-square h-auto w-[min(9rem,max(7.25rem,calc((100dvw-3rem)/2.08)))] items-center justify-center overflow-hidden border-2 shadow-lg sm:aspect-auto sm:h-44 sm:w-44 md:h-48 md:w-48 lg:h-56 lg:w-56"
    : "relative flex h-44 w-44 items-center justify-center overflow-hidden border-2 shadow-lg sm:h-48 sm:w-48 lg:h-56 lg:w-56";

  const initialsClass = shrinkOnNarrow
    ? "text-[clamp(1.5rem,7.5vw,2.75rem)] font-bold tracking-wide text-foreground sm:text-5xl sm:tracking-wide md:text-[3.25rem] lg:text-[3.5rem]"
    : "text-5xl font-bold tracking-wide text-foreground sm:text-[3.25rem] lg:text-[3.5rem]";

  const editBtnCorner = shrinkOnNarrow
    ? replaceButtonSide === "left"
      ? "top-2 left-2 sm:top-5 sm:left-5 lg:top-6 lg:left-6"
      : "top-2 right-2 sm:top-5 sm:right-5 lg:top-6 lg:right-6"
    : replaceButtonSide === "left"
      ? "top-4 left-4 sm:top-5 sm:left-5 lg:top-6 lg:left-6"
      : "top-4 right-4 sm:top-5 sm:right-5 lg:top-6 lg:right-6";

  return (
    <div
      className={cn(
        "p-2 ring-1 ring-white/10 dark:ring-white/10",
        tone === "brand"
          ? "rounded-full bg-gradient-to-tr from-brand/20 to-brand/35 dark:from-white/[0.08] dark:to-white/[0.04]"
          : "rounded-full bg-gradient-to-tr from-muted/90 to-background dark:from-white/[0.08] dark:to-white/[0.04]",
      )}
    >
      <div className="relative w-full max-w-full">
        <div
          className={cn(
            ringClass,
            tone === "brand"
              ? "rounded-full border-brand/20 bg-gradient-to-br from-brand/20 via-brand/10 to-transparent"
              : "rounded-full border-border bg-gradient-to-br from-muted via-muted/80 to-background dark:border-white/10",
          )}
          title={title}
        >
          {imageUrl ? (
            <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
          ) : (
            <span className={initialsClass}>{getInitials(fallback)}</span>
          )}
        </div>

        {onPickFile ? (
          <label
            className={cn(
              "absolute z-[35] cursor-pointer",
              editBtnCorner,
            )}
          >
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onPickFile(file);
                event.currentTarget.value = "";
              }}
            />
            <span
              className={cn(
                buttonVariants({ variant: "outline", size: "icon" }),
                "pointer-events-auto size-8 rounded-md border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-foreground dark:border-white/10 dark:bg-background/90",
              )}
              aria-label={`Substituir imagem de ${title}`}
              title={`Substituir imagem de ${title}`}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
            </span>
          </label>
        ) : null}
      </div>
    </div>
  );
}

function parseDeliverableLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean);
}

/** Uma linha por tópico; marcadores à cabeça da linha são ignorados. */
function parseAgencyServiceTopics(text: string): string[] {
  const lines = parseDeliverableLines(text);
  if (lines.length) return lines;
  const trimmed = text.trim();
  return trimmed ? [trimmed] : [];
}

function planToEditDraft(p: ProposalPlan, kind: "spot" | "recurring"): ProposalPlan {
  const recurring = kind === "recurring";
  return {
    ...p,
    price: p.price.trim() ? normalizePriceForCurrencyInput(p.price) : "",
    promotionalPrice: p.promotionalPrice?.trim()
      ? normalizePriceForCurrencyInput(p.promotionalPrice)
      : "",
    cashPrice: recurring ? "" : p.cashPrice?.trim() ? normalizePriceForCurrencyInput(p.cashPrice) : "",
    paymentMethods: sortPaymentMethods(normalizePlanPaymentMethods(p.paymentMethods)),
    installmentCount: recurring ? 1 : normalizeInstallmentCount(p.installmentCount),
  };
}

/** Promoção aplicável: preço promocional válido e inferior ao normal (ou só promocional preenchido). */
function planHasValidPromotionalOffer(plan: ProposalPlan): boolean {
  const listTrim = plan.price.trim();
  const promoTrim = plan.promotionalPrice?.trim() ?? "";
  const listCents = listTrim ? parseCurrencyInputToCents(listTrim) : null;
  const promoCents = promoTrim ? parseCurrencyInputToCents(promoTrim) : null;
  return (
    promoCents !== null &&
    promoCents > 0 &&
    (listCents === null || listCents <= 0 || promoCents < listCents)
  );
}

/** Preço mostrado no herói e, se aplicável, valor de lista riscado (promo válida abaixo do valor normal). */
function resolvePlanDisplayPrices(plan: ProposalPlan): {
  displayPriceText: string;
  struckOriginalText?: string;
} {
  const listTrim = plan.price.trim();
  const promoTrim = plan.promotionalPrice?.trim() ?? "";
  const listCents = listTrim ? parseCurrencyInputToCents(listTrim) : null;

  if (planHasValidPromotionalOffer(plan)) {
    return {
      displayPriceText: promoTrim,
      ...(listTrim && listCents !== null && listCents > 0 ? { struckOriginalText: listTrim } : {}),
    };
  }
  return { displayPriceText: listTrim };
}

/** 1 → I, 2 → II, … (numeração por coluna: só pontuais ou só recorrentes). */
function planOrdinalRoman(ordinal: number): string {
  if (!Number.isFinite(ordinal) || ordinal < 1) return "I";
  let n = Math.floor(ordinal);
  const parts: readonly (readonly [number, string])[] = [
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let out = "";
  for (const [v, sym] of parts) {
    while (n >= v) {
      out += sym;
      n -= v;
    }
  }
  return out || "I";
}

function ProposalPlanCard({
  plan,
  kind,
  planOrdinal,
  readOnly,
  onSave,
  onAbandonEmptyPlan,
  onDeletePlan,
  variant = "dashboard",
}: {
  plan: ProposalPlan;
  kind: "spot" | "recurring";
  /** Posição entre planos do mesmo tipo (1 = primeiro pontual ou primeiro recorrente). */
  planOrdinal: number;
  readOnly: boolean;
  onSave?: (next: ProposalPlan) => void | Promise<void>;
  /** Se o plano ainda está vazio (nunca guardado com conteúdo), cancelar remove-o da proposta. */
  onAbandonEmptyPlan?: () => void | Promise<void>;
  /** Remove o plano após confirmação (dashboard). */
  onDeletePlan?: () => void | Promise<void>;
  variant?: "dashboard" | "public";
}) {
  const [editing, setEditing] = useState(!readOnly && planLooksEmpty(plan, kind));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [draft, setDraft] = useState<ProposalPlan>(() => planToEditDraft(plan, kind));

  useEffect(() => {
    if (!editing) {
      setDraft(planToEditDraft(plan, kind));
    }
  }, [plan, editing, kind]);

  const deliverablesDisplay = useMemo(
    () => parsePlanDeliverablesForDisplay(editing ? draft.deliverables : plan.deliverables),
    [editing, draft.deliverables, plan.deliverables],
  );
  const isSpot = kind === "spot";
  const promoOfferActive = planHasValidPromotionalOffer(editing ? draft : plan);

  const cancelEdit = () => {
    if (planLooksEmpty(plan, kind) && onAbandonEmptyPlan) {
      void onAbandonEmptyPlan();
      return;
    }
    setDraft(planToEditDraft(plan, kind));
    setEditing(false);
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      const recurring = kind === "recurring";
      const inst = recurring ? 1 : normalizeInstallmentCount(draft.installmentCount);
      await onSave({
        ...plan,
        title: draft.title.trim(),
        deliverables: draft.deliverables.trim(),
        price: draft.price.trim(),
        promotionalPrice: (draft.promotionalPrice ?? "").trim(),
        cashPrice: recurring ? "" : inst > 1 ? (draft.cashPrice ?? "").trim() : "",
        installmentCount: inst,
        paymentTerms: draft.paymentTerms.trim(),
        paymentMethods: sortPaymentMethods(normalizePlanPaymentMethods(draft.paymentMethods)),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = () => {
    if (!onDeletePlan || saving || removing) return;
    setRemoving(true);
    void Promise.resolve(onDeletePlan()).finally(() => setRemoving(false));
  };

  const dashboardActions = readOnly ? null : (
    <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
      {editing ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => cancelEdit()}
            disabled={saving || removing}
            aria-label="Cancelar edição"
          >
            <X className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="cta"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => void handleSave()}
            disabled={saving || removing}
            aria-label="Guardar plano"
          >
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
          </Button>
          {onDeletePlan ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
              onClick={() => handleDeleteClick()}
              disabled={saving || removing}
              aria-label="Remover plano"
            >
              {removing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 shrink-0 border-border/80 bg-background/95 shadow-sm backdrop-blur-sm dark:bg-background/90"
            onClick={() => {
              setDraft(planToEditDraft(plan, kind));
              setEditing(true);
            }}
            disabled={removing}
            aria-label="Editar plano"
          >
            <Pencil className="size-4" aria-hidden />
          </Button>
          {onDeletePlan ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
              onClick={() => handleDeleteClick()}
              disabled={saving || removing}
              aria-label="Remover plano"
            >
              {removing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <div className="relative isolate pt-1">
      {promoOfferActive ? (
        <Badge
          variant="default"
          className={cn(proposalPlanPromoBadgeClassName(), "font-bold uppercase tracking-wider")}
        >
          Promoção
        </Badge>
      ) : null}
      <article
        className={cn(
          "group relative z-10 overflow-hidden border shadow-sm transition-[box-shadow,transform] duration-200",
          RR.panel,
          isSpot
            ? "bg-card hover:border-brand/25 dark:bg-card dark:border-white/10 dark:hover:border-brand/20"
            : "bg-emerald-500/[0.045] hover:border-emerald-500/22 dark:bg-emerald-500/[0.07] dark:border-emerald-500/14 dark:hover:border-emerald-400/28",
          "border-border/80 hover:shadow-md",
        )}
      >
      <div
        className={cn(
          "pointer-events-none absolute left-0 top-0 h-full w-1 bg-gradient-to-b",
          isSpot ? "from-brand/70 to-brand/20" : "from-emerald-600/28 to-emerald-500/10 dark:from-emerald-400/28 dark:to-emerald-500/6",
        )}
        aria-hidden
      />
      <div className="relative space-y-4 p-5 pl-6 pr-5 sm:p-6 sm:pl-7 sm:pr-7">
        {editing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`plan-title-${plan.id}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Título
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`plan-title-${plan.id}`}
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  className="h-10 min-w-0 flex-1"
                />
                {dashboardActions}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor={`plan-deliverables-${plan.id}`}
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Entregas
                </Label>
                <DeliverablesFormatHint />
              </div>
              <Textarea
                id={`plan-deliverables-${plan.id}`}
                value={draft.deliverables}
                onChange={(e) => setDraft((d) => ({ ...d, deliverables: e.target.value }))}
                className="min-h-24 resize-y text-sm"
                placeholder="Liste os entregáveis incluídos neste plano."
              />
            </div>
            <div
              className={cn(
                "grid gap-3 grid-cols-1 sm:grid-cols-2",
                isSpot && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(7.25rem,8.5rem)]",
              )}
            >
              <div className="space-y-2">
                <Label htmlFor={`plan-price-${plan.id}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Valor
                </Label>
                <Input
                  id={`plan-price-${plan.id}`}
                  value={draft.price}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="R$ 0,00"
                  onChange={(e) => setDraft((d) => ({ ...d, price: formatCurrencyInput(e.target.value) }))}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`plan-promo-${plan.id}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Promocional <span className="font-normal normal-case text-muted-foreground/80">(opcional)</span>
                </Label>
                <Input
                  id={`plan-promo-${plan.id}`}
                  value={draft.promotionalPrice ?? ""}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="R$ 0,00"
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, promotionalPrice: formatCurrencyInput(e.target.value) }))
                  }
                  className="h-10"
                />
              </div>
              {isSpot ? (
                <>
                  <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                    <Label htmlFor={`plan-installments-${plan.id}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Parcelas
                    </Label>
                    <Select
                      value={String(normalizeInstallmentCount(draft.installmentCount))}
                      onValueChange={(v) => {
                        const n = normalizeInstallmentCount(Number(v));
                        setDraft((d) => ({
                          ...d,
                          installmentCount: n,
                          ...(n <= 1 ? { cashPrice: "" } : {}),
                        }));
                      }}
                      disabled={saving}
                    >
                      <SelectTrigger id={`plan-installments-${plan.id}`} className="h-10 w-full lg:max-w-none">
                        <SelectValue placeholder="Parcelas" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: PROPOSAL_PLAN_MAX_INSTALLMENTS }, (_, i) => i + 1).map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n === 1 ? "À vista" : `${n}×`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {normalizeInstallmentCount(draft.installmentCount) > 1 ? (
                    <div className="col-span-full space-y-2">
                      <Label htmlFor={`plan-cash-${plan.id}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        À vista <span className="font-normal normal-case text-muted-foreground/80">(opcional)</span>
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Valor único se for menor que o total parcelado (ex.: à vista sem juros).
                      </p>
                      <Input
                        id={`plan-cash-${plan.id}`}
                        value={draft.cashPrice ?? ""}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="R$ 0,00"
                        onChange={(e) => setDraft((d) => ({ ...d, cashPrice: formatCurrencyInput(e.target.value) }))}
                        className="h-10 w-full"
                        disabled={saving}
                      />
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`plan-terms-${plan.id}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Condições de pagamento
              </Label>
              <Textarea
                id={`plan-terms-${plan.id}`}
                value={draft.paymentTerms}
                onChange={(e) => setDraft((d) => ({ ...d, paymentTerms: e.target.value }))}
                className="min-h-20 resize-y text-sm"
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Formas de pagamento</p>
              <PlanPaymentMethodsPicker
                value={normalizePlanPaymentMethods(draft.paymentMethods)}
                onChange={(next) => setDraft((d) => ({ ...d, paymentMethods: next }))}
                disabled={saving}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="min-w-0 space-y-1">
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                  <span
                    className={cn(
                      "text-sm font-semibold tracking-wide sm:text-[0.9375rem]",
                      isSpot ? "text-brand/80 dark:text-brand/75" : "text-emerald-700/85 dark:text-emerald-400/80",
                    )}
                  >
                    {`Plano ${planOrdinalRoman(planOrdinal)}`}
                  </span>
                  <h3 className="min-w-0 w-full text-lg font-bold leading-snug tracking-tight text-foreground sm:text-xl">
                    {plan.title}
                  </h3>
                </div>
                {dashboardActions}
              </div>
              {deliverablesDisplay.kind === "flat" && deliverablesDisplay.lines.length > 0 ? (
                <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
                  {deliverablesDisplay.lines.map((line, index) => (
                    <li key={`${plan.id}-${index}-${line.slice(0, 24)}`} className="flex gap-2.5">
                      <ListChecks
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          isSpot ? "text-brand" : "text-emerald-600 dark:text-emerald-400",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0">{line}</span>
                    </li>
                  ))}
                </ul>
              ) : deliverablesDisplay.kind === "sections" && deliverablesDisplay.sections.length > 0 ? (
                <div className="mt-3 space-y-4 text-sm leading-relaxed">
                  {deliverablesDisplay.sections.map((section, sIndex) => (
                    <div key={`${plan.id}-del-${sIndex}-${section.title.slice(0, 16)}`} className="min-w-0">
                      <div className="flex gap-2.5">
                        <ListChecks
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            isSpot ? "text-brand" : "text-emerald-600 dark:text-emerald-400",
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                          {section.title ? (
                            <p className="font-semibold text-foreground">{section.title}</p>
                          ) : null}
                          {section.items.length > 0 ? (
                            <ul
                              className={cn(
                                "space-y-1.5 border-l-2 pl-3.5",
                                isSpot
                                  ? "border-brand/40 text-muted-foreground"
                                  : "border-emerald-600/40 text-muted-foreground dark:border-emerald-500/45",
                              )}
                            >
                              {section.items.map((item, iIndex) => (
                                <li key={`${plan.id}-del-${sIndex}-sub-${iIndex}-${item.slice(0, 20)}`} className="flex gap-2">
                                  <span
                                    className={cn(
                                      "mt-0.5 shrink-0 select-none font-bold leading-none",
                                      isSpot ? "text-brand/70" : "text-emerald-600/80 dark:text-emerald-400/85",
                                    )}
                                    aria-hidden
                                  >
                                    •
                                  </span>
                                  <span className="min-w-0">{item}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {(() => {
              const methods = sortPaymentMethods(normalizePlanPaymentMethods(plan.paymentMethods));
              const terms = plan.paymentTerms.trim();
              const { displayPriceText, struckOriginalText } = resolvePlanDisplayPrices(plan);
              const hasPrice = Boolean(displayPriceText.trim());
              const hasMethods = methods.length > 0;
              const hasFooter = Boolean(hasPrice || hasMethods || terms);
              if (!hasFooter) return null;
              return (
                <div className="space-y-4 border-t border-border/60 pt-4 dark:border-white/10">
                  {hasPrice || hasMethods ? (
                    <div className="space-y-2">
                      {hasPrice ? (
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          Investimento
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                        {hasPrice ? (
                          <PlanPriceHero
                            priceText={displayPriceText}
                            struckOriginalText={struckOriginalText}
                            installmentCount={isSpot ? plan.installmentCount : 1}
                            cashPriceText={isSpot ? plan.cashPrice : undefined}
                            accent={isSpot ? "brand" : "emerald"}
                            className="shrink-0"
                            priceSuffix={isSpot ? undefined : "/mensal"}
                          />
                        ) : null}

                        {hasMethods ? (
                          <div className={cn("min-w-0 max-w-full", !hasPrice && "ml-auto")}>
                            <PlanPaymentMethodsChips
                              methods={methods}
                              accent={isSpot ? "brand" : "emerald"}
                              className="justify-end"
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {terms ? (
                    <div className={cn((hasPrice || hasMethods) && "mt-5")}>
                      <div
                        className={cn(
                          "flex overflow-hidden rounded-lg border border-border/55 bg-muted/25 shadow-sm dark:border-white/10 dark:bg-white/[0.035] dark:shadow-none",
                        )}
                      >
                        <div
                          className={cn(
                            "w-1 shrink-0",
                            isSpot ? "bg-brand/45" : "bg-emerald-500/40 dark:bg-emerald-400/35",
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1 space-y-1 px-3.5 py-3 sm:px-4 sm:py-3.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Condição de pagamento
                          </p>
                          <p className="text-[13px] font-normal leading-relaxed text-foreground/88 sm:text-sm">
                            {terms}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })()}

            {variant === "public" && plan.paymentUrl?.trim() ? (
              <div className="border-t border-white/10 pt-4 mt-4">
                {plan.paymentUrlDiscount?.trim() ? (
                  <div className="flex flex-col gap-2.5">
                    <a
                      href={plan.paymentUrlDiscount}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        buttonVariants({ variant: "cta", size: "lg" }),
                        "w-full justify-center",
                      )}
                    >
                      Pagar à vista com desconto
                    </a>
                    <a
                      href={plan.paymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "lg" }),
                        "w-full justify-center",
                      )}
                    >
                      Parcelar em até {normalizeInstallmentCount(plan.installmentCount)}x
                    </a>
                  </div>
                ) : (
                  <a
                    href={plan.paymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ variant: "cta", size: "lg" }),
                      "w-full justify-center",
                    )}
                  >
                    Contratar este plano
                  </a>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </article>
    </div>
  );
}

function ProposalPlansSection({
  proposal,
  readOnly,
  onSavePlan,
  onAddPlan,
  onAbandonEmptyPlan,
  onDeletePlan,
  variant = "dashboard",
}: {
  proposal: Proposal;
  readOnly: boolean;
  onSavePlan?: (kind: "spot" | "recurring", next: ProposalPlan) => void | Promise<void>;
  onAddPlan?: (kind: "spot" | "recurring") => void | Promise<void>;
  onAbandonEmptyPlan?: (kind: "spot" | "recurring", planId: string) => void | Promise<void>;
  onDeletePlan?: (kind: "spot" | "recurring", planId: string) => void | Promise<void>;
  variant?: "dashboard" | "public";
}) {
  const spots = proposal.spotPlans ?? [];
  const recurring = proposal.recurringPlans ?? [];
  const showAdd = Boolean(onAddPlan);
  if (!spots.length && !recurring.length && !showAdd) return null;

  const showSpotColumn = spots.length > 0 || showAdd;
  const showRecurringColumn = recurring.length > 0 || showAdd;

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-xl dark:border-white/5 dark:bg-white/[0.02]"
      aria-labelledby="proposal-plans-heading"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_20%_-10%,rgba(190,149,83,0.14),transparent_55%),radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(255,255,255,0.06),transparent_45%)] dark:bg-[radial-gradient(ellipse_80%_50%_at_20%_-10%,rgba(190,149,83,0.12),transparent_55%),radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(255,255,255,0.04),transparent_45%)]"
        aria-hidden
      />
      <div className="relative space-y-8 px-6 py-8 sm:px-8 sm:py-9">
        <div className="max-w-2xl space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full border-brand/20 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
              Oferta comercial
            </Badge>
          </div>
          <h2 id="proposal-plans-heading" className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Planos personalizados
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            Valores, entregas e condições definidos para esta proposta.
          </p>
        </div>

        <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
          {showSpotColumn ? (
            <div className="min-w-0 space-y-6">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg border border-brand/25 bg-brand/10 text-brand",
                    RR.logoMark,
                  )}
                >
                  <FileText className="size-4" aria-hidden />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pontual</p>
                  <p className="text-sm font-semibold text-foreground">Investimento pontual</p>
                </div>
              </div>
              <div className="flex flex-col">
                {spots.map((plan, index) => (
                  <Fragment key={plan.id}>
                    {index > 0 ? (
                      <div
                        className="relative my-10 shrink-0"
                        role="separator"
                        aria-orientation="horizontal"
                      >
                        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-border to-transparent dark:via-white/12" />
                      </div>
                    ) : null}
                    <ProposalPlanCard
                      plan={plan}
                      kind="spot"
                      planOrdinal={index + 1}
                      readOnly={readOnly}
                      variant={variant}
                      onSave={readOnly ? undefined : (next) => onSavePlan?.("spot", next)}
                      onAbandonEmptyPlan={
                        readOnly || !onAbandonEmptyPlan ? undefined : () => void onAbandonEmptyPlan("spot", plan.id)
                      }
                      onDeletePlan={
                        readOnly || !onDeletePlan ? undefined : () => void onDeletePlan("spot", plan.id)
                      }
                    />
                  </Fragment>
                ))}
              </div>
              {showAdd ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 border-brand/25 bg-background/80 hover:bg-brand/5 dark:border-brand/20 dark:hover:bg-brand/10 sm:w-auto"
                  onClick={() => void onAddPlan?.("spot")}
                >
                  <Plus className="size-4" aria-hidden />
                  Adicionar plano pontual
                </Button>
              ) : null}
            </div>
          ) : null}

          {showRecurringColumn ? (
            <div className="min-w-0 space-y-6">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300",
                    RR.logoMark,
                  )}
                >
                  <RefreshCw className="size-4" aria-hidden />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recorrente</p>
                  <p className="text-sm font-semibold text-foreground">Planos contínuos</p>
                </div>
              </div>
              <div className="flex flex-col">
                {recurring.map((plan, index) => (
                  <Fragment key={plan.id}>
                    {index > 0 ? (
                      <div
                        className="relative my-10 shrink-0"
                        role="separator"
                        aria-orientation="horizontal"
                      >
                        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-emerald-500/35 to-transparent dark:via-emerald-400/25" />
                      </div>
                    ) : null}
                    <ProposalPlanCard
                      plan={plan}
                      kind="recurring"
                      planOrdinal={index + 1}
                      readOnly={readOnly}
                      variant={variant}
                      onSave={readOnly ? undefined : (next) => onSavePlan?.("recurring", next)}
                      onAbandonEmptyPlan={
                        readOnly || !onAbandonEmptyPlan ? undefined : () => void onAbandonEmptyPlan("recurring", plan.id)
                      }
                      onDeletePlan={
                        readOnly || !onDeletePlan ? undefined : () => void onDeletePlan("recurring", plan.id)
                      }
                    />
                  </Fragment>
                ))}
              </div>
              {showAdd ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 border-emerald-500/25 bg-background/80 hover:bg-emerald-500/5 dark:border-emerald-400/25 dark:hover:bg-emerald-500/10 sm:w-auto"
                  onClick={() => void onAddPlan?.("recurring")}
                >
                  <Plus className="size-4" aria-hidden />
                  Adicionar plano recorrente
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function summaryStatNumberAccentClass(accent: "spot" | "recurring"): string {
  return accent === "spot"
    ? "text-amber-600 dark:text-amber-400"
    : "text-emerald-600 dark:text-emerald-400";
}

function SummaryStat({
  label,
  value,
  icon: Icon,
  badge,
  className,
  valueNumberAccent,
}: {
  label: string;
  value: string;
  icon: typeof CalendarDays;
  badge?: { label: string; className: string };
  className?: string;
  /** Destaca só o número inicial (ex.: «3 planos») — pontual âmbar, recorrente verde. */
  valueNumberAccent?: "spot" | "recurring";
}) {
  const valueMatch = valueNumberAccent ? value.match(/^(\d+)(.*)$/) : null;
  const valueBlock =
    valueMatch && valueNumberAccent ? (
      <p className="mt-2 break-words text-sm font-semibold">
        <span className={cn("tabular-nums", summaryStatNumberAccentClass(valueNumberAccent))}>{valueMatch[1]}</span>
        <span className="text-foreground">{valueMatch[2]}</span>
      </p>
    ) : (
      <p className="mt-2 break-words text-sm font-semibold text-foreground">{value}</p>
    );

  return (
    <div
      className={cn(
        "border border-border bg-background/80 p-4 dark:border-white/10 dark:bg-white/[0.03]",
        RR.stat,
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-muted-foreground">
          <Icon className="size-5 shrink-0 text-brand sm:size-4" aria-hidden />
          <span className="min-w-0 text-xs font-semibold uppercase tracking-widest">{label}</span>
        </div>
        {badge ? (
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold sm:text-[11px]",
              badge.className,
            )}
          >
            {badge.label}
          </Badge>
        ) : null}
      </div>
      {valueBlock}
    </div>
  );
}

export function ProposalView({ proposal, variant, onProposalChange, reportCta: reportCtaProp }: ProposalViewProps) {
  const isDashboard = variant === "dashboard";
  const { user } = useAuth();
  const proposalRef = useRef(proposal);
  proposalRef.current = proposal;
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [publicLinkOrigin, setPublicLinkOrigin] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<"lead" | "agency" | "cover" | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  /** Configuração bruta (dashboard); a resolução com `accountEmail` é no `useMemo` abaixo. */
  const [reportCtaSettingsState, setReportCtaSettingsState] = useState<UserReportCtaSettings | null>(null);
  const [ctaOwnerAccountEmail, setCtaOwnerAccountEmail] = useState<string | null>(null);
  const [nextStepsEditing, setNextStepsEditing] = useState(false);
  const [nextStepsDraft, setNextStepsDraft] = useState<string[]>([]);
  const [nextStepsSaving, setNextStepsSaving] = useState(false);
  const [removePlanTarget, setRemovePlanTarget] = useState<{
    kind: "spot" | "recurring";
    planId: string;
  } | null>(null);
  const [removePlanBusy, setRemovePlanBusy] = useState(false);
  const [companyAboutLive, setCompanyAboutLive] = useState<UserCompanyAboutSettings | null>(null);
  const [linkedLeadLive, setLinkedLeadLive] = useState<Lead | null>(null);
  const [limitModalState, setLimitModalState] = useState<PlanLimitModalState | null>(null);

  const [extendValidityModalOpen, setExtendValidityModalOpen] = useState(false);
  const [extendDays, setExtendDays] = useState(7);
  const [extendingValidity, setExtendingValidity] = useState(false);

  const handleExtendValidity = async () => {
    if (!isDashboard) return;
    if (extendDays <= 0 || extendDays > 30) return;
    setExtendingValidity(true);
    try {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const newValidUntil = now.getTime() + extendDays * 24 * 60 * 60 * 1000;
      await applyProposalPatch({
        validUntilDate: newValidUntil,
        updatedAt: Date.now(),
      });
      setExtendValidityModalOpen(false);
      setExtendDays(7);
    } catch (e) {
      console.error(e);
      setFieldError("Não foi possível prorrogar a validade.");
    } finally {
      setExtendingValidity(false);
    }
  };
  const [planKeyForLogo, setPlanKeyForLogo] = useState<PlanKey>("starter");
  /** null = a carregar; false = Starter sem direito a marca / personalização institucional nesta proposta. */
  const [agencyImageUploadAllowed, setAgencyImageUploadAllowed] = useState<boolean | null>(null);
  const [editingAgencySummary, setEditingAgencySummary] = useState(false);
  const [agencySummaryDraft, setAgencySummaryDraft] = useState("");
  const [savingAgencySummary, setSavingAgencySummary] = useState(false);
  const [editingAgencyContacts, setEditingAgencyContacts] = useState(false);
  const [agencyContactDraft, setAgencyContactDraft] = useState<ProposalAgencySnapshot>(() => proposal.agencySnapshot);
  const [savingAgencyContacts, setSavingAgencyContacts] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    executiveSummary: proposal.companyProfile.executiveSummary,
  });

  useEffect(() => {
    setProfileDraft({
      executiveSummary: proposal.companyProfile.executiveSummary,
    });
  }, [proposal]);

  useEffect(() => {
    if (!editingAgencySummary) {
      setAgencySummaryDraft(proposal.agencySnapshot.companySummary);
    }
  }, [proposal.id, proposal.updatedAt, proposal.agencySnapshot.companySummary, editingAgencySummary]);

  useEffect(() => {
    if (!editingAgencyContacts) {
      setAgencyContactDraft(proposal.agencySnapshot);
    }
  }, [proposal.id, proposal.updatedAt, proposal.agencySnapshot, editingAgencyContacts]);

  useEffect(() => {
    setNextStepsEditing(false);
  }, [proposal.id]);

  useEffect(() => {
    if (reportCtaProp != null) {
      setReportCtaSettingsState(null);
      return;
    }
    if (!isDashboard || !proposal.userId) {
      setReportCtaSettingsState(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const settings = await getUserReportCtaSettings(proposal.userId);
        if (!cancelled) setReportCtaSettingsState(settings);
      } catch {
        if (!cancelled) setReportCtaSettingsState(null);
      }
    };
    void load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reportCtaProp, isDashboard, proposal.userId]);

  useEffect(() => {
    if (!isDashboard || !auth) return;
    if (!proposal.userId) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u?.uid === proposal.userId) setCtaOwnerAccountEmail(u.email?.trim() || null);
    });
    return () => unsub();
  }, [isDashboard, proposal.userId]);

  useEffect(() => {
    if (!isDashboard || !proposal.userId) {
      setCompanyAboutLive(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getUserCompanyAboutSettings(proposal.userId);
        if (!cancelled) setCompanyAboutLive(data);
      } catch {
        if (!cancelled) setCompanyAboutLive(null);
      }
    };
    void load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isDashboard, proposal.userId]);

  useEffect(() => {
    if (!isDashboard || !proposal.userId) {
      setAgencyImageUploadAllowed(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "userSettings", proposal.userId));
        if (cancelled) return;
        if (!snap.exists()) {
          setPlanKeyForLogo("starter");
          setAgencyImageUploadAllowed(false);
          return;
        }
        const raw = snap.data() as Record<string, unknown>;
        setPlanKeyForLogo(normalizedSubscriptionPlanKey(raw.subscriptionPlan ?? raw.plan));
        setAgencyImageUploadAllowed(planAllowsCustomLogo(raw));
      } catch {
        if (!cancelled) setAgencyImageUploadAllowed(false);
      }
    };
    void load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isDashboard, proposal.userId]);

  /** Plano Starter: bloqueia apenas o texto institucional (deve manter o padrão
   *  da Rota Digital) e uploads de imagem. Contatos e serviços ficam liberados. */
  useEffect(() => {
    if (agencyImageUploadAllowed === false) {
      setEditingAgencySummary(false);
    }
  }, [agencyImageUploadAllowed]);

  useEffect(() => {
    if (!isDashboard || !proposal.leadId?.trim()) {
      setLinkedLeadLive(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const lead = await getLead(proposal.leadId);
        if (cancelled) return;
        if (lead?.userId === proposal.userId) {
          setLinkedLeadLive(lead);
        } else {
          setLinkedLeadLive(null);
        }
      } catch {
        if (!cancelled) setLinkedLeadLive(null);
      }
    };
    void load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isDashboard, proposal.leadId, proposal.userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPublicLinkOrigin(window.location.origin);
  }, []);

  const publicHref = proposal.publicSlug ? `/p/${proposal.publicSlug}` : undefined;
  const validityStatus = validityTone(proposal.validUntilDate);
  const spotCount = proposal.spotPlans.length;
  const recurringCount = proposal.recurringPlans.length;

  const snapAgencyName = resolveCompanyAboutNameForDisplay(
    proposal.agencySnapshot.companyName?.trim() || DEFAULT_COMPANY_ABOUT_NAME,
  );
  const snapAgencySummary = resolveCompanyAboutSummaryForDisplay(proposal.agencySnapshot.companySummary?.trim());

  const displayAgencyName = useMemo(() => {
    if (!isDashboard) return snapAgencyName;
    const live = resolveCompanyAboutNameForDisplay(companyAboutLive?.companyName?.trim());
    return live || snapAgencyName;
  }, [isDashboard, companyAboutLive?.companyName, snapAgencyName]);

  const leadImageUrl = proposal.evidences?.leadImageUrl?.trim();

  /** No dashboard: dados do lead atual no CRM; página pública mantém o snapshot gravado. */
  const displayLead: ProposalLeadSnapshot = useMemo(() => {
    if (isDashboard && linkedLeadLive && linkedLeadLive.userId === proposal.userId) {
      return proposalLeadSnapshotFromLead(linkedLeadLive);
    }
    return proposal.lead;
  }, [isDashboard, linkedLeadLive, proposal.lead, proposal.userId]);

  /** Ordem: override só desta proposta → imagens atuais em Configurações → snapshot da proposta. */
  const displayAgencyImage = useMemo(() => {
    const proposalOnly = proposal.evidences?.agencyImageUrl?.trim();
    let out = "";
    if (proposalOnly) out = proposalOnly;
    else if (isDashboard) {
      const p = companyAboutLive?.primaryImageUrl?.trim();
      const s = companyAboutLive?.secondaryImageUrl?.trim();
      if (p) out = p;
      else if (s) out = s;
    }
    if (!out) {
      out =
        proposal.agencySnapshot.primaryImageUrl?.trim() || proposal.agencySnapshot.secondaryImageUrl?.trim() || "";
    }
    return resolveCompanyPrimaryImageForDisplay(out);
  }, [
    isDashboard,
    proposal.evidences?.agencyImageUrl,
    companyAboutLive?.primaryImageUrl,
    companyAboutLive?.secondaryImageUrl,
    proposal.agencySnapshot.primaryImageUrl,
    proposal.agencySnapshot.secondaryImageUrl,
  ]);

  /** Só logo (Configurações → primária ou snapshot); sem override da miniatura da proposta. */
  const displayAgencyLogoForBadge = useMemo(() => {
    let out = "";
    if (isDashboard) {
      const live = companyAboutLive?.primaryImageUrl?.trim();
      if (live) out = live;
    }
    if (!out) out = proposal.agencySnapshot.primaryImageUrl?.trim() || "";
    return resolveCompanyPrimaryImageForDisplay(out);
  }, [isDashboard, companyAboutLive?.primaryImageUrl, proposal.agencySnapshot.primaryImageUrl]);

  /**
   * Capa: override desta proposta → capa viva em Configurações (dashboard) → snapshot → asset Rota padrão.
   */
  const displayAgencyCoverUrl = useMemo(() => {
    const proposalCover = proposal.evidences?.agencyCoverUrl?.trim();
    if (proposalCover) return proposalCover;
    let out = "";
    if (isDashboard) {
      const live = companyAboutLive?.secondaryImageUrl?.trim();
      if (live) out = live;
    }
    if (!out) out = proposal.agencySnapshot.secondaryImageUrl?.trim() || "";
    return resolveCompanySecondaryImageForDisplay(out);
  }, [
    isDashboard,
    proposal.evidences?.agencyCoverUrl,
    companyAboutLive?.secondaryImageUrl,
    proposal.agencySnapshot.secondaryImageUrl,
  ]);

  const companyOverviewText =
    proposal.companyProfile.executiveSummary.trim() || proposal.companyProfile.companyProfile.trim();
  const companyOverviewParagraphs = splitReadableParagraphs(companyOverviewText);
  /** Só o snapshot desta proposta (edições aqui não alteram Configurações globais). */
  const agencySummaryParagraphs = useMemo(
    () => splitReadableParagraphs(snapAgencySummary),
    [snapAgencySummary],
  );

  const agencyContactRows = useMemo(
    () => buildAgencyContactRows(proposal.agencySnapshot, null, false),
    [proposal.agencySnapshot],
  );

  const removePlanPendingTitle = useMemo(() => {
    if (!removePlanTarget) return null;
    const pl =
      removePlanTarget.kind === "spot"
        ? proposal.spotPlans.find((p) => p.id === removePlanTarget.planId)
        : proposal.recurringPlans.find((p) => p.id === removePlanTarget.planId);
    const t = pl?.title?.trim();
    return t || null;
  }, [removePlanTarget, proposal.spotPlans, proposal.recurringPlans]);

  const effectiveReportCta = useMemo(() => {
    if (reportCtaProp != null) return reportCtaProp;
    return resolveReportCtas(reportCtaSettingsState, null, { accountEmail: ctaOwnerAccountEmail });
  }, [reportCtaProp, reportCtaSettingsState, ctaOwnerAccountEmail]);

  const displayNextSteps = useMemo(() => {
    const custom = proposal.nextSteps?.map((s) => s.trim()).filter(Boolean) ?? [];
    if (custom.length) return custom;
    return [...PROPOSAL_NEXT_STEPS_COPY];
  }, [proposal.nextSteps]);

  const proposalCreatedAtLine2 = useMemo(() => {
    const d = new Date(proposal.createdAt);
    const datePart = d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const timePart = d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${datePart} às ${timePart}`;
  }, [proposal.createdAt]);

  const applyProposalPatch = async (
    patch: Partial<Omit<Proposal, "id" | "leadId" | "userId" | "createdAt">>,
  ) => {
    if (!isDashboard) return;
    await updateProposal(proposal.id, patch);
    onProposalChange?.({
      ...proposal,
      ...patch,
      companyProfile: patch.companyProfile ?? proposal.companyProfile,
      agencySnapshot: patch.agencySnapshot ?? proposal.agencySnapshot,
      lead: patch.lead ?? proposal.lead,
      evidences: patch.evidences ?? proposal.evidences,
      spotPlans: patch.spotPlans ?? proposal.spotPlans,
      recurringPlans: patch.recurringPlans ?? proposal.recurringPlans,
      updatedAt: patch.updatedAt ?? proposal.updatedAt,
    });
  };

  useEffect(() => {
    if (!isDashboard || !linkedLeadLive || linkedLeadLive.userId !== proposal.userId) return;
    const nextLead = proposalLeadSnapshotFromLead(linkedLeadLive);
    if (!proposalLeadSnapshotsDiffer(proposal.lead, nextLead)) return;

    const nextTitle = proposalTitleIfDefaultForCompany(
      proposal.title,
      proposal.lead.company,
      nextLead.company,
    );

    let cancelled = false;
    void (async () => {
      try {
        const updatedAt = Date.now();
        const patch: Partial<Omit<Proposal, "id" | "leadId" | "userId" | "createdAt">> = {
          lead: nextLead,
          updatedAt,
        };
        if (nextTitle) patch.title = nextTitle;
        const id = proposalRef.current.id;
        await updateProposal(id, patch);
        if (cancelled || !onProposalChange) return;
        const prev = proposalRef.current;
        onProposalChange({
          ...prev,
          lead: nextLead,
          title: nextTitle ?? prev.title,
          updatedAt,
        });
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDashboard, linkedLeadLive, onProposalChange, proposal.lead, proposal.title, proposal.userId]);

  const startNextStepsEdit = () => {
    setFieldError(null);
    setNextStepsDraft([...displayNextSteps]);
    setNextStepsEditing(true);
  };

  const cancelNextStepsEdit = () => {
    setNextStepsEditing(false);
  };

  const saveNextSteps = async () => {
    if (!isDashboard) return;
    setNextStepsSaving(true);
    setFieldError(null);
    try {
      const cleaned = nextStepsDraft.map((s) => s.trim()).filter(Boolean);
      await applyProposalPatch({ nextSteps: cleaned, updatedAt: Date.now() });
      setNextStepsEditing(false);
    } catch (e) {
      console.error(e);
      setFieldError("Não foi possível guardar os próximos passos.");
    } finally {
      setNextStepsSaving(false);
    }
  };

  const handleAddPlan = async (kind: "spot" | "recurring") => {
    if (!isDashboard) return;
    setFieldError(null);
    try {
      const fresh = createEmptyProposalPlan();
      if (kind === "spot") {
        await applyProposalPatch({
          spotPlans: [...proposal.spotPlans, fresh],
          updatedAt: Date.now(),
        });
      } else {
        await applyProposalPatch({
          recurringPlans: [...proposal.recurringPlans, fresh],
          updatedAt: Date.now(),
        });
      }
    } catch (e) {
      console.error(e);
      setFieldError("Não foi possível adicionar o plano.");
    }
  };

  const patchRemovePlan = async (kind: "spot" | "recurring", planId: string) => {
    if (kind === "spot") {
      await applyProposalPatch({
        spotPlans: proposal.spotPlans.filter((p) => p.id !== planId),
        updatedAt: Date.now(),
      });
    } else {
      await applyProposalPatch({
        recurringPlans: proposal.recurringPlans.filter((p) => p.id !== planId),
        updatedAt: Date.now(),
      });
    }
  };

  const handleAbandonEmptyPlan = async (kind: "spot" | "recurring", planId: string) => {
    if (!isDashboard) return;
    setFieldError(null);
    try {
      await patchRemovePlan(kind, planId);
    } catch (e) {
      console.error(e);
      setFieldError("Não foi possível remover o plano.");
    }
  };

  const handleDeletePlan = (kind: "spot" | "recurring", planId: string) => {
    if (!isDashboard) return;
    setRemovePlanTarget({ kind, planId });
  };

  const confirmRemovePlan = async () => {
    if (!removePlanTarget) return;
    const { kind, planId } = removePlanTarget;
    setFieldError(null);
    setRemovePlanBusy(true);
    try {
      await patchRemovePlan(kind, planId);
      setRemovePlanTarget(null);
    } catch (e) {
      console.error(e);
      setFieldError("Não foi possível remover o plano.");
    } finally {
      setRemovePlanBusy(false);
    }
  };

  const handleCopyLink = async () => {
    if (!publicHref || typeof window === "undefined") return;
    const origin = publicLinkOrigin || window.location.origin;
    await navigator.clipboard.writeText(`${origin}${publicHref}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setFieldError(null);
    try {
      const nextCompanyProfile = {
        ...proposal.companyProfile,
        source: "manual" as const,
        executiveSummary: profileDraft.executiveSummary.trim(),
      };
      await applyProposalPatch({
        companyProfile: nextCompanyProfile,
        updatedAt: Date.now(),
      });
      setEditingProfile(false);
    } catch (e) {
      console.error(e);
      setFieldError("Não foi possível salvar o perfil da empresa.");
    } finally {
      setSavingProfile(false);
    }
  };

  const tryStartAgencyCustomization = (mode: "summary" | "contacts") => {
    if (!isDashboard) return;
    /** O texto institucional (resumo) é personalizável apenas em planos pagos;
     *  no Starter ele permanece com o padrão da Rota Digital. Contatos/serviços
     *  ficam liberados em qualquer plano. */
    if (mode === "summary") {
      if (agencyImageUploadAllowed === null) {
        setFieldError("A carregar as permissões do plano…");
        return;
      }
      if (!agencyImageUploadAllowed) {
        setFieldError(null);
        setLimitModalState({ kind: "logo", plan: planKeyForLogo });
        return;
      }
    }
    setEditingAgencySummary(false);
    setEditingAgencyContacts(false);
    setFieldError(null);
    if (mode === "summary") {
      setAgencySummaryDraft(proposal.agencySnapshot.companySummary);
      setEditingAgencySummary(true);
    } else {
      setAgencyContactDraft({ ...proposal.agencySnapshot });
      setEditingAgencyContacts(true);
    }
  };

  const cancelAgencySummaryEdit = () => {
    setAgencySummaryDraft(proposal.agencySnapshot.companySummary);
    setEditingAgencySummary(false);
  };

  const handleSaveAgencySummary = async () => {
    setSavingAgencySummary(true);
    setFieldError(null);
    try {
      await applyProposalPatch({
        agencySnapshot: {
          ...proposal.agencySnapshot,
          companySummary: agencySummaryDraft.trim(),
        },
        updatedAt: Date.now(),
      });
      setEditingAgencySummary(false);
    } catch (e) {
      console.error(e);
      setFieldError("Não foi possível salvar o texto institucional desta proposta.");
    } finally {
      setSavingAgencySummary(false);
    }
  };

  const cancelAgencyContactsEdit = () => {
    setAgencyContactDraft(proposal.agencySnapshot);
    setEditingAgencyContacts(false);
  };

  const handleSaveAgencyContacts = async () => {
    setSavingAgencyContacts(true);
    setFieldError(null);
    try {
      await applyProposalPatch({
        agencySnapshot: {
          ...proposal.agencySnapshot,
          companyPhone: agencyContactDraft.companyPhone?.trim() || "",
          whatsApp: agencyContactDraft.whatsApp?.trim() || "",
          address: agencyContactDraft.address?.trim() || "",
          websiteUrl: agencyContactDraft.websiteUrl?.trim() || "",
          instagramUrl: agencyContactDraft.instagramUrl?.trim() || "",
          youtubeUrl: agencyContactDraft.youtubeUrl?.trim() || "",
          services: agencyContactDraft.services?.trim() || "",
        },
        updatedAt: Date.now(),
      });
      setEditingAgencyContacts(false);
    } catch (e) {
      console.error(e);
      setFieldError("Não foi possível salvar os dados de contacto desta proposta.");
    } finally {
      setSavingAgencyContacts(false);
    }
  };

  const handleImageReplace = async (slot: "lead" | "agency", file: File) => {
    if (!isDashboard) return;
    if (slot === "agency") {
      if (agencyImageUploadAllowed === null) {
        setFieldError("A carregar as permissões do plano…");
        return;
      }
      if (!agencyImageUploadAllowed) {
        setFieldError(null);
        setLimitModalState({ kind: "logo", plan: planKeyForLogo });
        return;
      }
    }
    setUploadingSlot(slot);
    setFieldError(null);
    try {
      const result = await uploadUserProposalImage({
        file,
        userId: proposal.userId,
        leadId: proposal.leadId,
        proposalId: proposal.id,
        slotLabel: slot === "lead" ? "lead-image" : "agency-image",
      });
      if (!result.ok) {
        setFieldError(describeManualUploadFailure(result));
        return;
      }
      await applyProposalPatch({
        evidences: {
          ...(proposal.evidences || {}),
          leadImageUrl: slot === "lead" ? result.url : proposal.evidences?.leadImageUrl,
          agencyImageUrl: slot === "agency" ? result.url : proposal.evidences?.agencyImageUrl,
        },
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.error(e);
      setFieldError("Não foi possível enviar a imagem agora.");
    } finally {
      setUploadingSlot(null);
    }
  };

  const openAgencyCoverPicker = () => {
    if (!isDashboard) return;
    if (agencyImageUploadAllowed === null) {
      setFieldError("A carregar as permissões do plano…");
      return;
    }
    if (!agencyImageUploadAllowed) {
      setFieldError(null);
      setLimitModalState({ kind: "logo", plan: planKeyForLogo });
      return;
    }
    coverFileInputRef.current?.click();
  };

  const handleCoverReplace = async (file: File) => {
    if (!isDashboard) return;
    if (agencyImageUploadAllowed === null) {
      setFieldError("A carregar as permissões do plano…");
      return;
    }
    if (!agencyImageUploadAllowed) {
      setFieldError(null);
      setLimitModalState({ kind: "logo", plan: planKeyForLogo });
      return;
    }
    setUploadingSlot("cover");
    setFieldError(null);
    try {
      const result = await uploadUserProposalImage({
        file,
        userId: proposal.userId,
        leadId: proposal.leadId,
        proposalId: proposal.id,
        slotLabel: "agency-cover",
      });
      if (!result.ok) {
        setFieldError(describeManualUploadFailure(result));
        return;
      }
      await applyProposalPatch({
        evidences: {
          ...(proposal.evidences || {}),
          agencyCoverUrl: result.url,
        },
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.error(e);
      setFieldError("Não foi possível enviar a capa agora.");
    } finally {
      setUploadingSlot(null);
    }
  };

  return (
    <div className="min-w-0 space-y-8">
      <PlanLimitModal
        state={limitModalState}
        onClose={() => setLimitModalState(null)}
        getIdToken={user ? () => user.getIdToken() : undefined}
      />

      <Dialog open={extendValidityModalOpen} onOpenChange={setExtendValidityModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Prorrogar Validade</DialogTitle>
            <DialogDescription>
              Quantos dias a partir de hoje você deseja adicionar à validade desta proposta?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-6 gap-6">
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="icon" 
                className="h-10 w-10 rounded-full" 
                onClick={() => setExtendDays(Math.max(1, extendDays - 1))}
                disabled={extendDays <= 1 || extendingValidity}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="text-4xl font-extrabold w-16 text-center tabular-nums text-foreground">
                {extendDays}
              </div>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-10 w-10 rounded-full" 
                onClick={() => setExtendDays(Math.min(30, extendDays + 1))}
                disabled={extendDays >= 30 || extendingValidity}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Dias adicionais (máx 30 dias)
            </p>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button variant="outline" onClick={() => setExtendValidityModalOpen(false)} disabled={extendingValidity}>
              Cancelar
            </Button>
            <Button onClick={handleExtendValidity} disabled={extendingValidity}>
              {extendingValidity && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Prorrogar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <section className="relative overflow-visible rounded-2xl border border-border bg-card shadow-xl dark:border-white/5 dark:bg-white/[0.02]">
        <div
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_top_left,rgba(190,149,83,0.18),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_34%)]"
          aria-hidden
        />
        <div className="relative z-10">
          <div
            className={cn(
              "grid min-w-0 gap-6 px-4 py-6 sm:gap-8 sm:px-8 sm:py-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,30rem)] lg:items-stretch lg:gap-8 lg:pt-16",
            )}
          >
          <div className="flex min-h-0 min-w-0 flex-col space-y-4 lg:min-h-0">
            <div className="flex min-w-0 items-start justify-between gap-x-3 gap-y-2 max-lg:items-center">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full border-brand/20 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                  RouteLAB
                </Badge>
              </div>
              <div className="no-print z-30 flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-5 lg:absolute lg:right-7 lg:top-5 xl:right-8 xl:top-7">
                {variant === "public" ? <PublicThemeToggleHint /> : null}
                <PublicThemeToggle className="shrink-0" />
              </div>
            </div>

            <div className="min-w-0 space-y-3">
              <div className="min-w-0 text-sm font-medium text-brand">
                <span className="block min-w-0 break-words leading-snug">{displayLead.company}</span>
              </div>
              <div className="min-w-0">
                <h1 className="break-words text-2xl font-extrabold leading-tight tracking-tight text-foreground text-balance sm:text-3xl sm:leading-snug lg:text-4xl">
                  Proposta Personalizada
                </h1>
                <p className="mt-3 max-w-3xl break-words text-sm leading-relaxed text-muted-foreground sm:text-base">
                  Uma proposta pensada exclusivamente para você.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SummaryStat
                label="Validade"
                value={formatDate(proposal.validUntilDate)}
                icon={CalendarDays}
                badge={validityStatus}
              />
              <SummaryStat
                label="Proposta pontual"
                value={`${spotCount} plano${spotCount === 1 ? "" : "s"}`}
                icon={FileText}
                valueNumberAccent="spot"
              />
              <SummaryStat
                label="Proposta recorrente"
                value={`${recurringCount} plano${recurringCount === 1 ? "" : "s"}`}
                icon={Building2}
                valueNumberAccent="recurring"
              />
            </div>

            {fieldError ? (
              <div
                className={cn(
                  "border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200",
                  RR.stat,
                )}
              >
                {fieldError}
              </div>
            ) : null}

            {isDashboard && publicHref && publicLinkOrigin ? (
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 overflow-x-auto break-all rounded-md bg-muted px-2 py-2 text-left text-xs leading-relaxed text-foreground/90 sm:px-3 sm:py-2 sm:text-sm">
                  {`${publicLinkOrigin}${publicHref}`}
                </code>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="cta"
                    className="gap-2"
                    onClick={() => void handleCopyLink()}
                  >
                    {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                  <a
                    href={publicHref}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ variant: "outline" }), "gap-2 no-underline")}
                  >
                    <ExternalLink className="size-4" aria-hidden />
                    Abrir
                  </a>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex min-h-0 w-full min-w-0 flex-col items-center justify-center lg:h-full lg:min-h-0 lg:items-center">
            <div className="flex w-full max-w-full items-center justify-center gap-0 py-4 max-sm:-space-x-10 sm:-space-x-[3.25rem] sm:py-5 lg:-space-x-[3.6rem] lg:py-2">
              <div className="relative z-10 shrink-0">
                <IdentityThumb
                  title={displayLead.company}
                  imageUrl={leadImageUrl}
                  fallback={displayLead.company}
                  tone="muted"
                  shrinkOnNarrow
                  busy={uploadingSlot === "lead"}
                  replaceButtonSide="left"
                  onPickFile={
                    isDashboard ? (file) => void handleImageReplace("lead", file) : undefined
                  }
                />
              </div>
              <div className="relative z-20 shrink-0">
                <IdentityThumb
                  title={displayAgencyName}
                  imageUrl={displayAgencyImage}
                  fallback={displayAgencyName}
                  tone="brand"
                  shrinkOnNarrow
                  busy={uploadingSlot === "agency" || (isDashboard && agencyImageUploadAllowed === null)}
                  replaceButtonSide="right"
                  onPickFile={
                    isDashboard ? (file) => void handleImageReplace("agency", file) : undefined
                  }
                />
              </div>
            </div>
          </div>
          </div>
        </div>
      </section>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="min-w-0 overflow-hidden border-border bg-card pt-0 shadow-xl dark:border-white/5 dark:bg-white/[0.02]">
          <CardHeader
            className={cn(
              "rounded-t-md border-b border-border pb-5 pt-4 dark:border-white/10 sm:pb-6 sm:pt-5",
              "bg-gradient-to-b from-brand/[0.14] via-brand/[0.06] to-brand/[0.02] dark:from-brand/20 dark:via-brand/12 dark:to-brand/[0.06]",
            )}
          >
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <CardTitle className="text-xl font-bold text-foreground">Perfil da empresa</CardTitle>
                <CardDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Um resumo para contextualizar esta proposta.
                </CardDescription>
              </div>
              {isDashboard ? (
                <Button type="button" variant="outline" className="gap-2" onClick={() => setEditingProfile((prev) => !prev)}>
                  <Pencil className="size-4" aria-hidden />
                  {editingProfile ? "Fechar edição" : "Editar"}
                </Button>
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-6">
            <div
              className={cn(
                "border border-border bg-background/80 p-4 dark:border-white/10 dark:bg-white/[0.03]",
                RR.panel,
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Proposta para:
              </p>
              <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3.5 text-sm text-muted-foreground sm:gap-x-5 sm:gap-y-4">
                {(displayLead.websiteUrl || displayLead.instagramUrl || displayLead.gmbUrl) && (
                  <>
                    <span className="shrink-0 flex items-center">Links</span>
                    <div className="flex items-center gap-2">
                      {displayLead.websiteUrl && (
                        <a 
                          href={displayLead.websiteUrl.startsWith("http") ? displayLead.websiteUrl : `https://${displayLead.websiteUrl}`} 
                          target="_blank" 
                          rel="noreferrer" 
                          title="Site"
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-[#3B82F6]/30 bg-[#3B82F6]/5 text-[#3B82F6] transition-colors hover:border-[#3B82F6]/50 hover:bg-[#3B82F6]/10"
                        >
                          <Globe className="size-3.5" />
                        </a>
                      )}
                      {displayLead.instagramUrl && (
                        <a 
                          href={displayLead.instagramUrl.startsWith("http") ? displayLead.instagramUrl : `https://instagram.com/${displayLead.instagramUrl.replace(/^@/, "")}`} 
                          target="_blank" 
                          rel="noreferrer" 
                          title="Instagram"
                          className="flex h-6 w-6 items-center justify-center rounded-md border-[#E4405F]/30 bg-[#E4405F]/5 text-[#E4405F] transition-colors hover:border-[#E4405F]/50 hover:bg-[#E4405F]/10"
                        >
                          <AtSign className="size-3.5" />
                        </a>
                      )}
                      {displayLead.gmbUrl && (
                        <a 
                          href={displayLead.gmbUrl} 
                          target="_blank" 
                          rel="noreferrer" 
                          title="Google Meu Negócio"
                          className="flex h-6 w-6 items-center justify-center rounded-md border-[#8B5CF6]/30 bg-[#8B5CF6]/5 text-[#8B5CF6] transition-colors hover:border-[#8B5CF6]/50 hover:bg-[#8B5CF6]/10"
                        >
                          <MapPin className="size-3.5" />
                        </a>
                      )}
                    </div>
                  </>
                )}
                <span className="shrink-0">Cliente</span>
                <span className="min-w-0 font-medium leading-5 text-foreground">{displayLead.name}</span>
                <span className="shrink-0">Empresa</span>
                <span className="min-w-0 font-medium leading-5 text-foreground">{displayLead.company}</span>
                {displayLead.email?.trim() ? (
                  <>
                    <span className="shrink-0 flex items-center">E-mail</span>
                    <span className="min-w-0 font-medium leading-5 text-foreground flex items-center">
                      <span className="truncate">{displayLead.email}</span>
                      <InlineCopyButton value={displayLead.email} label="e-mail" />
                    </span>
                  </>
                ) : null}
                {displayLead.phone?.trim() ? (
                  <>
                    <span className="shrink-0 flex items-center">WhatsApp / Tel.</span>
                    <span className="min-w-0 font-medium leading-5 text-foreground flex items-center">
                      <span className="truncate">{maskPhoneDisplayLoose(displayLead.phone)}</span>
                      <InlineCopyButton 
                        value={(() => {
                          const d = displayLead.phone!.replace(/\D/g, "");
                          return d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
                        })()} 
                        label="telefone" 
                        tooltip="Copiar telefone sem +55" 
                      />
                    </span>
                  </>
                ) : null}
                <span className="shrink-0">Validade</span>
                <span className="min-w-0 flex items-center gap-3">
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "h-5 shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold sm:text-[11px]",
                      validityTone(proposal.validUntilDate).className,
                      "[&_.text-muted-foreground]:text-inherit [&_.text-muted-foreground]:opacity-80"
                    )}
                  >
                    {remainingValidityDisplay(proposal.validUntilDate)}
                  </Badge>
                  {isDashboard && (
                    <button
                      type="button"
                      onClick={() => setExtendValidityModalOpen(true)}
                      className="text-[11px] font-semibold text-brand hover:underline tracking-wide"
                    >
                      Deseja prorrogar?
                    </button>
                  )}
                </span>
              </div>
            </div>

            {editingProfile && isDashboard ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="proposal-executive-summary">Resumo da empresa para o cliente</Label>
                  <Textarea
                    id="proposal-executive-summary"
                    value={profileDraft.executiveSummary}
                    onChange={(e) => setProfileDraft((prev) => ({ ...prev, executiveSummary: e.target.value }))}
                    className="min-h-32"
                    placeholder="Escreva um resumo curto, claro e personalizado para o lead."
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="cta" className="gap-2" onClick={() => void handleSaveProfile()} disabled={savingProfile}>
                    {savingProfile ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
                    {savingProfile ? "Salvando…" : "Salvar perfil"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <div
                    className={cn(
                      "border border-border bg-muted/35 p-4 text-sm leading-relaxed text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]",
                      RR.stat,
                    )}
                  >
                    {companyOverviewParagraphs.length ? (
                      <div className="space-y-3">
                        {companyOverviewParagraphs.map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                      </div>
                    ) : (
                      <p>Nenhum resumo foi definido ainda para este lead.</p>
                    )}
                  </div>
                </div>

              </>
            )}
          </CardContent>
        </Card>

        <Card
          className={cn(
            "min-w-0 overflow-hidden border-border bg-card shadow-xl dark:border-white/5 dark:bg-white/[0.02]",
            "gap-0 pt-0",
          )}
        >
          <input
            ref={coverFileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const f = event.target.files?.[0];
              if (f) void handleCoverReplace(f);
              event.currentTarget.value = "";
            }}
          />
          <div className="relative aspect-[2.1/1] w-full min-h-[6.5rem] max-h-[11rem] sm:min-h-[7.5rem] sm:max-h-[12rem]">
            <Image
              src={displayAgencyCoverUrl}
              alt={`Capa institucional — ${displayAgencyName}`}
              fill
              className="object-cover object-center"
              sizes="(max-width: 1280px) 100vw, 520px"
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card/40 to-transparent"
              aria-hidden
            />
            {isDashboard ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={openAgencyCoverPicker}
                disabled={uploadingSlot === "cover"}
                className="absolute bottom-3 right-3 z-[8] size-9 rounded-md border border-border/80 bg-background/95 text-muted-foreground shadow-md backdrop-blur-sm hover:bg-muted hover:text-foreground sm:bottom-4 sm:right-4"
                aria-label="Trocar capa desta proposta"
              >
                {uploadingSlot === "cover" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <ImagePlus className="size-4" aria-hidden />
                )}
              </Button>
            ) : null}
          </div>
          <CardHeader
            className={cn("border-b border-border pb-5 pt-5 dark:border-white/5")}
          >
            <CardTitle className="text-xl font-bold text-foreground">Sobre a {displayAgencyName}</CardTitle>
            <CardDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Conheca, em poucas linhas, a visão, a abordagem e o contexto de quem conduz este projeto ao seu lado.
              {isDashboard ? (
                <span className="mt-2 block text-xs text-muted-foreground/90">
                  O texto e os contactos nesta coluna podem ser ajustados só para esta proposta. Alterações globais da agência ficam em Configurações.
                </span>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "relative inline-flex h-12 w-12 shrink-0 overflow-hidden border border-brand/20 bg-brand/10 text-brand p-1.5",
                  RR.logoMark,
                )}
              >
                <Image
                  src={displayAgencyLogoForBadge}
                  alt={`Logo ${displayAgencyName}`}
                  fill
                  className="object-contain"
                  sizes="48px"
                />
              </div>
              <div>
                <p className="text-base font-bold text-foreground">{displayAgencyName}</p>
                <p className="text-sm text-muted-foreground">Visão e posicionamento do projeto</p>
              </div>
            </div>

            <div
              className={cn(
                "relative border border-border bg-muted/35 p-5 text-sm leading-relaxed text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]",
                RR.panel,
                isDashboard && !editingAgencySummary ? "pb-11 sm:pb-12" : null,
              )}
            >
              {editingAgencySummary && isDashboard ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="proposal-agency-summary">Texto institucional (só esta proposta)</Label>
                    <Textarea
                      id="proposal-agency-summary"
                      value={agencySummaryDraft}
                      onChange={(e) => setAgencySummaryDraft(e.target.value)}
                      disabled={savingAgencySummary}
                      rows={8}
                      className="min-h-[8rem] resize-y text-[14.5px] leading-relaxed text-foreground"
                      placeholder="Apresente a sua agência para o cliente."
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="cta"
                      size="sm"
                      className="gap-1.5"
                      disabled={savingAgencySummary}
                      onClick={() => void handleSaveAgencySummary()}
                    >
                      {savingAgencySummary ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                      Salvar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={savingAgencySummary}
                      onClick={cancelAgencySummaryEdit}
                    >
                      Cancelar
                    </Button>
                  </div>
                </>
              ) : agencySummaryParagraphs.length ? (
                <div className="space-y-3">
                  {agencySummaryParagraphs.map((paragraph, idx) => (
                    <p key={`${idx}-${paragraph.slice(0, 48)}`} className="text-muted-foreground">
                      {paragraph}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  {isDashboard
                    ? "Ainda não há texto institucional nesta proposta. Use «Editar» para adicionar."
                    : "Em breve, este espaco trara uma apresentacao institucional da agencia."}
                </p>
              )}
              {isDashboard && !editingAgencySummary ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={savingAgencySummary}
                  onClick={() => tryStartAgencyCustomization("summary")}
                  className="no-print absolute bottom-3 right-4 z-20 size-8 rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-foreground sm:bottom-4 sm:right-7"
                  aria-label="Editar texto institucional desta proposta"
                >
                  <Pencil className="size-3.5" aria-hidden />
                </Button>
              ) : null}
            </div>

            {editingAgencyContacts && isDashboard ? (
              <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-5 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-xs font-medium text-muted-foreground">
                  Contactos e serviços (só esta proposta — não altera Configurações).
                </p>
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="proposal-agency-phone">Telefone</Label>
                    <Input
                      id="proposal-agency-phone"
                      value={agencyContactDraft.companyPhone ?? ""}
                      onChange={(e) => setAgencyContactDraft((p) => ({ ...p, companyPhone: e.target.value }))}
                      disabled={savingAgencyContacts}
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="proposal-agency-wa">WhatsApp</Label>
                    <Input
                      id="proposal-agency-wa"
                      value={agencyContactDraft.whatsApp ?? ""}
                      onChange={(e) => setAgencyContactDraft((p) => ({ ...p, whatsApp: e.target.value }))}
                      disabled={savingAgencyContacts}
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="proposal-agency-address">Endereço</Label>
                    <Textarea
                      id="proposal-agency-address"
                      value={agencyContactDraft.address ?? ""}
                      onChange={(e) => setAgencyContactDraft((p) => ({ ...p, address: e.target.value }))}
                      disabled={savingAgencyContacts}
                      rows={2}
                      className="resize-y"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="proposal-agency-site">Site</Label>
                    <Input
                      id="proposal-agency-site"
                      value={agencyContactDraft.websiteUrl ?? ""}
                      onChange={(e) => setAgencyContactDraft((p) => ({ ...p, websiteUrl: e.target.value }))}
                      disabled={savingAgencyContacts}
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="proposal-agency-ig">Instagram</Label>
                    <Input
                      id="proposal-agency-ig"
                      value={agencyContactDraft.instagramUrl ?? ""}
                      onChange={(e) => setAgencyContactDraft((p) => ({ ...p, instagramUrl: e.target.value }))}
                      disabled={savingAgencyContacts}
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="proposal-agency-yt">YouTube</Label>
                    <Input
                      id="proposal-agency-yt"
                      value={agencyContactDraft.youtubeUrl ?? ""}
                      onChange={(e) => setAgencyContactDraft((p) => ({ ...p, youtubeUrl: e.target.value }))}
                      disabled={savingAgencyContacts}
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="proposal-agency-services">Serviços</Label>
                    <Textarea
                      id="proposal-agency-services"
                      value={agencyContactDraft.services ?? ""}
                      onChange={(e) => setAgencyContactDraft((p) => ({ ...p, services: e.target.value }))}
                      disabled={savingAgencyContacts}
                      rows={4}
                      className="resize-y"
                      placeholder="Um tópico por linha ou parágrafos separados."
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="cta"
                    size="sm"
                    className="gap-1.5"
                    disabled={savingAgencyContacts}
                    onClick={() => void handleSaveAgencyContacts()}
                  >
                    {savingAgencyContacts ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                    Salvar
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={savingAgencyContacts} onClick={cancelAgencyContactsEdit}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : isDashboard || agencyContactRows.length ? (
              <div
                className={cn(
                  "relative min-w-0 overflow-hidden border border-border bg-muted/25 p-5 dark:border-white/10 dark:bg-white/[0.03]",
                  RR.panel,
                  isDashboard ? "pb-11 sm:pb-12" : null,
                )}
              >
                {agencyContactRows.length ? (
                  <ul className="m-0 min-w-0 list-none space-y-4 p-0">
                    {agencyContactRows.map((row) => {
                      const Icon = row.icon;
                      const body =
                        row.topicLines && row.topicLines.length > 0 ? (
                          <ul className="m-0 min-w-0 list-none space-y-2.5 p-0" aria-label={row.label}>
                            {row.topicLines.map((line, idx) => (
                              <li key={`${row.key}-${idx}`} className="flex min-w-0 gap-2.5">
                                <span
                                  className="mt-2 size-1.5 shrink-0 rounded-full bg-brand ring-1 ring-brand/35"
                                  aria-hidden
                                />
                                <span className="min-w-0 break-words text-sm font-medium leading-snug text-foreground">
                                  {line}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : row.href ? (
                          <a
                            href={row.href}
                            className="block min-w-0 max-w-full break-all text-sm font-medium text-foreground underline decoration-brand/35 underline-offset-2 transition-colors hover:text-brand sm:break-words"
                            {...(row.external ? { target: "_blank", rel: "noreferrer" } : {})}
                          >
                            {row.value}
                          </a>
                        ) : (
                          <span
                            className={cn(
                              "block min-w-0 max-w-full text-sm font-medium text-foreground/90 [overflow-wrap:anywhere]",
                              row.multiline ? "whitespace-pre-line" : "",
                            )}
                          >
                            {row.value}
                          </span>
                        );
                      return (
                        <li key={row.key} className="min-w-0 space-y-1">
                          <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <Icon className="size-3.5 shrink-0 text-brand" aria-hidden />
                            <span className="min-w-0">{row.label}</span>
                          </div>
                          <div className="min-w-0 max-w-full pl-5">{body}</div>
                        </li>
                      );
                    })}
                  </ul>
                ) : isDashboard ? (
                  <p className="text-sm text-muted-foreground">
                    Sem dados de contacto nesta proposta. Use «Editar» para preencher.
                  </p>
                ) : null}
                {isDashboard && !editingAgencyContacts ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={savingAgencyContacts}
                    onClick={() => tryStartAgencyCustomization("contacts")}
                    className="no-print absolute bottom-3 right-4 z-20 size-8 rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-foreground sm:bottom-4 sm:right-7"
                    aria-label="Editar contactos da agência nesta proposta"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </Button>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <ProposalPlansSection
        proposal={proposal}
        readOnly={!isDashboard}
        variant={variant}
        onAddPlan={isDashboard ? (kind) => void handleAddPlan(kind) : undefined}
        onAbandonEmptyPlan={isDashboard ? (kind, planId) => void handleAbandonEmptyPlan(kind, planId) : undefined}
        onDeletePlan={isDashboard ? (kind, planId) => void handleDeletePlan(kind, planId) : undefined}
        onSavePlan={
          isDashboard
            ? async (kind, next) => {
                setFieldError(null);
                try {
                  if (kind === "spot") {
                    await applyProposalPatch({
                      spotPlans: proposal.spotPlans.map((p) => (p.id === next.id ? next : p)),
                      updatedAt: Date.now(),
                    });
                  } else {
                    await applyProposalPatch({
                      recurringPlans: proposal.recurringPlans.map((p) => (p.id === next.id ? next : p)),
                      updatedAt: Date.now(),
                    });
                  }
                } catch (e) {
                  console.error(e);
                  setFieldError("Não foi possível guardar o plano.");
                  throw e;
                }
              }
            : undefined
        }
      />

      {isDashboard ? (
        <PaymentLinksPanel proposal={proposal} onProposalChange={onProposalChange} />
      ) : null}

      <ProposalNextStepsSpotlight
        stepsForList={nextStepsEditing ? nextStepsDraft : displayNextSteps}
        leadEmail={displayLead.email}
        bottomCta={effectiveReportCta.bottom}
        isDashboard={isDashboard}
        editing={nextStepsEditing}
        saving={nextStepsSaving}
        onStartEdit={startNextStepsEdit}
        onCancel={cancelNextStepsEdit}
        onSave={saveNextSteps}
        onDraftChange={(i, value) =>
          setNextStepsDraft((prev) => {
            const next = [...prev];
            next[i] = value;
            return next;
          })
        }
        onAddStep={() => setNextStepsDraft((prev) => [...prev, ""])}
        onRemoveStep={(i) => setNextStepsDraft((prev) => prev.filter((_, j) => j !== i))}
      />

      <div className="text-center text-muted-foreground text-xs leading-snug space-y-2.5 py-4 no-print">
        <div className="flex justify-center">
          <Image
            src="/assets/logo/logo-dark.png"
            alt="Rota Digital"
            width={220}
            height={62}
            className="h-6 w-auto object-contain object-center dark:hidden"
          />
          <Image
            src="/assets/logo/logo-white.png"
            alt="Rota Digital"
            width={220}
            height={62}
            className="hidden h-6 w-auto object-contain object-center dark:block"
          />
        </div>
        <span className="block">{proposalCreatedAtLine2}</span>
      </div>

      {isDashboard ? (
        <Dialog
          open={removePlanTarget !== null}
          onOpenChange={(open) => {
            if (!open && !removePlanBusy) setRemovePlanTarget(null);
          }}
        >
          <DialogContent showCloseButton={!removePlanBusy} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Remover este plano?</DialogTitle>
              <DialogDescription>
                {removePlanPendingTitle ? (
                  <>
                    “{removePlanPendingTitle}” deixará de aparecer nesta proposta e na página pública.
                  </>
                ) : (
                  "Este plano deixará de aparecer nesta proposta e na página pública."
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRemovePlanTarget(null)}
                disabled={removePlanBusy}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void confirmRemovePlan()}
                disabled={removePlanBusy}
                className="gap-2"
              >
                {removePlanBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Remover
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
