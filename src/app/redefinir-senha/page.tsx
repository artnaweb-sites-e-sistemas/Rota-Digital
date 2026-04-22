import { Suspense } from "react";
import { Loader2 } from "lucide-react";

import { RedefinirSenhaForm } from "./redefinir-senha-form";

export const metadata = {
  title: "Redefinir palavra-passe | RouteLAB",
  description: "Defina uma nova palavra-passe para a sua conta RouteLAB.",
};

function RedefinirSenhaFallback() {
  return (
    <div className="flex min-h-svh items-center justify-center gap-2 bg-background text-muted-foreground">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span>A carregar…</span>
    </div>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <Suspense fallback={<RedefinirSenhaFallback />}>
      <RedefinirSenhaForm />
    </Suspense>
  );
}
