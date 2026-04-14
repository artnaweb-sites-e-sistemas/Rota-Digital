"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PUBLIC_REPORT_THEME_TOGGLE_ID } from "@/lib/theme-switch-animation";
import { cn } from "@/lib/utils";

const SHOW_DELAY_MS = 640;
const VISIBLE_MS = 5400;
const EXIT_MS = 320;
const MIN_SPACE_BESIDE_PX = 220;
const INSET_PX = 16;
const ARROW_W = 20;

type Phase = "idle" | "enter" | "shown" | "exit" | "gone";

type AnchorBeside = { mode: "beside"; top: number; left: number };
type AnchorBelow = {
  mode: "below";
  top: number;
  insetInline: number;
  /** `left` da seta dentro do painel (já com clamp para não sair das margens) */
  arrowLeftInPanel: number;
};
type AnchorState = AnchorBeside | AnchorBelow;

/**
 * Dica na página partilhada: ao lado do botão com espaço; em ecrã estreito fica por baixo,
 * largura útil entre margens — texto por inteiro, sem espremido.
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
    const gap = 10;
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
        top: rect.bottom + 10,
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
        ? "opacity-0 motion-safe:translate-x-4 motion-safe:scale-[0.94]"
        : "opacity-0 motion-safe:translate-y-4 motion-safe:scale-[0.96]"),
    phase === "shown" &&
      "opacity-100 motion-safe:translate-x-0 motion-safe:translate-y-0 motion-safe:scale-100 motion-safe:transition-[opacity,transform] motion-safe:duration-[520ms] motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]",
    phase === "exit" &&
      (isBeside
        ? "opacity-0 motion-safe:translate-x-2 motion-safe:scale-[0.97] motion-safe:transition-[opacity,transform] motion-safe:duration-[300ms] motion-safe:ease-[cubic-bezier(0.4,0,1,1)]"
        : "opacity-0 motion-safe:translate-y-2 motion-safe:scale-[0.98] motion-safe:transition-[opacity,transform] motion-safe:duration-[300ms] motion-safe:ease-[cubic-bezier(0.4,0,1,1)]"),
  );

  const cardBody = (
    <div
      className={cn(
        "relative overflow-hidden rounded-[13px] bg-white px-4 py-3.5 sm:py-3",
        "shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06),0_16px_44px_-12px_rgba(0,0,0,0.16)]",
        "ring-1 ring-zinc-900/[0.06]",
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-brand/0 via-brand/45 to-brand/0"
        aria-hidden
      />
      <p className="text-center text-[15px] font-semibold leading-snug tracking-tight text-zinc-800 antialiased sm:text-left sm:text-[14px]">
        Modo claro? Clique aqui
      </p>
    </div>
  );

  const gradientFrame = (
    <div className="rounded-2xl bg-gradient-to-br from-zinc-200/80 via-white to-zinc-100/60 p-[1px] shadow-sm">
      {cardBody}
    </div>
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
          <div className="flex items-center">
            <div className="min-w-[13.5rem] max-w-[min(19rem,calc(100vw-4.5rem))] shrink-0">{gradientFrame}</div>
            <svg
              width="9"
              height="24"
              viewBox="0 0 9 24"
              className="-ml-px h-6 w-[9px] shrink-0 text-zinc-200/95"
              aria-hidden
            >
              <path
                d="M0.5 1.75 L0.5 22.25 L8 12 Z"
                fill="white"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ) : (
          <div className="relative w-full">
            <div
              className="pointer-events-none absolute -top-[7px] z-10"
              style={{ left: `${anchor.arrowLeftInPanel}px` }}
              aria-hidden
            >
              <svg width={ARROW_W} height="9" viewBox="0 0 20 9" className="text-zinc-200/95">
                <path
                  d="M10 0.75 L18.75 8.25 H1.25 Z"
                  fill="white"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="w-full">{gradientFrame}</div>
          </div>
        )}
      </div>
    </div>
  );
}
