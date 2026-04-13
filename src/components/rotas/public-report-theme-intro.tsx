"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";

import switchTheme, {
  buildSharedCircularThemeAnimation,
  themeSwitchViewportCenter,
} from "@/lib/theme-switch-animation";

/**
 * Na primeira montagem do relatório público: mostra o tema **oposto** ao resolvido
 * e corre sozinha a transição circular até ao tema real (como um “reveal” inverso ao clique).
 */
let lastPublicThemeIntro: { path: string; at: number } | null = null;
const STRICT_MODE_DEDUP_MS = 2200;

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

    const center = themeSwitchViewportCenter();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        switchTheme({
          switchThemeFunction: () => {
            if (savedPreference === "system") setTheme("system");
            else setTheme(savedPreference);
          },
          animationConfig: buildSharedCircularThemeAnimation(center),
        });
      });
    });
  }, [mounted, theme, resolvedTheme, setTheme]);

  return null;
}
