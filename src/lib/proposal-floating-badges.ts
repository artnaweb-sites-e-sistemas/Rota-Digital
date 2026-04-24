import { cn } from "@/lib/utils";

/** Tons do selo “Vence em:” na listagem e reutilizados no hero / promo da proposta. */
export type ProposalExpiryFloatingTone = "green" | "yellow" | "red" | "expired" | "indefinite";

/** Posição do “selo separador”; `z` é definido por utilidade (listagem vs cartão de plano). */
const FLOATING_TAB_BADGE_LAYOUT_BASE =
  "pointer-events-none absolute right-3 top-0 inline-flex !h-auto min-h-[26px] max-sm:min-h-[24px] -translate-y-[calc(100%-8px)] shrink-0 items-center justify-center gap-1 rounded-t-md rounded-b-none !rounded-t-md !rounded-b-none border-x border-t border-b-0 px-2 pb-1.5 pt-1 text-[10px] font-semibold leading-snug whitespace-nowrap tabular-nums sm:right-5 sm:min-h-7 sm:px-2.5 sm:pb-2 sm:pt-1.5 sm:text-[11px] sm:font-medium shadow-sm dark:shadow-none";

const FLOATING_TAB_BADGE_LAYOUT = cn(FLOATING_TAB_BADGE_LAYOUT_BASE, "z-0");

/**
 * Selo «Promoção» nos cartões de plano — fundo opaco; `z-[1]` por baixo do cartão.
 * Padding e `translate` mais apertados que o selo da listagem, para quase não haver “pezinho” visível sobre o cartão.
 */
export function proposalPlanPromoBadgeClassName(): string {
  return cn(
    "pointer-events-none absolute right-3 top-0 z-[1] inline-flex shrink-0 items-center justify-center gap-0.5 rounded-t-md rounded-b-none border-x border-t border-b-0 px-1.5 py-0.5 text-[10px] font-semibold leading-none whitespace-nowrap tabular-nums sm:right-5 sm:px-2 sm:py-0.5 sm:text-[11px] shadow-sm dark:shadow-none",
    "-translate-y-[calc(100%-3px)]",
    "!border-red-800 !bg-red-600 !text-white dark:!border-red-500 dark:!bg-red-600 dark:!text-white",
  );
}

/**
 * Selo no canto superior direito, ligeiramente acima do cartão — não empurra o conteúdo (bom no mobile).
 * Mesmo padrão da listagem em `/dashboard/propostas`.
 */
export function proposalExpiryFloatingBadgeClassName(tone: ProposalExpiryFloatingTone): string {
  const layout = FLOATING_TAB_BADGE_LAYOUT;
  switch (tone) {
    case "green":
      return cn(
        layout,
        "border-emerald-500/50 bg-[oklch(0.97_0.02_155)] text-emerald-900 dark:border-transparent dark:bg-[oklch(0.22_0.05_155)] dark:text-emerald-100",
      );
    case "yellow":
      return cn(
        layout,
        "border-amber-500/50 bg-[oklch(0.97_0.028_85)] text-amber-950 dark:border-transparent dark:bg-[oklch(0.24_0.04_80)] dark:text-amber-50",
      );
    case "red":
      return cn(
        layout,
        "border-red-500/50 bg-[oklch(0.97_0.02_25)] text-red-900 dark:border-transparent dark:bg-[oklch(0.24_0.06_25)] dark:text-red-100",
      );
    case "expired":
      return cn(
        layout,
        "border-red-500/50 bg-[oklch(0.97_0.02_25)] text-red-900 dark:border-transparent dark:bg-[oklch(0.24_0.06_25)] dark:text-red-100",
      );
    default:
      return cn(
        layout,
        "border-border bg-muted text-muted-foreground dark:border-transparent dark:bg-zinc-800 dark:text-zinc-300",
      );
  }
}
