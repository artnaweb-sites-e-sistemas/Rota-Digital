"use client";

import {
  useCallback,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
} from "react";
import { cn } from "@/lib/utils";

type CardSpotlightProps = ComponentProps<"div">;

export function CardSpotlight({ className, children, ...props }: CardSpotlightProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [spotlight, setSpotlight] = useState({ x: 0, y: 0, active: false });

  const handleMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSpotlight({
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      active: true,
    });
  }, []);

  const handleLeave = useCallback(() => {
    setSpotlight((s) => ({ ...s, active: false }));
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card shadow-sm dark:border-zinc-800/90 dark:bg-zinc-950/85 dark:shadow-none",
        className,
      )}
      {...props}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-0 print:hidden transition-opacity duration-500",
          spotlight.active ? "opacity-100" : "opacity-0",
        )}
        style={{
          background: `
            radial-gradient(
              650px circle at ${spotlight.x}px ${spotlight.y}px,
              rgba(99, 102, 241, 0.15),
              rgba(168, 85, 247, 0.05) 25%,
              rgba(56, 189, 248, 0.02) 50%,
              transparent 80%
            )
          `,
        }}
      />
      {/* Camada de ruído/textura sutil para profundidade profissional */}
      <div 
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.03] mix-blend-overlay"
        style={{ 
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` 
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
