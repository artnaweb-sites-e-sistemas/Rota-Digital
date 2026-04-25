"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import {
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  Unlink,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { updateProposal } from "@/lib/proposals";
import { parseCurrencyInputToCents } from "@/lib/currency-brl-input";
import { normalizeInstallmentCount } from "@/lib/proposal-plan-installments";
import { cn } from "@/lib/utils";
import type { Proposal, ProposalPlan } from "@/types/proposal";

function formatDateBr(ms: number): string {
  return new Date(ms).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      title="Copiar link"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

function TruncatedUrl({ url }: { url: string }) {
  const display = url.length > 55 ? `${url.slice(0, 52)}…` : url;
  return (
    <span className="truncate text-xs text-muted-foreground" title={url}>
      {display}
    </span>
  );
}

export function PaymentLinksPanel({
  proposal,
  onProposalChange,
}: {
  proposal: Proposal;
  onProposalChange?: (p: Proposal) => void;
}) {
  const { user } = useAuth();
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"activate" | "regenerate" | "deactivate">("activate");
  const [error, setError] = useState<string | null>(null);

  const loadAccount = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "userSettings", user.uid));
      if (snap.exists()) {
        const data = snap.data() as Record<string, unknown>;
        const id = typeof data.stripeConnectAccountId === "string" ? data.stripeConnectAccountId : null;
        setStripeAccountId(id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  if (loading || !stripeAccountId) return null;

  const allPlans = [...(proposal.spotPlans ?? []), ...(proposal.recurringPlans ?? [])];
  const hasAnyPaymentUrl = allPlans.some((p) => p.paymentUrl?.trim());
  const isActivated = Boolean(proposal.paymentLinksActivatedAt) && hasAnyPaymentUrl;

  const plansWereEditedAfterActivation =
    isActivated &&
    proposal.paymentLinksActivatedAt &&
    proposal.updatedAt > proposal.paymentLinksActivatedAt;

  const openConfirm = (action: "activate" | "regenerate" | "deactivate") => {
    setConfirmAction(action);
    setConfirmOpen(true);
    setError(null);
  };

  const generateLinks = async () => {
    if (!user || !stripeAccountId) return;
    setActivating(true);
    setError(null);

    try {
      const idToken = await user.getIdToken();
      const updatedSpotPlans = [...(proposal.spotPlans ?? [])];
      const updatedRecurringPlans = [...(proposal.recurringPlans ?? [])];

      const processPlan = async (plan: ProposalPlan, isRecurring: boolean) => {
        const priceCents = parseCurrencyInputToCents(plan.price);
        if (!priceCents || priceCents <= 0) return plan;

        const installments = isRecurring ? 1 : normalizeInstallmentCount(plan.installmentCount);
        const cashPriceCents = !isRecurring && plan.cashPrice
          ? parseCurrencyInputToCents(plan.cashPrice)
          : null;

        const body: Record<string, unknown> = {
          accountId: stripeAccountId,
          planName: plan.title || "Plano",
          amount: priceCents,
        };

        if (installments > 1) body.installments = installments;
        if (cashPriceCents && cashPriceCents > 0 && cashPriceCents < priceCents) {
          body.discountAmount = cashPriceCents;
        }

        const res = await fetch("/api/stripe/connect/create-payment-link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "Erro ao criar link de pagamento.");
        }

        const data = (await res.json()) as { url: string; urlDiscount?: string };
        return {
          ...plan,
          paymentUrl: data.url,
          paymentUrlDiscount: data.urlDiscount,
        };
      };

      for (let i = 0; i < updatedSpotPlans.length; i++) {
        updatedSpotPlans[i] = await processPlan(updatedSpotPlans[i], false);
      }
      for (let i = 0; i < updatedRecurringPlans.length; i++) {
        updatedRecurringPlans[i] = await processPlan(updatedRecurringPlans[i], true);
      }

      const now = Date.now();
      await updateProposal(proposal.id, {
        spotPlans: updatedSpotPlans,
        recurringPlans: updatedRecurringPlans,
        paymentLinksActivatedAt: now,
        updatedAt: now,
      });

      onProposalChange?.({
        ...proposal,
        spotPlans: updatedSpotPlans,
        recurringPlans: updatedRecurringPlans,
        paymentLinksActivatedAt: now,
        updatedAt: now,
      });

      setConfirmOpen(false);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Erro ao gerar links.");
    } finally {
      setActivating(false);
    }
  };

  const deactivateLinks = async () => {
    if (!user) return;
    setActivating(true);
    setError(null);

    try {
      const clearUrl = (plan: ProposalPlan) => {
        const { paymentUrl: _u, paymentUrlDiscount: _d, ...rest } = plan;
        return rest as ProposalPlan;
      };

      const updatedSpotPlans = (proposal.spotPlans ?? []).map(clearUrl);
      const updatedRecurringPlans = (proposal.recurringPlans ?? []).map(clearUrl);
      const now = Date.now();

      await updateProposal(proposal.id, {
        spotPlans: updatedSpotPlans,
        recurringPlans: updatedRecurringPlans,
        updatedAt: now,
      });

      onProposalChange?.({
        ...proposal,
        spotPlans: updatedSpotPlans,
        recurringPlans: updatedRecurringPlans,
        paymentLinksActivatedAt: undefined,
        updatedAt: now,
      });

      setConfirmOpen(false);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Erro ao desativar links.");
    } finally {
      setActivating(false);
    }
  };

  const handleConfirm = () => {
    if (confirmAction === "deactivate") {
      void deactivateLinks();
    } else {
      void generateLinks();
    }
  };

  const confirmMessages = {
    activate: {
      title: "Ativar links de pagamento",
      description:
        "Isso vai gerar os links de pagamento no Stripe e ativá-los na proposta pública. Deseja continuar?",
      button: "Confirmar",
    },
    regenerate: {
      title: "Regenerar links de pagamento",
      description:
        "Isso vai gerar novos links de pagamento no Stripe e substituir os anteriores. Os links antigos permanecerão funcionais no Stripe. Deseja continuar?",
      button: "Regenerar",
    },
    deactivate: {
      title: "Desativar links de pagamento",
      description:
        "Os botões de pagamento serão removidos da proposta pública. Os links continuarão funcionando no Stripe, mas não serão exibidos ao lead.",
      button: "Desativar",
    },
  };

  const msg = confirmMessages[confirmAction];

  return (
    <>
      <section className="mx-auto w-full max-w-5xl">
        <div
          className={cn(
            "rounded-xl border px-5 py-4",
            isActivated
              ? "border-emerald-500/20 bg-emerald-500/[0.04] dark:border-emerald-400/15 dark:bg-emerald-500/[0.03]"
              : "border-border/60 bg-muted/15 dark:border-white/8 dark:bg-white/[0.02]",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {isActivated ? (
                <>
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
                    <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Links de pagamento ativos
                    </p>
                    {proposal.paymentLinksActivatedAt ? (
                      <p className="text-xs text-muted-foreground">
                        desde {formatDateBr(proposal.paymentLinksActivatedAt)}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <CreditCard className="size-4 text-muted-foreground" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    Links de pagamento não ativados
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {!isActivated ? (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => openConfirm("activate")}
                >
                  <Zap className="size-4" aria-hidden />
                  Ativar links de pagamento
                </Button>
              ) : (
                <>
                  {plansWereEditedAfterActivation ? (
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => openConfirm("regenerate")}
                    >
                      <RefreshCw className="size-4" aria-hidden />
                      Regenerar links
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    className="gap-2 text-muted-foreground hover:text-destructive"
                    onClick={() => openConfirm("deactivate")}
                  >
                    <Unlink className="size-4" aria-hidden />
                    Desativar links
                  </Button>
                </>
              )}
            </div>
          </div>

          {isActivated ? (
            <div className="mt-4 space-y-2 border-t border-border/30 pt-3 dark:border-white/6">
              {allPlans
                .filter((p) => p.paymentUrl?.trim())
                .map((plan) => (
                  <div
                    key={plan.id}
                    className="flex flex-wrap items-center gap-2 rounded-md bg-background/60 px-3 py-2 dark:bg-white/[0.03]"
                  >
                    <Link2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    <span className="text-xs font-medium text-foreground">
                      {plan.title || "Plano"}
                    </span>
                    <TruncatedUrl url={plan.paymentUrl!} />
                    <CopyButton text={plan.paymentUrl!} />
                    <a
                      href={plan.paymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                    {plan.paymentUrlDiscount ? (
                      <div className="flex w-full items-center gap-2 pl-5 pt-1">
                        <span className="text-xs text-muted-foreground">À vista:</span>
                        <TruncatedUrl url={plan.paymentUrlDiscount} />
                        <CopyButton text={plan.paymentUrlDiscount} />
                        <a
                          href={plan.paymentUrlDiscount}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                    ) : null}
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{msg.title}</DialogTitle>
            <DialogDescription>{msg.description}</DialogDescription>
          </DialogHeader>
          {error ? (
            <p className="rounded-md border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-300">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={activating}>
              Cancelar
            </Button>
            <Button
              variant={confirmAction === "deactivate" ? "destructive" : "cta"}
              onClick={handleConfirm}
              disabled={activating}
              className="gap-2"
            >
              {activating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {msg.button}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
