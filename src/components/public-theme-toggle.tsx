"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { PUBLIC_REPORT_THEME_TOGGLE_ID, switchThemeFadeFromSurface } from "@/lib/theme-switch-animation";
import { cn } from "@/lib/utils";

type PublicThemeToggleProps = {
  className?: string;
};

/** Fade 900 ms (referência RN `type: 'fade'`) — mais suave no relatório público que o circular no telemóvel. */
export function PublicThemeToggle({ className }: PublicThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  if (!mounted) {
    return (
      <span
        className={cn("inline-flex h-11 w-11 shrink-0 rounded-md border border-transparent", className)}
        aria-hidden
      />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      id={PUBLIC_REPORT_THEME_TOGGLE_ID}
      type="button"
      className={cn(
        "inline-flex h-11 min-h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border/80 bg-background shadow-sm outline-none transition-[border-color,box-shadow,background-color] hover:border-border hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-brand/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-white/12 dark:bg-zinc-950 dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] dark:hover:border-white/18 dark:hover:bg-zinc-900 sm:h-11 sm:min-h-11 sm:w-11",
        className,
      )}
      onClick={() =>
        switchThemeFadeFromSurface({
          switchThemeFunction: () => setTheme(isDark ? "light" : "dark"),
          disableAnimation: reduceMotion,
        })
      }
      title={isDark ? "Modo claro" : "Modo escuro"}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
      aria-pressed={isDark}
    >
      {isDark ? (
        <Sun className="size-[1.45rem] text-brand sm:size-[1.35rem]" aria-hidden />
      ) : (
        <Moon className="size-[1.45rem] text-brand sm:size-[1.35rem]" aria-hidden />
      )}
    </button>
  );
}
