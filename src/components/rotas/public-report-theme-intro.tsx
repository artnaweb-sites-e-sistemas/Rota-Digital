"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

import {
  PUBLIC_REPORT_THEME_TOGGLE_ID,
  getPublicReportCircularOriginOrViewport,
  switchThemeInvertedCircularFromPoint,
} from "@/lib/theme-switch-animation";

const INTRO_ORIGIN_WAIT_MS = 420;

async function resolveIntroOrigin(): Promise<{ cx: number; cy: number }> {
  const startedAt = performance.now();
  let lastStable: { cx: number; cy: number } | null = null;

  while (performance.now() - startedAt < INTRO_ORIGIN_WAIT_MS) {
    const el = document.getElementById(PUBLIC_REPORT_THEME_TOGGLE_ID);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const next = { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
        if (lastStable) {
          const drift = Math.hypot(next.cx - lastStable.cx, next.cy - lastStable.cy);
          if (drift < 1.2) return next;
        }
        lastStable = next;
      }
    }
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

  return lastStable ?? getPublicReportCircularOriginOrViewport();
}

/**
 * Na primeira montagem do relatório público: mostra o tema **oposto** ao resolvido
 * e corre sozinha o **circular invertido** 900 ms até ao tema real.
 *
 * Usa `useRef` para correr uma única vez — sem `theme`/`resolvedTheme` nos deps,
 * evitando que o React cancele o efeito ao re-renderizar depois do `setTheme(opposite)`.
 */
export function PublicReportThemeIntro() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const didRunRef = useRef(false);
  const themeRef = useRef(theme);
  const resolvedRef = useRef(resolvedTheme);

  themeRef.current = theme;
  resolvedRef.current = resolvedTheme;

  useEffect(() => {
    if (didRunRef.current) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const currentTheme = themeRef.current;
    const currentResolved = resolvedRef.current;

    if (currentTheme === undefined || !currentResolved) return;
    if (currentResolved !== "light" && currentResolved !== "dark") return;

    didRunRef.current = true;

    const savedPreference = currentTheme;
    const opposite: "light" | "dark" = currentResolved === "dark" ? "light" : "dark";

    setTheme(opposite);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void (async () => {
          const origin = await resolveIntroOrigin();
          switchThemeInvertedCircularFromPoint({
            switchThemeFunction: () => {
              if (savedPreference === "system") setTheme("system");
              else setTheme(savedPreference);
            },
            startingPoint: origin,
          });
        })();
      });
    });
  });

  return null;
}
