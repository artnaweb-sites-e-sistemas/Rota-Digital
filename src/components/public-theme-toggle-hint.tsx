"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PUBLIC_REPORT_THEME_TOGGLE_ID } from "@/lib/theme-switch-animation";
import { cn } from "@/lib/utils";

const SHOW_DELAY_MS = 640;
const VISIBLE_MS = 5200;
const EXIT_MS = 280;
const MIN_SPACE_BESIDE_PX = 200;
const INSET_PX = 16;
const ARROW_W = 18;

const shell = cn(
  "rounded-md border border-zinc-200/50 bg-white/82 backdrop-blur-md",
  "shadow-sm ring-1 ring-black/[0.04]",
);

type Phase = "idle" | "enter" | "shown" | "exit" | "gone";

type AnchorBeside = { mode: "beside"; top: number; left: number };
type AnchorBelow = {
  mode: "below";
  top: number;
  insetInline: number;
  arrowLeftInPanel: number;
};
type AnchorState = AnchorBeside | AnchorBelow;

/**
 * Dica compacta na página partilhada: `rounded-md` como o sistema, fundo translúcido;
 * ponta fundida ao balão (mesmo fill/borda, metade do quadrado por cima da borda).
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
    const gap = 8;
    const centerX = rect.left + rect.width / 2;

    if (rect.left >= MIN_SPACE_BESIDE_PX + INSET_PX) {
      setAnchor({
        mode: "beside",
        top: rect.top + rect.height / 2,
        left: rect.left - gap,
      });
    } else {
      const parentInnerW = window.innerWidth - 2 * INSET_PX;
      const ideal = centerX - INSET_PX - ARROW_W / 2;
      const arrowLeftInPanel = Math.max(6, Math.min(ideal, parentInnerW - ARROW_W - 6));
      setAnchor({
        mode: "below",
        top: rect.bottom + 8,
        insetInline: INSET_PX,
        arrowLeftInPanel,
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

  const shellMotion = cn(
    "will-change-[opacity,transform]",
    phase === "enter" &&
      (isBeside
        ? "opacity-0 motion-safe:translate-x-2 motion-safe:scale-[0.98]"
        : "opacity-0 motion-safe:translate-y-2 motion-safe:scale-[0.98]"),
    phase === "shown" &&
      "opacity-100 motion-safe:translate-x-0 motion-safe:translate-y-0 motion-safe:scale-100 motion-safe:transition-[opacity,transform] motion-safe:duration-[440ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
    phase === "exit" &&
      (isBeside
        ? "opacity-0 motion-safe:translate-x-1 motion-safe:scale-[0.99] motion-safe:transition-[opacity,transform] motion-safe:duration-[240ms] motion-safe:ease-out"
        : "opacity-0 motion-safe:translate-y-1 motion-safe:scale-[0.99] motion-safe:transition-[opacity,transform] motion-safe:duration-[240ms] motion-safe:ease-out"),
  );

  const tipDiamond = "pointer-events-none absolute z-[2] h-[7px] w-[7px] rotate-45 border-zinc-200/50 bg-white/82 backdrop-blur-md";

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
          : {
              top: anchor.top,
              left: anchor.insetInline,
              right: anchor.insetInline,
            }
      }
    >
      <div
        role="status"
        aria-live="polite"
        className={cn("w-full max-w-md", isBeside ? "" : "max-w-none sm:max-w-md", shellMotion)}
      >
        {isBeside ? (
          <div className={cn("relative inline-flex max-w-[min(14rem,calc(100vw-4rem))]", shell)}>
            <p className="relative z-[1] max-w-[12.5rem] px-2.5 py-1.5 pr-4 text-center text-[11px] font-medium leading-snug tracking-tight text-zinc-700 antialiased sm:text-left sm:text-[11.5px]">
              Modo claro? Clique aqui
            </p>
            <span
              aria-hidden
              className={cn(
                tipDiamond,
                "top-1/2 right-0 border-t border-r",
                "translate-x-1/2 -translate-y-1/2",
              )}
            />
          </div>
        ) : (
          <div className={cn("relative w-full", shell)}>
            <span
              aria-hidden
              className={cn(tipDiamond, "top-0 border-l border-t")}
              style={{
                left: `${anchor.arrowLeftInPanel + ARROW_W / 2}px`,
                transform: "translate(-50%, -50%)",
              }}
            />
            <p className="relative z-[1] px-3 pb-2 pt-2.5 text-center text-[11px] font-medium leading-snug text-zinc-700 antialiased sm:text-xs">
              Modo claro? Clique aqui
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
