"use client";

import {
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { useTheme } from "next-themes";
import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

const SESSION_KEY = "rd-public-theme-entrance-v1";

/**
 * Entrada só na rota pública partilhada, **viewport &lt; sm**:
 * véu na cor “oposta” ao tema resolvido que sobe (de baixo para o topo),
 * revelando o relatório já no tema correto — sem novo Playwright.
 * Respeita `prefers-reduced-motion` e `sessionStorage` (uma vez por sessão).
 */
export function PublicRouteThemeReveal({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  /** `run` = mostrar véu animado; `off` = sem entrada */
  const [intro, setIntro] = useState<"run" | "off">("run");

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (reduceMotion) {
      setIntro("off");
      return;
    }
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 640px)").matches) {
      setIntro("off");
      return;
    }
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") {
        setIntro("off");
      }
    } catch {
      /* private mode */
    }
  }, [reduceMotion]);

  useEffect(() => {
    if (intro !== "run") return;
    const ms = 1120;
    const id = window.setTimeout(() => {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
      setIntro("off");
    }, ms);
    return () => clearTimeout(id);
  }, [intro]);

  const targetDark = mounted && resolvedTheme === "dark";
  const targetLight = mounted && resolvedTheme === "light";
  const veilLight = !mounted || targetDark || resolvedTheme === undefined;

  return (
    <>
      {children}
      {intro === "run" ? (
        <div
          className={cn(
            "pointer-events-none fixed inset-0 z-[300] sm:hidden",
            "rd-public-theme-veil",
            veilLight
              ? "bg-[oklch(0.985_0.004_85)]"
              : "bg-[oklch(0.12_0.02_265)]",
            targetLight && "rd-public-theme-veil--to-light",
          )}
          aria-hidden
        />
      ) : null}
    </>
  );
}
