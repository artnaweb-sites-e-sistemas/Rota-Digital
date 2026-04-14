"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

import {
  PUBLIC_REPORT_THEME_TOGGLE_ID,
  getPublicReportCircularOriginOrViewport,
  switchThemeInvertedCircularFromPoint,
} from "@/lib/theme-switch-animation";

const INTRO_ORIGIN_MAX_WAIT_MS = 900;
const STABLE_FRAMES_REQUIRED = 4;
const STABLE_DRIFT_PX = 1.5;

async function resolveIntroOrigin(): Promise<{ cx: number; cy: number }> {
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((r) => setTimeout(r, 500)),
    ]);
  } catch { /* ignore */ }

  const startedAt = performance.now();
  let stableCount = 0;
  let last: { cx: number; cy: number } | null = null;

  while (performance.now() - startedAt < INTRO_ORIGIN_MAX_WAIT_MS) {
    const el = document.getElementById(PUBLIC_REPORT_THEME_TOGGLE_ID);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const vv = window.visualViewport;
        const offsetX = vv?.offsetLeft ?? 0;
        const offsetY = vv?.offsetTop ?? 0;
        const next = {
          cx: rect.left + rect.width / 2 - offsetX,
          cy: rect.top + rect.height / 2 - offsetY,
        };
        if (last && Math.hypot(next.cx - last.cx, next.cy - last.cy) < STABLE_DRIFT_PX) {
          stableCount++;
          if (stableCount >= STABLE_FRAMES_REQUIRED) return next;
        } else {
          stableCount = 1;
        }
        last = next;
      }
    }
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

  return last ?? getPublicReportCircularOriginOrViewport();
}

/**
 * Na primeira montagem do relatório público:
 * - Força light imediatamente (sem esperar preferência)
 * - Anima **inverted-circular** de light → dark
 *
 * Resultado: a página sempre "nasce" clara e a revelação escura é a animação de entrada.
 */
export function PublicReportThemeIntro() {
  const { setTheme } = useTheme();
  const didRunRef = useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTheme("dark");
      return;
    }

    didRunRef.current = true;

    setTheme("light");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void (async () => {
          const origin = await resolveIntroOrigin();
          switchThemeInvertedCircularFromPoint({
            switchThemeFunction: () => setTheme("dark"),
            startingPoint: origin,
          });
        })();
      });
    });
  });

  return null;
}
