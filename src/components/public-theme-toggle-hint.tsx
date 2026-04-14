"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PUBLIC_REPORT_THEME_TOGGLE_ID } from "@/lib/theme-switch-animation";
import { cn } from "@/lib/utils";

const SHOW_DELAY_MS = 640;
const VISIBLE_MS = 5200;
const EXIT_MS = 320;
const BUBBLE_W_MOBILE = 190;
const BUBBLE_W_DESKTOP = 208;
const MIN_SPACE_BESIDE_PX = 200;
const INSET_PX = 16;
const MOBILE_MAX_W = 639;
const MOBILE_ARROW_NUDGE_X_PX = -7;
const MOBILE_BUBBLE_GAP_FROM_BUTTON_PX = 12;

/** Fundo sólido + borda escura (espessura média) */
const shell = cn(
  "rounded-md border-[1.5px] border-zinc-800/85 bg-white",
  "shadow-md shadow-black/10",
);

type Phase = "idle" | "enter" | "shown" | "exit" | "gone";

type AnchorBeside = { mode: "beside"; top: number; left: number };
type AnchorBelow = {
  mode: "below";
  top: number;
  left: number;
  width: number;
  arrowLeftInBubble: number;
};
type AnchorState = AnchorBeside | AnchorBelow;

/**
 * Dica na página partilhada: balão pequeno com seta para o botão.
 * Nunca ocupa a largura toda no mobile.
 * Animação: fade + deslize da direita na entrada e à saída.
 */
export function PublicThemeToggleHint() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [anchor, setAnchor] = useState<AnchorState | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const setPhaseTracked = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const updateAnchor = useCallback(() => {
    const btn = document.getElementById(PUBLIC_REPORT_THEME_TOGGLE_ID);
    if (!btn) return;
    const rect = btn.getBoundingClientRect();

    const vw = window.innerWidth;
    const isMobile = vw <= MOBILE_MAX_W;
    const gap = 8;
    const centerX = rect.left + rect.width / 2;

    if (!isMobile && rect.left >= MIN_SPACE_BESIDE_PX + INSET_PX) {
      setAnchor({
        mode: "beside",
        top: rect.top + rect.height / 2,
        left: rect.left - gap,
      });
    } else {
      const width = isMobile ? BUBBLE_W_MOBILE : BUBBLE_W_DESKTOP;
      const left = Math.max(INSET_PX, Math.min(rect.right - width, vw - width - INSET_PX));
      const idealArrowX = centerX - left + (isMobile ? MOBILE_ARROW_NUDGE_X_PX : 0);
      const arrowLeftInBubble = Math.max(12, Math.min(idealArrowX, width - 12));
      setAnchor({
        mode: "below",
        top: rect.bottom + MOBILE_BUBBLE_GAP_FROM_BUTTON_PX,
        left,
        width,
        arrowLeftInBubble,
      });
    }
  }, []);

  const runExit = useCallback(() => {
    if (phaseRef.current === "exit" || phaseRef.current === "gone") return;
    setPhaseTracked("exit");
    timersRef.current.push(
      setTimeout(() => {
        setPhaseTracked("gone");
      }, EXIT_MS),
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    timersRef.current.push(
      setTimeout(() => {
        if (!document.getElementById(PUBLIC_REPORT_THEME_TOGGLE_ID)) return;
        updateAnchor();
        if (reduceMotion) {
          setPhaseTracked("shown");
          timersRef.current.push(setTimeout(runExit, VISIBLE_MS));
          return;
        }
        setPhaseTracked("enter");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setPhaseTracked("shown");
            timersRef.current.push(setTimeout(runExit, VISIBLE_MS));
          });
        });
      }, SHOW_DELAY_MS),
    );

    const onLayout = () => updateAnchor();
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);

    return () => {
      clearTimers();
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [runExit, updateAnchor]);

  useEffect(() => {
    const onDocClick = () => runExit();
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [runExit]);

  if (phase === "idle" || phase === "gone" || !anchor) return null;

  const isBeside = anchor.mode === "beside";

  /** Fade + entra da direita; saída volta para a direita */
  const shellMotion = cn(
    "will-change-[opacity,transform]",
    phase === "enter" && "opacity-0 motion-safe:translate-x-5",
    phase === "shown" &&
      "opacity-100 motion-safe:translate-x-0 motion-safe:transition-[opacity,transform] motion-safe:duration-500 motion-safe:ease-out",
    phase === "exit" &&
      (isBeside
        ? "opacity-0 motion-safe:transition-opacity motion-safe:duration-300 motion-safe:ease-out"
        : "opacity-0 motion-safe:transition-opacity motion-safe:duration-260 motion-safe:ease-out"),
  );

  const tipBeside = cn(
    "pointer-events-none absolute z-[2] h-[7px] w-[7px] rotate-45 bg-white",
    "border-[1.5px] border-zinc-800/85 border-l-0 border-b-0 border-t border-r",
  );
  const tipBelow = cn(
    "pointer-events-none absolute z-[2] h-[7px] w-[7px] rotate-45 bg-white",
    "border-[1.5px] border-zinc-800/85 border-r-0 border-b-0 border-l border-t",
  );

  return (
    <div
      className={cn("pointer-events-none fixed z-[100]", !isBeside && "flex justify-center")}
      style={
        isBeside
          ? {
              top: anchor.top,
              left: anchor.left,
              transform: "translate(-100%, -50%)",
            }
          : { top: anchor.top, left: anchor.left, width: anchor.width }
      }
    >
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex h-full min-h-0 w-full min-w-0 items-center justify-center",
          isBeside && "max-w-md justify-end",
          shellMotion,
        )}
      >
        {isBeside ? (
          <div className={cn("relative inline-flex max-w-[min(14rem,calc(100vw-4rem))]", shell)}>
            <p className="relative z-[1] max-w-[12.5rem] px-2.5 py-1.5 pr-4 text-center text-[11px] font-medium leading-snug tracking-tight text-zinc-800 antialiased sm:text-left sm:text-[11.5px]">
              Modo claro? Clique aqui
            </p>
            <span
              aria-hidden
              className={cn(tipBeside, "top-1/2 right-0 translate-x-1/2 -translate-y-1/2")}
            />
          </div>
        ) : (
          <div className={cn("relative w-full", shell)}>
            <span
              aria-hidden
              className={cn(tipBelow, "top-0")}
              style={{
                left: `${anchor.arrowLeftInBubble}px`,
                transform: "translate(-50%, -50%)",
              }}
            />
            <p className="relative z-[1] px-3 pb-2 pt-2.5 text-center text-[11px] font-medium leading-snug text-zinc-800 antialiased sm:text-xs">
              Modo claro? Clique aqui
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
