"use client";

import { Suspense } from "react";
import { StripeConnectSettingsForm } from "@/components/settings/stripe-connect-settings-form";

function PageContent() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Pagamentos
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Gerencie a conexão com o Stripe para gerar links de pagamento nas propostas comerciais.
        </p>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:max-w-2xl">
        <StripeConnectSettingsForm />
      </div>
    </div>
  );
}

export default function SettingsPagamentosPage() {
  return (
    <Suspense>
      <PageContent />
    </Suspense>
  );
}
