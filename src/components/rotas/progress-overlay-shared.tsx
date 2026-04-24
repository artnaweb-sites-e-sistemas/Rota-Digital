import Image from "next/image";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

/** Logo de marca do topo dos modais de progresso (geração, captura, reanálise) — pulso leve. */
export function ProgressOverlayRotaLabLogo() {
  return (
    <div className="mb-2 flex justify-center" aria-hidden>
      <Image
        src="/assets/logo/logo-white.png"
        alt=""
        width={112}
        height={48}
        className="h-9 w-auto max-w-[7rem] object-contain object-center opacity-[0.98] motion-safe:animate-pulse [animation-duration:1.8s]"
        priority
      />
    </div>
  );
}

type ProgressOverlayPageReloadWarningProps = {
  className?: string;
};

/** Aviso discreto para não interromper o fluxo com refresh (ícone de atenção na cor de marca). */
export function ProgressOverlayPageReloadWarning({ className }: ProgressOverlayPageReloadWarningProps) {
  return (
    <p
      role="note"
      className={cn(
        "flex w-full max-w-full flex-wrap items-center justify-center gap-2 text-center text-[11px] leading-relaxed text-muted-foreground/80",
        className,
      )}
    >
      <AlertTriangle className="size-3.5 shrink-0 text-brand" strokeWidth={2.25} aria-hidden />
      <span>Aguarde a conclusão. Não saia da página.</span>
    </p>
  );
}
