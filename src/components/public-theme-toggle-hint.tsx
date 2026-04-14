"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PUBLIC_REPORT_THEME_TOGGLE_ID } from "@/lib/theme-switch-animation";
import { cn } from "@/lib/utils";

const SHOW_DELAY_MS = 640;
const VISIBLE_MS = 5200;
const EXIT_MS = 220;

type Phase = "idle" | "enter" | "shown" | "exit" | "gone";

/**
 * Dica flutuante (fixed) ao lado do botão de tema — só na página partilhada.
 * Visual discreto; seta SVG alinhada ao centro vertical; anima só entrada e saída.
 */
export function PublicThemeToggleHint() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
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
    setAnchor({
      top: rect.top + rect.height / 2,
      left: rect.left - gap,
    });
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

  return (
    <div
      className="pointer-events-none fixed z-[100]"
      style={{
        top: anchor.top,
        left: anchor.left,
        transform: "translate(-100%, -50%)",
      }}
    >
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex items-center",
          phase === "enter" && "opacity-0 motion-safe:translate-x-1",
          phase === "shown" &&
            "opacity-100 motion-safe:translate-x-0 motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:ease-out",
          phase === "exit" &&
            "opacity-0 motion-safe:translate-x-0.5 motion-safe:transition-[opacity,transform] motion-safe:duration-200 motion-safe:ease-in",
        )}
      >
        <div
          className={cn(
            "max-w-[min(15.5rem,calc(100vw-5rem))] rounded-lg border border-zinc-200/90 bg-white px-3 py-2",
            "shadow-[0_6px_24px_rgba(0,0,0,0.07),0_1px_2px_rgba(0,0,0,0.04)]",
          )}
        >
          <p className="text-[13px] font-medium leading-snug tracking-tight text-zinc-600 antialiased">
            Modo claro? Clique aqui
          </p>
        </div>
        <svg
          width="7"
          height="18"
          viewBox="0 0 7 18"
          className="-ml-px h-[18px] w-[7px] shrink-0 text-zinc-200/90"
          aria-hidden
        >
          <path
            d="M0.5 1.25 L0.5 16.75 L6.25 9 Z"
            fill="white"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
