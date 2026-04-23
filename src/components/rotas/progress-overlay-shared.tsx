import Image from "next/image";

/** Logo de marca do topo dos modais de progresso (geração, captura, reanálise) — pulso leve. */
export function ProgressOverlayRotaLabLogo() {
  return (
    <div
      className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6b5f3a] to-brand p-2.5 ring-1 ring-white/10"
      aria-hidden
    >
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

/** Aviso para não interromper o fluxo com refresh. */
export function ProgressOverlayPageReloadWarning() {
  return (
    <p
      role="alert"
      className="mt-4 w-full rounded-lg border border-amber-500/45 bg-amber-500/12 px-3 py-2 text-center text-xs font-medium leading-snug text-amber-950 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-50"
    >
      Aguarde a conclusão; não recarregue a página.
    </p>
  );
}
