"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, Crown, Loader2, Sparkles, TriangleAlert } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  LEADS_ADD_ON_PACKS,
  PRO_TO_AGENCY_MONTHLY_DIFF_BRL,
  PROPOSALS_ADD_ON_PACKS,
  ROTAS_ADD_ON_PACKS,
  type PlanKey,
  type QuotaResource,
} from "@/lib/plan-quotas";

const SALES_EMAIL = "suporte@rotadigital.app";

const QUOTA_RENEWAL_NOTE = "*A cota não é acumulativa e renova a cada mês.";

type Kind = QuotaResource | "logo" | "competitors" | "gmb";

export type PlanLimitModalState = {
  kind: Kind;
  plan: PlanKey;
  /** Limite do plano (omitido para `logo`). */
  monthlyLimit?: number;
  /** Consumido no período atual (omitido para `logo`). */
  usedThisMonth?: number;
};

type AddOnPack =
  | { id: string; label: string; price: number; rotas: number; leads?: never; proposals?: never }
  | { id: string; label: string; price: number; leads: number; rotas?: never; proposals?: never }
  | {
      id: string;
      label: string;
      price: number;
      proposals: number;
      rotas?: never;
      leads?: never;
    };

const KIND_COPY: Record<
  Kind,
  {
    badge: string;
    title: string;
    description: string;
    unit: string;
    unitShort: string;
    checkoutEndpoint: string;
    salesSubject: string;
  }
> = {
  rotas: {
    badge: "Cota de Rotas Digital",
    title: "Você atingiu o limite de Rotas Digital",
    description:
      "Cada Rota Digital gerada conta para a cota do seu plano. Reanálises da mesma rota são grátis (a primeira); reanálises extras consomem 1 cota cada.",
    unit: "Rotas Digital",
    unitShort: "rotas",
    checkoutEndpoint: "/api/stripe/rotas-add-on/checkout",
    salesSubject: "Quero comprar pacote extra de Rotas Digital",
  },
  propostas: {
    badge: "Cota de propostas",
    title: "Você atingiu o limite de propostas",
    description:
      "Você já usou todas as propostas incluídas no seu plano. Amplie a cota para seguir fechando negócios sem esperar a renovação.",
    unit: "propostas",
    unitShort: "propostas",
    checkoutEndpoint: "/api/stripe/proposals-add-on/checkout",
    salesSubject: "Quero comprar pacote extra de propostas",
  },
  leads: {
    badge: "Cota de prospecção",
    title: "Você atingiu o limite mensal de prospecções",
    description:
      "Sua captação automática atingiu o teto do plano no período atual. Amplie a cota para seguir prospectando sem interrupções.",
    unit: "leads",
    unitShort: "leads",
    checkoutEndpoint: "/api/stripe/lead-add-on/checkout",
    salesSubject: "Quero comprar pacote extra de leads",
  },
  logo: {
    badge: "Recurso de marca exclusivo",
    title: "Logo e capa próprias são recursos Pro/Agency",
    description:
      "Logótipo, capa e o bloco «Sobre a agência» no relatório Rota digital (link partilhado) estão incluídos a partir do plano Pro. Assine Pro ou Agency para personalizar a sua marca e editar essa secção.",
    unit: "",
    unitShort: "",
    checkoutEndpoint: "",
    salesSubject: "Quero assinar um plano para usar logo personalizada",
  },
  competitors: {
    badge: "Recurso Pro",
    title: "Ranking dos concorrentes",
    description:
      "Compare a sua nota, avaliações e presença com negócios da mesma região. Incluído a partir do plano Pro. Escolha Pro ou Agency abaixo para desbloquear.",
    unit: "",
    unitShort: "",
    checkoutEndpoint: "",
    salesSubject: "Quero assinar um plano para desbloquear o ranking de concorrentes",
  },
  gmb: {
    badge: "Recurso Pro",
    title: "Google Meu Negócio no relatório",
    description:
      "Nota, avaliações, fotos e ligação ao perfil no Maps: incluído a partir do plano Pro. Escolha Pro ou Agency abaixo para desbloquear.",
    unit: "",
    unitShort: "",
    checkoutEndpoint: "",
    salesSubject: "Quero assinar um plano para desbloquear a secção Google Meu Negócio",
  },
};

