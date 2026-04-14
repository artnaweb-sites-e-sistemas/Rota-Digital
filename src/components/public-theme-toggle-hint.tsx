"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PUBLIC_REPORT_THEME_TOGGLE_ID } from "@/lib/theme-switch-animation";
import { cn } from "@/lib/utils";

const SHOW_DELAY_MS = 640;
const VISIBLE_MS = 5200;
const EXIT_MS = 320;
const MIN_SPACE_BESIDE_PX = 200;
const INSET_PX = 16;
const ARROW_W = 18;
const MOBILE_MAX_W = 639;

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
  insetInline: number;
  arrowLeftInPanel: number;
};
type AnchorBanner = {
  mode: "banner";
  top: number;
  left: number;
  width: number;
  height: number;
};
type AnchorState = AnchorBeside | AnchorBelow | AnchorBanner;

const HEADER_SELECTOR = "[data-public-report-header]";

/**
 * Dica na página partilhada: fundo branco sólido; borda escura média.
 * Mobile: faixa à largura do header (sobreposta à faixa do título + toggle).
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

    const vw = window.innerWidth;
    const isMobile = vw <= MOBILE_MAX_W;
    const header = document.querySelector(HEADER_SELECTOR) as HTMLElement | null;

    if (isMobile && header) {
      const hr = header.getBoundingClientRect();
      setAnchor({
        mode: "banner",
        top: hr.top,
        left: INSET_PX,
        width: Math.max(0, vw - 2 * INSET_PX),
        height: Math.max(Math.ceil(hr.height), 52),
      });
      return;
    }

    const rect = btn.getBoundingClientRect();

    if (isMobile && !header) {
      setAnchor({
        mode: "banner",
        top: Math.max(8, rect.top - 6),
        left: INSET_PX,
        width: Math.max(0, vw - 2 * INSET_PX),
        height: 52,
      });
      return;
    }
    const gap = 8;
    const centerX = rect.left + rect.width / 2;

    if (rect.left >= MIN_SPACE_BESIDE_PX + INSET_PX) {
      setAnchor({
        mode: "beside",
        top: rect.top + rect.height / 2,
        left: rect.left - gap,
      });
    } else {
      const parentInnerW = vw - 2 * INSET_PX;
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
  const isBanner = anchor.mode === "banner";

  /** Fade + entra da direita; saída volta para a direita */
  const shellMotion = cn(
    "will-change-[opacity,transform]",
    phase === "enter" && "opacity-0 motion-safe:translate-x-5",
    phase === "shown" &&
      "opacity-100 motion-safe:translate-x-0 motion-safe:transition-[opacity,transform] motion-safe:duration-500 motion-safe:ease-out",
    phase === "exit" &&
      "opacity-0 motion-safe:translate-x-6 motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:ease-in",
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
      className={cn(
        "pointer-events-none fixed z-[100]",
        !isBeside && !isBanner && "flex justify-center",
      )}
      style={
        isBeside
          ? {
              top: anchor.top,
              left: anchor.left,
              transform: "translate(-100%, -50%)",
            }
          : isBanner
            ? {
                top: anchor.top,
                left: anchor.left,
                width: anchor.width,
                height: anchor.height,
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
        className={cn(
          isBanner
            ? cn("flex h-full min-h-0 w-full min-w-0 items-center justify-center px-4", shell, shellMotion)
            : cn(
                "flex h-full min-h-0 w-full min-w-0 items-center justify-center",
                !isBeside && "max-w-none sm:max-w-md",
                isBeside && "max-w-md justify-end",
                shellMotion,
              ),
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
        ) : isBanner ? (
          <p className="text-center text-[12px] font-medium leading-snug tracking-tight text-zinc-800 antialiased sm:text-sm">
            Modo claro? Clique aqui
          </p>
        ) : (
          <div className={cn("relative w-full", shell)}>
            <span
              aria-hidden
              className={cn(tipBelow, "top-0")}
              style={{
                left: `${anchor.arrowLeftInPanel + ARROW_W / 2}px`,
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
