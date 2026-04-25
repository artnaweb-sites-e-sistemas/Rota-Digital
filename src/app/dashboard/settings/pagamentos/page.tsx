"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { parseUserSettingsDocForDashboard } from "@/lib/user-settings";
import { StripeConnectSettingsForm } from "@/components/settings/stripe-connect-settings-form";
import { MercadoPagoConnectSettingsForm } from "@/components/settings/mercadopago-connect-settings-form";
import { Loader2 } from "lucide-react";

const SETTINGS_HOME = "/dashboard/settings/sobre-a-empresa";

function PageContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [planReady, setPlanReady] = useState(false);
  const [isMaster, setIsMaster] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setPlanReady(true);
      setIsMaster(false);
      return;
    }
    const ref = doc(db, "userSettings", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setIsMaster(false);
          setPlanReady(true);
          return;
        }
        const { plan } = parseUserSettingsDocForDashboard(snap.data() as Record<string, unknown>);
        setIsMaster(plan === "Master");
        setPlanReady(true);
      },
      () => {
        setIsMaster(false);
        setPlanReady(true);
      },
    );
    return () => unsub();
  }, [user, authLoading]);

  useEffect(() => {
    if (!planReady || !user) return;
    if (!isMaster) {
      router.replace(SETTINGS_HOME);
    }
  }, [planReady, user, isMaster, router]);

  if (authLoading || !planReady || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <span className="sr-only">A carregar</span>
      </div>
    );
  }
  if (!isMaster) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Pagamentos</h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Gerencie suas integrações de pagamento para gerar links nas propostas comerciais.
        </p>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:max-w-2xl">
        <MercadoPagoConnectSettingsForm />
        <StripeConnectSettingsForm />
      </div>
    </div>
  );
}

export default function SettingsPagamentosPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <Loader2 className="size-8 animate-spin" aria-hidden />
        </div>
      }
    >
      <PageContent />
    </Suspense>
  );
}
