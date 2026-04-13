"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { switchThemeWithCircularReveal } from "@/lib/theme-switch-circular";

type PublicThemeToggleProps = {
  className?: string;
};

export function PublicThemeToggle({ className }: PublicThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className={cn(
        "shrink-0 border-border bg-background/80 text-foreground shadow-sm backdrop-blur-sm hover:bg-muted",
        /* Mobile: área de toque e ícone maiores; desktop: mantém icon-sm */
        "h-12 w-12 rounded-xl sm:h-7 sm:w-7 sm:rounded-[min(var(--radius-md),12px)]",
        className,
      )}
      onClick={(e) => {
        const next = isDark ? "light" : "dark";
        switchThemeWithCircularReveal(e.currentTarget, next, () => setTheme(next));
      }}
      title={isDark ? "Modo claro" : "Modo escuro"}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
    >
      {isDark ? (
        <Sun className="size-6 sm:size-4" aria-hidden />
      ) : (
        <Moon className="size-6 sm:size-4" aria-hidden />
      )}
    </Button>
  );
}
