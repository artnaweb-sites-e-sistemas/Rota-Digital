"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import switchTheme, {
  THEME_SWITCH_CIRCULAR_DURATION_MS,
  themeSwitchCircularOrigin,
} from "@/lib/theme-switch-animation";
import { cn } from "@/lib/utils";

type PublicThemeToggleProps = {
  className?: string;
};

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
        className={cn(
          "inline-flex h-12 w-[4.5rem] shrink-0 rounded-full border border-transparent sm:h-7 sm:w-14",
          className,
        )}
        aria-hidden
      />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      className={cn(
        "relative inline-flex h-12 w-[4.5rem] shrink-0 cursor-pointer items-center rounded-full border border-border/80 bg-muted/45 p-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] outline-none backdrop-blur-sm transition-[border-color,box-shadow] hover:border-border hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-brand/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-white/12 dark:bg-white/[0.07] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] dark:hover:border-white/20 dark:hover:bg-white/[0.1] sm:h-7 sm:w-14 sm:p-px",
        className,
      )}
      onClick={(e) =>
        switchTheme({
          switchThemeFunction: () => setTheme(isDark ? "light" : "dark"),
          animationConfig: {
            type: "circular",
            duration: THEME_SWITCH_CIRCULAR_DURATION_MS,
            startingPoint: themeSwitchCircularOrigin(e.currentTarget),
          },
          disableAnimation: reduceMotion,
        })
      }
      title={isDark ? "Modo claro" : "Modo escuro"}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
      aria-pressed={isDark}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full opacity-[0.35] dark:opacity-[0.55]"
        style={{
          background: isDark
            ? "radial-gradient(130% 120% at 92% 40%, rgba(129,140,248,0.35), transparent 58%), radial-gradient(90% 90% at 8% 60%, rgba(251,191,36,0.12), transparent 52%)"
            : "radial-gradient(130% 120% at 12% 45%, rgba(251,191,36,0.35), transparent 55%), radial-gradient(100% 100% at 80% 80%, rgba(56,189,248,0.12), transparent 50%)",
        }}
      />

      <div
        className={cn(
          "relative z-[1] flex h-full w-full items-center rounded-full",
          isDark ? "justify-end" : "justify-start",
        )}
      >
        <span
          className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-background shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.07] dark:bg-zinc-950 dark:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.55)] dark:ring-white/14 sm:h-[1.375rem] sm:w-[1.375rem]"
        >
          {isDark ? (
            <Sun className="size-5 text-amber-500 dark:text-amber-400 sm:size-3.5" aria-hidden />
          ) : (
            <Moon className="size-5 text-indigo-600 dark:text-indigo-400 sm:size-3.5" aria-hidden />
          )}
        </span>
      </div>
    </button>
  );
}
