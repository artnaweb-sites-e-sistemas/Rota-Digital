import type { LeadStatus } from "@/types/lead";

/** Gatilho/badge “Rota Gerada”: gradiente + brilho (ver `.lead-rota-status-badge` em globals.css). */
export const LEAD_STATUS_ROTA_GERADA_BADGE_CLASS = "lead-rota-status-badge";

/** Cor do ponto ao lado do rótulo do status (lista e detalhe). */
export const LEAD_STATUS_DOT_CLASSES: Record<LeadStatus, string> = {
  "Novo Lead": "bg-zinc-500 dark:bg-zinc-400",
  "Em Contato": "bg-sky-600 dark:bg-sky-400",
  /** Sobre fundo `brand` sólido: ponto claro para leitura em claro e escuro. */
  "Rota Gerada": "bg-white/90 ring-1 ring-black/10 dark:bg-zinc-950/35 dark:ring-white/25",
  Proposta: "bg-violet-600 dark:bg-violet-400",
  Convertido: "bg-emerald-600 dark:bg-emerald-400",
  Perdido: "bg-red-600 dark:bg-red-400",
};

/** Fundo + texto + borda opaca (harmonia com o chip na tabela e no detalhe). */
export const LEAD_STATUS_BADGE_SURFACE_CLASSES: Record<LeadStatus, string> = {
  "Novo Lead":
    "border border-border bg-muted/90 text-muted-foreground dark:border-zinc-600 dark:bg-zinc-800/90 dark:text-zinc-300",
  "Em Contato":
    "border border-sky-800/40 bg-sky-500/12 text-sky-950 dark:border-sky-400/45 dark:bg-sky-500/16 dark:text-sky-100",
  /** Base tipográfica; fundo vivo + animação vêm de `LEAD_STATUS_ROTA_GERADA_BADGE_CLASS`. */
  "Rota Gerada":
    "border border-zinc-900 font-semibold text-brand-foreground shadow-sm dark:border-white",
  Proposta:
    "border border-violet-700/40 bg-violet-500/12 text-violet-950 dark:border-violet-400/45 dark:bg-violet-500/16 dark:text-violet-100",
  Convertido:
    "border border-emerald-700 bg-emerald-500/12 text-emerald-950 dark:border-emerald-400 dark:bg-emerald-500/18 dark:text-emerald-100",
  Perdido:
    "border border-red-700 bg-red-500/12 text-red-950 dark:border-red-400 dark:bg-red-500/18 dark:text-red-100",
};

/** Ponto à esquerda de cada opção no menu (fundo claro do popover). */
export const LEAD_STATUS_MENU_DOT_CLASSES: Record<LeadStatus, string> = {
  "Novo Lead": "bg-zinc-500 dark:bg-zinc-400",
  "Em Contato": "bg-sky-600 dark:bg-sky-400",
  "Rota Gerada": "bg-brand dark:bg-[#c4b27a]",
  Proposta: "bg-violet-600 dark:bg-violet-400",
  Convertido: "bg-emerald-600 dark:bg-emerald-400",
  Perdido: "bg-red-600 dark:bg-red-400",
};

/** Classes do gatilho do menu de status (superfície + destaque “Rota Gerada”). */
export function leadStatusDropdownTriggerSurface(status: LeadStatus): string {
  const base = LEAD_STATUS_BADGE_SURFACE_CLASSES[status];
  return status === "Rota Gerada" ? `${base} ${LEAD_STATUS_ROTA_GERADA_BADGE_CLASS}` : base;
}
