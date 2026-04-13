"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PublicThemeToggleProps = {
  className?: string;
};

export function PublicThemeToggle({ className }: PublicThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [pulse, setPulse] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleToggle = useCallback(() => {
    if (!mounted) return;
    const nextDark = resolvedTheme !== "dark";
    setPulse(true);
    window.setTimeout(() => setPulse(false), 680);
    setTheme(nextDark ? "dark" : "light");
  }, [mounted, resolvedTheme, setTheme]);

  if (!mounted) {
    return (
      <span
        className={cn(
          "inline-flex h-12 w-12 shrink-0 rounded-xl border border-transparent sm:h-7 sm:w-7 sm:rounded-lg",
          className,
        )}
        aria-hidden
      />
    );
  }

  const isDark = resolvedTheme === "dark";
  const iconTransition = reduceMotion
    ? { duration: 0.12 }
    : { type: "spring" as const, stiffness: 440, damping: 30, mass: 0.65 };

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      data-public-theme-toggle
      className={cn(
        "relative shrink-0 overflow-visible border-border bg-background/80 text-foreground shadow-sm backdrop-blur-sm hover:bg-muted",
        "h-12 w-12 rounded-xl sm:h-7 sm:w-7 sm:rounded-[min(var(--radius-md),12px)]",
        pulse && "rd-theme-toggle-pulse",
        className,
      )}
      onClick={handleToggle}
      title={isDark ? "Modo claro" : "Modo escuro"}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
    >
      <span className="relative inline-flex size-6 items-center justify-center sm:size-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isDark ? "sun" : "moon"}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, rotate: isDark ? -56 : 56, scale: 0.82 }
            }
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, rotate: isDark ? 40 : -40, scale: 0.82 }
            }
            transition={iconTransition}
            className="inline-flex items-center justify-center"
          >
            {isDark ? (
              <Sun className="size-6 sm:size-4" aria-hidden />
            ) : (
              <Moon className="size-6 sm:size-4" aria-hidden />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
    </Button>
  );
}
