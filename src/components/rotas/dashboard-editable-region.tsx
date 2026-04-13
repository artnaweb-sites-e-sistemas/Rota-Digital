"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";

type DashboardEditableRegionProps = {
  enabled: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
  error: string | null;
  draft: string;
  onDraftChange: (value: string) => void;
  /** Conteúdo em modo leitura */
  children: ReactNode;
  /** Se definido, substitui o Textarea padrão em modo edição (ex.: maturidade, tópico de diagnóstico). */
  editSlot?: ReactNode;
  className?: string;
  textAreaClassName?: string;
  ariaLabel?: string;
  /** `compact`: menos padding e textarea menor — listas com um tópico por linha. */
  density?: "default" | "compact";
  /** Remoção opcional: aparece a lixeira ao lado do lápis, só em leitura. */
  onDelete?: () => void;
  deleteAriaLabel?: string;
  /** Se true, em leitura não mostra lápis/lixeira (controlo externo, ex.: cartão de canal com um só lápis). */
  hideReadToolbar?: boolean;
  /**
   * Onde desenhar lápis/lixeira em leitura.
   * `top-right`: só reserva espaço à direita (o texto alinha na mesma linha que o ícone da lista).
   */
  readToolbarPlacement?: "bottom-right" | "top-right";
  /** Classes extra no contentor interno em modo edição (ex.: mais espaço antes dos botões). */
  editStackClassName?: string;
  /** Classes extra na linha dos botões Salvar / Cancelar. */
  editActionsClassName?: string;
};

/**
 * Bloco editável só no dashboard: lápis (e lixeira opcional) no canto; em edição mostra Salvar/Cancelar.
 */
export function DashboardEditableRegion({
  enabled,
  isEditing,
  onStartEdit,
  onCancel,
  onSave,
  saving,
  error,
  draft,
  onDraftChange,
  children,
  editSlot,
  className,
  textAreaClassName,
  ariaLabel = "Editar este bloco",
  density = "default",
  onDelete,
  deleteAriaLabel = "Remover",
  hideReadToolbar = false,
  readToolbarPlacement = "bottom-right",
  editStackClassName,
  editActionsClassName,
}: DashboardEditableRegionProps) {
  if (!enabled) {
    return <div className={className}>{children}</div>;
  }

  const isCompact = density === "compact";
  const hasDelete = Boolean(onDelete);
  const showReadToolbar = !hideReadToolbar;
  const isTopToolbar = readToolbarPlacement === "top-right";

  const readPaddingForToolbar = showReadToolbar
    ? isTopToolbar
      ? cn(
          isCompact
            ? hasDelete
              ? "pr-[3.75rem]"
              : "pr-10"
            : hasDelete
              ? "pr-[4.5rem]"
              : "pr-11",
        )
      : cn(
          isCompact ? (hasDelete ? "pb-9" : "pb-8") : hasDelete ? "pb-11" : "pb-10",
          hasDelete ? (isCompact ? "pr-[3.75rem]" : "pr-11") : undefined,
        )
    : undefined;

  return (
    <div
      className={cn("relative", readPaddingForToolbar, className)}
    >
      {isEditing ? (
        <div className={cn("space-y-2 pr-1", editStackClassName)}>
          {editSlot ?? (
            <Textarea
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              className={cn(
                isCompact ? "min-h-[88px] resize-y text-[13px] leading-relaxed" : "min-h-[140px] resize-y",
                textAreaClassName,
              )}
            />
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className={cn("flex flex-wrap gap-2", editActionsClassName)}>
            <Button
              type="button"
              size="sm"
              variant="cta"
              className="gap-1.5"
              onClick={() => void onSave()}
              disabled={saving}
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
              Salvar
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={saving} className="gap-1.5">
              <X className="size-4" aria-hidden />
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <>
          {children}
          {showReadToolbar ? (
            <div
              className={cn(
                "no-print absolute z-[4] flex flex-row items-center gap-0.5",
                isTopToolbar ? "top-0 right-0" : "bottom-0 right-0",
              )}
            >
              {onDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete()}
                  disabled={saving}
                  className={cn(
                    "rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-destructive",
                    isCompact ? "size-7" : "size-8",
                  )}
                  aria-label={deleteAriaLabel}
                >
                  <Trash2 className={isCompact ? "size-3" : "size-3.5"} aria-hidden />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onStartEdit}
                disabled={saving}
                className={cn(
                  "rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted hover:text-foreground",
                  isCompact ? "size-7" : "size-8",
                )}
                aria-label={ariaLabel}
              >
                <Pencil className={isCompact ? "size-3" : "size-3.5"} aria-hidden />
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
