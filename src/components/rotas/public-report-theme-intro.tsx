"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";

import {
  PUBLIC_REPORT_THEME_TOGGLE_ID,
  getPublicReportCircularOriginOrViewport,
  switchThemeInvertedCircularFromPoint,
} from "@/lib/theme-switch-animation";

/**
 * Na primeira montagem do relatório público: mostra o tema **oposto** ao resolvido
 * e corre sozinha o **circular invertido** 900 ms até ao tema real.
 */
let lastPublicThemeIntro: { path: string; at: number } | null = null;
const STRICT_MODE_DEDUP_MS = 2200;
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
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  return lastStable ?? getPublicReportCircularOriginOrViewport();
}

export function PublicReportThemeIntro() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!mounted) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (theme === undefined || !resolvedTheme) return;
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;

    const path = window.location.pathname;
    const now = Date.now();
    if (
      lastPublicThemeIntro &&
      lastPublicThemeIntro.path === path &&
      now - lastPublicThemeIntro.at < STRICT_MODE_DEDUP_MS
    ) {
      return;
    }
    lastPublicThemeIntro = { path, at: now };

    const savedPreference = theme;
    const targetResolved: "light" | "dark" = resolvedTheme;
    const opposite: "light" | "dark" = targetResolved === "dark" ? "light" : "dark";

    flushSync(() => {
      setTheme(opposite);
    });

    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void (async () => {
          const origin = await resolveIntroOrigin();
          if (cancelled) return;
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

    return () => {
      cancelled = true;
    };
  }, [mounted, theme, resolvedTheme, setTheme]);

  return null;
}
