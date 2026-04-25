"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { Check, CreditCard, LinkIcon, Loader2, Unlink, X } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

export function StripeConnectSettingsForm() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const snap = await getDoc(doc(db, "userSettings", user.uid));
      if (snap.exists()) {
        const data = snap.data() as Record<string, unknown>;
        const id = typeof data.stripeConnectAccountId === "string" ? data.stripeConnectAccountId : null;
        setAccountId(id);
      }
    } catch (e) {
      console.error(e);
      setError("Não foi possível carregar o status da conexão.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("connected") === "true") {
      setSuccess("Conta Stripe conectada com sucesso!");
      void load();
    }
    const err = searchParams.get("error");
    if (err) {
      const msgs: Record<string, string> = {
        server: "Erro no servidor. Tente novamente.",
        config: "Configuração do Stripe incompleta.",
        missing_params: "Parâmetros OAuth ausentes.",
        auth: "Sessão expirada. Faça login novamente.",
        stripe: "Erro ao conectar com o Stripe.",
        no_account: "Conta Stripe não encontrada.",
        unknown: "Erro desconhecido. Tente novamente.",
      };
      setError(msgs[err] ?? "Erro ao conectar.");
    }
  }, [searchParams, load]);

  const handleConnect = async () => {
    if (!user) return;
    setConnecting(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/stripe/connect/authorize", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Não foi possível iniciar a conexão.");
        setConnecting(false);
      }
    } catch {
      setError("Erro ao iniciar conexão. Tente novamente.");
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!user) return;
    setDisconnecting(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/stripe/connect/disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        setAccountId(null);
        setSuccess("Conta Stripe desconectada.");
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Erro ao desconectar.");
      }
    } catch {
      setError("Erro ao desconectar. Tente novamente.");
    } finally {
      setDisconnecting(false);
    }
  };

  const connected = Boolean(accountId);

  return (
    <Card className="min-w-0 overflow-hidden border-border bg-card shadow-xl dark:border-white/5 dark:bg-white/[0.02]">
      <CardHeader className="space-y-2 border-b border-border pb-4 dark:border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand/10 ring-1 ring-brand/20">
            <CreditCard className="size-4 text-brand" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-foreground dark:text-white">
              Pagamentos
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed text-muted-foreground">
              Conecte sua conta Stripe para gerar links de pagamento nas propostas.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {loading ? (
          <div className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-5 shrink-0 animate-spin text-brand" aria-hidden />
            Carregando…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
              {connected ? (
                <>
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
                    <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">Conta conectada</p>
                    <p className="truncate text-xs text-muted-foreground">{accountId}</p>
                  </div>
                </>
              ) : (
                <>
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-red-500/15 ring-1 ring-red-500/30">
                    <X className="size-3.5 text-red-600 dark:text-red-400" aria-hidden />
                  </span>
                  <p className="text-sm font-medium text-foreground">Conta Stripe não conectada</p>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {!connected ? (
                <Button
                  variant="cta"
                  className="gap-2"
                  onClick={handleConnect}
                  disabled={connecting}
                >
                  {connecting ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <LinkIcon className="size-4" aria-hidden />
                  )}
                  Conectar com Stripe
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  className="gap-2"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Unlink className="size-4" aria-hidden />
                  )}
                  Desconectar
                </Button>
              )}
            </div>

            {error ? (
              <p className="rounded-md border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-300">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
                {success}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
