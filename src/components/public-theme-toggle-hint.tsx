"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { PUBLIC_REPORT_THEME_TOGGLE_ID } from "@/lib/theme-switch-animation";
import { cn } from "@/lib/utils";

const STORAGE_PREFIX = "rota-public-theme-hint-dismissed:";
const VISIBLE_MS = 5200;
const EXIT_MS = 320;

/**
 * Dica única por sessão e por URL: aparece ao lado do botão de tema na página partilhada,
 * destaca-se com fundo branco e some sozinha após alguns segundos.
 */
export function PublicThemeToggleHint() {
  const pathname = usePathname();
  const storageKey = `${STORAGE_PREFIX}${pathname}`;
  const [phase, setPhase] = useState<"hidden" | "enter" | "visible" | "exit">("hidden");
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
    setPhase((p) => (p === "hidden" ? "hidden" : "exit"));
    removeTimerRef.current = setTimeout(() => {
      setPhase("hidden");
      removeTimerRef.current = null;
    }, EXIT_MS);
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if (sessionStorage.getItem(storageKey)) return;
    } catch {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      setPhase("visible");
    } else {
      setPhase("enter");
      requestAnimationFrame(() => setPhase("visible"));
    }

    exitTimerRef.current = setTimeout(() => dismiss(), VISIBLE_MS);

    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
    };
  }, [dismiss, storageKey]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      const btn = document.getElementById(PUBLIC_REPORT_THEME_TOGGLE_ID);
      if (btn?.contains(t)) dismiss();
    };
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [dismiss]);

  if (phase === "hidden") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none relative z-10 max-w-[min(16rem,calc(100vw-7rem))] shrink",
        phase === "enter" && "motion-safe:opacity-0 motion-safe:scale-[0.94] motion-safe:translate-x-2",
        phase === "visible" &&
          "motion-safe:opacity-100 motion-safe:scale-100 motion-safe:translate-x-0 motion-safe:transition-all motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        phase === "exit" &&
          "motion-safe:opacity-0 motion-safe:scale-95 motion-safe:-translate-y-1 motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-in",
      )}
    >
      <div
        className={cn(
          "relative rounded-xl border border-zinc-200/90 bg-white pl-3.5 pr-4 py-2.5",
          "shadow-[0_12px_40px_-8px_rgba(0,0,0,0.22),0_0_0_1px_rgba(0,0,0,0.04)]",
          "ring-1 ring-black/[0.06]",
          "after:pointer-events-none after:absolute after:-right-1.5 after:top-1/2 after:z-10 after:h-3 after:w-3 after:-translate-y-1/2 after:rotate-45 after:border-r after:border-b after:border-zinc-200/90 after:bg-white after:shadow-sm after:content-['']",
        )}
      >
        <p className="pr-1 text-[13px] font-semibold leading-snug tracking-tight text-zinc-900 antialiased">
          Modo Claro? Clique aqui
        </p>
      </div>
    </div>
  );
}
