"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { parseBillingCycle, parseSubscriptionPlanKey } from "@/lib/stripe-subscription-prices";
import { cn } from "@/lib/utils";

export function AssinaturaClient() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const planRaw = searchParams.get("plan");
  const cycleRaw = searchParams.get("cycle");
  const plan = parseSubscriptionPlanKey(planRaw) ?? "pro";
  const billingCycle = parseBillingCycle(cycleRaw) ?? "monthly";

  useEffect(() => {
    if (loading) return;

    if (!user) {
      const next = `/assinatura?plan=${plan}&cycle=${billingCycle}`;
      router.replace(`/cadastro?redirect=${encodeURIComponent(next)}`);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/stripe/subscription/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ plan, billingCycle }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
          skipCheckout?: boolean;
          redirect?: string;
        };
        if (cancelled) return;
        if (res.ok && data.skipCheckout === true) {
          router.replace(typeof data.redirect === "string" ? data.redirect : "/dashboard");
          return;
        }
        if (res.ok && typeof data.url === "string" && data.url.startsWith("http")) {
          window.location.href = data.url;
          return;
        }
        setError(data.error ?? "Não foi possível abrir o checkout Stripe.");
      } catch {
        if (!cancelled) setError("Erro de rede ao iniciar o pagamento.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, loading, plan, billingCycle, router]);

  return (
    <div
      className={cn(
        "flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground",
      )}
    >
      {error ? (
        <div className="max-w-md space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            className="text-sm font-medium text-brand underline underline-offset-4"
            onClick={() => router.push("/dashboard")}
          >
            Voltar ao painel
          </button>
        </div>
      ) : (
        <>
          <Loader2 className="size-8 animate-spin text-brand" aria-hidden />
          <p className="text-sm text-muted-foreground">A abrir o checkout seguro da Stripe…</p>
        </>
      )}
    </div>
  );
}
