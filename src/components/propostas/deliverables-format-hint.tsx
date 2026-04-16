"use client";

import { Info } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const PANEL_WIDTH = 280;
const GAP = 8;
/** Altura aproximada do painel para alinhar à viewport antes do primeiro paint completo. */
const ESTIMATED_PANEL_H = 160;

function HintBody() {
  return (
    <p className="text-xs leading-snug text-popover-foreground">
      Comece a linha com <span className="font-mono text-foreground/90">{"\"-\""}</span> para o nome do pacote. Linhas
      com <span className="font-mono text-foreground/90">{"\"*\""}</span> ficam por baixo desse pacote, como lista de
      detalhes.
    </p>
  );
}

/**
 * Ícone de informação ao lado do rótulo: ao clicar abre/fecha dicas (pacotes / subitens).
 * O painel renderiza no body com posição fixa para não ser cortado por overflow-hidden dos cartões.
 */
export function DeliverablesFormatHint({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPos(null);
      return;
    }

    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const panelW = Math.min(PANEL_WIDTH, vw - GAP * 2);

      let left = rect.right + GAP;
      if (left + panelW > vw - GAP) {
        left = rect.left - panelW - GAP;
      }
      if (left < GAP) left = GAP;

      const panelH = panelRef.current?.offsetHeight ?? ESTIMATED_PANEL_H;
      let top = rect.top;
      if (top + panelH > vh - GAP) {
        top = Math.max(GAP, vh - panelH - GAP);
      }
      if (top < GAP) top = GAP;

      setPos({ top, left });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const panel =
    open && mounted && pos ? (
      <div
        ref={panelRef}
        id={panelId}
        role="tooltip"
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          zIndex: 200,
          width: Math.min(PANEL_WIDTH, typeof window !== "undefined" ? window.innerWidth - GAP * 2 : PANEL_WIDTH),
        }}
        className="max-h-[min(40vh,12rem)] overflow-y-auto rounded-lg border border-border bg-popover px-3 py-2.5 text-popover-foreground shadow-md"
      >
        <HintBody />
      </div>
    ) : null;

  return (
    <div className={cn("inline-flex shrink-0", className)}>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-md border border-border/70 bg-muted/40 text-muted-foreground transition-colors",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open && "border-brand/40 bg-brand/10 text-foreground",
        )}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        aria-label="Dicas para listar entregáveis em pacotes"
      >
        <Info className="size-3 shrink-0" strokeWidth={2} aria-hidden />
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
