import { Suspense } from "react";

import { AssinaturaClient } from "./assinatura-client";

export default function AssinaturaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center bg-background text-muted-foreground">
          Carregando…
        </div>
      }
    >
      <AssinaturaClient />
    </Suspense>
  );
}