function packsForKind(kind: Kind): AddOnPack[] {
  if (kind === "rotas") return [...ROTAS_ADD_ON_PACKS];
  if (kind === "leads") return [...LEADS_ADD_ON_PACKS];
  if (kind === "propostas") return [...PROPOSALS_ADD_ON_PACKS];
  return [];
}

function packQuantityLabel(kind: Kind, pack: AddOnPack): string {
  if (kind === "rotas" && "rotas" in pack) return `+${pack.rotas} rotas`;
  if (kind === "leads" && "leads" in pack) return `+${pack.leads} leads`;
  if (kind === "propostas" && "proposals" in pack) return `+${pack.proposals} propostas`;
  return "";
}

type Props = {
  state: PlanLimitModalState | null;
  onClose: () => void;
  /** Token Firebase para autorizar o checkout (opcional; sem token, abre mailto). */
  getIdToken?: () => Promise<string | null>;
};

export function PlanLimitModal({ state, onClose, getIdToken }: Props) {
  const [checkoutBusyId, setCheckoutBusyId] = useState<string | null>(null);
  const [subscribeBusy, setSubscribeBusy] = useState<"pro" | "agency" | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  const open = state != null;
  const kind: Kind = state?.kind ?? "rotas";
  const plan: PlanKey = state?.plan ?? "starter";
  const copy = KIND_COPY[kind];
  const packs = packsForKind(kind);
  const isStarter = plan === "starter";
  const isPro = plan === "pro";
  const isAgency = plan === "agency";
  const isMaster = plan === "master";
  const isFeatureUpsell = kind === "logo" || kind === "competitors" || kind === "gmb";
  const showPacks = !isStarter && !isMaster && !isFeatureUpsell;
  const showAgencyUpsell = isPro && !isFeatureUpsell;
  const showSubscribeCtas = isStarter || isFeatureUpsell;

  const proPriceLabel =
    billingCycle === "monthly" ? "R$ 127" : "R$ 97";
  const agencyPriceLabel =
    billingCycle === "monthly" ? "R$ 347" : "R$ 267";
  const planPriceSuffix =
    billingCycle === "monthly" ? "/mês" : "/mês*";

  useEffect(() => {
    if (state == null) setBillingCycle("monthly");
  }, [state]);

  const handleCheckout = async (packId: string) => {
    if (!copy.checkoutEndpoint) return;
    setCheckoutBusyId(packId);
    try {
      const idToken = (await getIdToken?.()) ?? null;
      const res = await fetch(copy.checkoutEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ packId }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        url?: string;
        setupRequired?: boolean;
        message?: string;
      };
      if (res.ok && typeof payload.url === "string" && payload.url.startsWith("http")) {
        window.location.href = payload.url;
        return;
      }
      if (payload.setupRequired || res.status === 503 || res.status === 501) {
        const subject = encodeURIComponent(`${copy.salesSubject} (${packId})`);
        const body = encodeURIComponent(
          payload.message
            ? `${payload.message}\n\nQuero fechar o pacote ${packId} quando o pagamento online estiver ativo.`
            : `Quero comprar o pacote ${packId}. Avise-me quando o pagamento online estiver disponível.`,
        );
        window.location.href = `mailto:${SALES_EMAIL}?subject=${subject}&body=${body}`;
      }
    } finally {
      setCheckoutBusyId(null);
    }
  };

  const billingCycleParam = billingCycle === "monthly" ? "monthly" : "yearly";

  const handleSubscribePlan = async (planKey: "pro" | "agency") => {
    setSubscribeBusy(planKey);
    try {
      const idToken = (await getIdToken?.()) ?? null;
      if (!idToken) {
        window.location.href = `/cadastro?redirect=${encodeURIComponent(
          `/assinatura?plan=${planKey}&cycle=${billingCycleParam}`,
        )}`;
        return;
      }
      const res = await fetch("/api/stripe/subscription/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ plan: planKey, billingCycle: billingCycleParam }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        skipCheckout?: boolean;
        redirect?: string;
      };
      if (res.ok && payload.skipCheckout === true) {
        window.location.href =
          typeof payload.redirect === "string" ? payload.redirect : "/dashboard";
        return;
      }
      if (res.ok && typeof payload.url === "string" && payload.url.startsWith("http")) {
        window.location.href = payload.url;
        return;
      }
    } finally {
      setSubscribeBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent
        showCloseButton
        className={cn(
          "w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden border-white/10 bg-zinc-950 p-0 text-zinc-100 shadow-2xl sm:max-w-2xl",
          "rounded-2xl ring-1 ring-white/10",
        )}
      >
        <div className="border-b border-white/[0.06] bg-white/[0.015] px-6 py-6 sm:px-8 sm:py-7">
          <DialogHeader className="space-y-3 text-left">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-400/35 bg-amber-500/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
              <TriangleAlert className="size-3.5" aria-hidden />
              {copy.badge}
            </div>
            <DialogTitle className="font-heading text-xl font-semibold tracking-tight text-white">
              {copy.title}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-zinc-200">
              {copy.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 py-6 sm:px-8 sm:py-7">
          {!isFeatureUpsell ? (
            <div className="grid gap-3 rounded-xl border border-white/12 bg-white/[0.04] p-4 sm:grid-cols-3">
              <InfoCell label="Plano" value={plan.toUpperCase()} icon={<Crown className="size-3.5 text-brand" aria-hidden />} />
              <InfoCell
                label="Utilizado no mês"
                value={
                  <>
                    {state?.usedThisMonth ?? 0}{" "}
                    <span className="text-[11px] font-medium text-zinc-400">{copy.unitShort}</span>
                  </>
                }
              />
              <InfoCell
                label="Limite do plano"
                value={
                  <>
                    {state?.monthlyLimit ?? 0}{" "}
                    <span className="text-[11px] font-medium text-zinc-400">
                      {copy.unitShort}/mês
                    </span>
                  </>
                }
              />
            </div>
          ) : null}

          {!showSubscribeCtas ? (
            <p className="text-[11px] leading-relaxed text-zinc-500">{QUOTA_RENEWAL_NOTE}</p>
          ) : null}

          {showSubscribeCtas ? (
            <div className="space-y-3">
              <div className="flex min-w-0 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <p className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Escolha um plano para continuar
                </p>
                <ModalBillingCycleToggle
                  billingCycle={billingCycle}
                  onBillingCycleChange={setBillingCycle}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <PlanUpgradeCard
                  title="Plano Pro"
                  price={proPriceLabel}
                  priceSuffix={planPriceSuffix}
                  showAnnualBillingNote={billingCycle === "yearly"}
                  showQuotaRenewalNote
                  bullets={[
                    "20 Rotas Digital",
                    "30 propostas",
                    "50 prospecções de leads.",
                    "Logo e capa personalizadas",
                  ]}
                  href={`/assinatura?plan=pro&cycle=${billingCycleParam}`}
                  onAssinar={() => void handleSubscribePlan("pro")}
                  assinarBusy={subscribeBusy === "pro"}
                />
                <PlanUpgradeCard
                  title="Plano Agency"
                  price={agencyPriceLabel}
                  priceSuffix={planPriceSuffix}
                  showAnnualBillingNote={billingCycle === "yearly"}
                  showQuotaRenewalNote
                  emphasize
                  bullets={[
                    "50 Rotas Digital",
                    "Propostas ilimitadas",
                    "100 prospecções de leads",
                    "Link público + marca própria",
                  ]}
                  href={`/assinatura?plan=agency&cycle=${billingCycleParam}`}
                  onAssinar={() => void handleSubscribePlan("agency")}
                  assinarBusy={subscribeBusy === "agency"}
                />
              </div>
            </div>
          ) : null}

          {showPacks && packs.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Pacotes extras disponíveis
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {packs.map((pack) => (
                  <div
                    key={pack.id}
                    className="flex flex-col rounded-xl border border-white/12 bg-white/[0.04] p-4 transition-colors hover:border-brand/40 hover:bg-white/[0.06]"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                      {pack.label}
                    </p>
                    <p className="mt-1 text-lg font-bold text-zinc-50">
                      {packQuantityLabel(kind, pack)}
                    </p>
                    <p className="mt-2 inline-flex items-end gap-0.5 text-brand">
                      <span className="self-start text-xs font-semibold leading-none">R$</span>
                      <span className="text-[2rem] leading-[0.9] font-black tabular-nums">
                        {pack.price}
                      </span>
                      <span className="self-start text-xs font-semibold leading-none">,00</span>
                    </p>
                    <p className="text-[11px] text-zinc-400">pagamento único</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full border-white/15 text-zinc-100 hover:bg-white/10"
                      disabled={checkoutBusyId === pack.id}
                      onClick={() => void handleCheckout(pack.id)}
                    >
                      {checkoutBusyId === pack.id ? (
                        <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
                      ) : null}
                      {checkoutBusyId === pack.id ? "A abrir…" : "Comprar"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {showAgencyUpsell ? (
            <div className="flex flex-col gap-3 rounded-xl border border-brand/35 bg-brand/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand">
                  <Sparkles className="size-3.5" aria-hidden />
                  Compensa mais trocar de plano
                </p>
                <p className="text-sm leading-relaxed text-zinc-100">
                  Por apenas <strong>R$ {PRO_TO_AGENCY_MONTHLY_DIFF_BRL}/mês</strong> a mais, o plano{" "}
                  <strong>Agency</strong> te dá +30 Rotas, +50 leads, propostas ilimitadas, link
                  público e sua marca.
                </p>
              </div>
              <Button
                type="button"
                variant="cta"
                size="lg"
                className="gap-2"
                disabled={subscribeBusy === "agency"}
                onClick={() => void handleSubscribePlan("agency")}
              >
                {subscribeBusy === "agency" ? (
                  <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
                ) : (
                  <ArrowUpRight className="size-4" aria-hidden />
                )}
                {subscribeBusy === "agency" ? "A abrir…" : "Assinar Agency"}
              </Button>
            </div>
          ) : null}

          {isAgency && !isFeatureUpsell && packs.length > 0 ? (
            <p className="text-xs leading-relaxed text-zinc-400">
              Já está no plano Agency. Use um pacote extra para cobrir picos de produção sem mexer
              na assinatura.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] bg-white/[0.02] px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-8 sm:py-5">
          <Button type="button" variant="ghost" onClick={onClose}>
            Agora não
          </Button>
          <a
            href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(copy.salesSubject)}`}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2")}
          >
            Falar com comercial
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoCell({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-100">
        {icon}
        {value}
      </p>
    </div>
  );
}

function ModalBillingCycleToggle({
  billingCycle,
  onBillingCycleChange,
}: {
  billingCycle: "monthly" | "yearly";
  onBillingCycleChange: (next: "monthly" | "yearly") => void;
}) {
  return (
    <div
      className={cn(
        "relative inline-flex h-11 shrink-0 items-stretch rounded-full border p-0.5 text-[12px]",
        "border-white/15 bg-zinc-900/80 shadow-[inset_0_2px_12px_rgba(0,0,0,0.35)]",
      )}
      role="tablist"
      aria-label="Ciclo de cobrança dos planos"
    >
      <div className="relative flex items-center gap-0.5">
        <motion.button
          type="button"
          role="tab"
          whileTap={{ scale: 0.98 }}
          aria-selected={billingCycle === "monthly"}
          onClick={() => onBillingCycleChange("monthly")}
          className={cn(
            "relative isolate min-w-[6.25rem] rounded-full px-3.5 py-2 text-[12px] font-bold tracking-normal transition-colors duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
            billingCycle === "monthly"
              ? "text-zinc-950"
              : "text-zinc-400 hover:text-zinc-200",
          )}
        >
          {billingCycle === "monthly" && (
            <motion.div
              layoutId="active-billing-modal"
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 z-0 rounded-full",
                "shadow-[0_3px_12px_-3px_rgba(60,50,30,0.45),0_0_0_1px_rgba(0,0,0,0.12)] ring-2 ring-white/20",
              )}
              style={{ backgroundColor: "var(--brand)" }}
              transition={{ type: "spring", bounce: 0.22, stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative z-10">Mensal</span>
        </motion.button>

        <motion.button
          type="button"
          role="tab"
          whileTap={{ scale: 0.98 }}
          aria-selected={billingCycle === "yearly"}
          onClick={() => onBillingCycleChange("yearly")}
          className={cn(
            "relative isolate flex min-w-[6.75rem] items-center justify-center gap-1.5 rounded-full px-2.5 py-2 text-[12px] font-bold tracking-normal transition-colors duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
            billingCycle === "yearly"
              ? "text-zinc-950"
              : "text-zinc-400 hover:text-zinc-200",
          )}
        >
          {billingCycle === "yearly" && (
            <motion.div
              layoutId="active-billing-modal"
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 z-0 rounded-full",
                "shadow-[0_3px_12px_-3px_rgba(60,50,30,0.45),0_0_0_1px_rgba(0,0,0,0.12)] ring-2 ring-white/20",
              )}
              style={{ backgroundColor: "var(--brand)" }}
              transition={{ type: "spring", bounce: 0.22, stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative z-10">Anual</span>
          <span
            className={cn(
              "relative z-10 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.06em]",
              billingCycle === "yearly"
                ? "bg-white text-zinc-950 shadow-sm ring-1 ring-black/10"
                : "bg-brand/20 text-[#f8f0d4] ring-1 ring-brand/35",
            )}
          >
            -24%
          </span>
        </motion.button>
      </div>
    </div>
  );
}

/** Negrito nos algarismos; "Propostas ilimitadas" em destaque amarelo. */
function renderPlanBulletBody(text: string): ReactNode {
  if (text === "Propostas ilimitadas") {
    return (
      <span className="font-semibold text-brand dark:text-brand">Propostas ilimitadas</span>
    );
  }
  const parts = text.split(/(\d+)/);
  return parts.map((part, i) =>
    /^\d+$/.test(part) ? (
      <strong key={i} className="font-semibold text-zinc-50">
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function PlanUpgradeCard({
  title,
  price,
  priceSuffix,
  showAnnualBillingNote,
  showQuotaRenewalNote,
  bullets,
  href,
  emphasize,
  onAssinar,
  assinarBusy,
}: {
  title: string;
  price: string;
  priceSuffix?: string;
  showAnnualBillingNote?: boolean;
  showQuotaRenewalNote?: boolean;
  bullets: string[];
  /** Fallback com JS desligado ou acessibilidade. */
  href: string;
  emphasize?: boolean;
  onAssinar?: () => void | Promise<void>;
  assinarBusy?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border p-4 transition-colors",
        emphasize
          ? "border-brand/40 bg-brand/10 hover:border-brand/60"
          : "border-white/12 bg-white/[0.04] hover:border-brand/40 hover:bg-white/[0.06]",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{title}</p>
      <p className="mt-1 inline-flex items-end gap-1 text-brand">
        <span className="text-[2rem] leading-[0.9] font-black tabular-nums">{price}</span>
        <span className="self-end pb-1 text-xs font-semibold text-zinc-300">
          {priceSuffix ?? "/mês"}
        </span>
      </p>
      {showAnnualBillingNote ? (
        <p className="mt-1 text-[10px] leading-snug text-zinc-500">*cobrado anualmente</p>
      ) : null}
      <ul className="mt-3 space-y-1.5 text-xs text-zinc-200">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="text-brand">•</span>
            <span>{renderPlanBulletBody(b)}</span>
          </li>
        ))}
      </ul>
      {showQuotaRenewalNote ? (
        <p className="mt-3 text-[10px] leading-relaxed text-zinc-500">{QUOTA_RENEWAL_NOTE}</p>
      ) : null}
      {onAssinar ? (
        <Button
          type="button"
          variant={emphasize ? "cta" : "outline"}
          size="sm"
          className={cn("w-full", showQuotaRenewalNote ? "mt-3" : "mt-4")}
          disabled={assinarBusy}
          onClick={() => void onAssinar()}
        >
          {assinarBusy ? (
            <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
          ) : null}
          {assinarBusy ? "A abrir…" : "Assinar"}
        </Button>
      ) : (
        <a
          href={href}
          className={cn(
            buttonVariants({ variant: emphasize ? "cta" : "outline", size: "sm" }),
            "w-full",
            showQuotaRenewalNote ? "mt-3" : "mt-4",
          )}
        >
          Assinar
        </a>
      )}
    </div>
  );
}
