"use client";

import { type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StarBorderProps = {
  className?: string;
  contentClassName?: string;
  children?: ReactNode;
  color?: string;
  accentColor?: string;
  speed?: CSSProperties["animationDuration"];
  thickness?: number;
} & Omit<React.ComponentPropsWithoutRef<"div">, "color">;

/**
 * Borda com brilho animado (radiais em movimento) — pensado para mobile / CTAs.
 * Keyframes: `globals.css` (`.rota-star-border-top` / `.rota-star-border-bottom`).
 */
export default function StarBorder({
  className,
  contentClassName,
  color = "white",
  accentColor,
  speed = "4s",
  thickness = 1.5,
  children,
  style,
  ...rest
}: StarBorderProps) {
  const bottomColor = accentColor ?? color;

  return (
    <div
      className={cn("relative inline-block w-full max-w-full overflow-hidden rounded-[20px]", className)}
      style={{
        padding: `${thickness}px 0`,
        ...style,
      }}
      {...rest}
    >
      <div
        aria-hidden
        className="rota-star-border-bottom pointer-events-none absolute right-[-290%] z-0 h-[72%] w-[410%] rounded-full opacity-90"
        style={{
          bottom: `${-19 * thickness}px`,
          background: `radial-gradient(circle, ${bottomColor}, transparent ${Math.min(42, Math.round(14 + thickness * 9))}%)`,
          animationDuration: speed,
        }}
      />
      <div
        aria-hidden
        className="rota-star-border-top pointer-events-none absolute left-[-290%] z-0 h-[72%] w-[410%] rounded-full opacity-90"
        style={{
          top: `${-17 * thickness}px`,
          background: `radial-gradient(circle, ${color}, transparent ${Math.min(42, Math.round(14 + thickness * 9))}%)`,
          animationDuration: speed,
        }}
      />
      <div
        className={cn(
          "relative z-[1] rounded-[20px] border border-border bg-card px-6 py-4 text-card-foreground sm:px-[26px] sm:py-[16px]",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
