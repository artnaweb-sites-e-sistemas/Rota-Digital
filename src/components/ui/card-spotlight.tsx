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
        "relative overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950/85",
        className,
      )}
      {...props}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-0 print:hidden transition-opacity duration-300",
          spotlight.active ? "opacity-100" : "opacity-0",
        )}
        style={{
          background: `radial-gradient(520px circle at ${spotlight.x}px ${spotlight.y}px, rgba(99, 102, 241, 0.22), rgba(56, 189, 248, 0.08) 38%, transparent 58%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
