"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
} from "react";
import { cn } from "@/lib/utils";

type CardSpotlightProps = ComponentProps<"div">;

export function CardSpotlight({ className, children, ...props }: CardSpotlightProps) {
  const ref = useRef<HTMLDivElement>(null);
  const moveRafRef = useRef<number | null>(null);
  const pendingRef = useRef({ x: 0, y: 0 });
  const [spotlight, setSpotlight] = useState({ x: 0, y: 0, active: false });

  useEffect(() => {
    return () => {
      if (moveRafRef.current != null) cancelAnimationFrame(moveRafRef.current);
    };
  }, []);

  const handleMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    pendingRef.current = {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
    };
    if (moveRafRef.current != null) return;
    moveRafRef.current = requestAnimationFrame(() => {
      moveRafRef.current = null;
      const p = pendingRef.current;
      setSpotlight({ x: p.x, y: p.y, active: true });
    });
  }, []);

  const handleLeave = useCallback(() => {
    if (moveRafRef.current != null) {
      cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = null;
    }
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
          "pointer-events-none absolute inset-0 z-0 print:hidden transition-opacity duration-[900ms] ease-out",
          spotlight.active ? "opacity-[0.65]" : "opacity-0",
        )}
        style={{
          background: `
            radial-gradient(
              420px circle at ${spotlight.x}px ${spotlight.y}px,
              color-mix(in srgb, var(--brand) 5%, transparent) 0%,
              color-mix(in srgb, var(--brand) 2%, transparent) 42%,
              color-mix(in srgb, var(--brand) 0.7%, transparent) 58%,
              transparent 72%
            )
          `,
        }}
      />
      {/* Camada de ruído quase imperceptível */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.01] mix-blend-overlay"
        style={{ 
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` 
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
