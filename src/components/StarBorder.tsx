"use client";

import { type CSSProperties, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StarBorderProps = {
  as?: ElementType;
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
  as: Comp = "div",
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
  const Component = Comp;
  const bottomColor = accentColor ?? color;

  return (
    <Component
      className={cn("relative inline-block w-full max-w-full overflow-hidden rounded-[20px]", className)}
      style={{
        padding: `${thickness}px 0`,
        ...style,
      }}
      {...rest}
    >
      <div
        aria-hidden
        className="rota-star-border-bottom pointer-events-none absolute right-[-250%] z-0 h-[55%] w-[320%] rounded-full opacity-90"
        style={{
          bottom: `${-11 * thickness}px`,
          background: `radial-gradient(circle, ${bottomColor}, transparent ${Math.min(38, Math.round(14 + thickness * 8))}%)`,
          animationDuration: speed,
        }}
      />
      <div
        aria-hidden
        className="rota-star-border-top pointer-events-none absolute left-[-250%] z-0 h-[55%] w-[320%] rounded-full opacity-90"
        style={{
          top: `${-10 * thickness}px`,
          background: `radial-gradient(circle, ${color}, transparent ${Math.min(38, Math.round(14 + thickness * 8))}%)`,
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
    </Component>
  );
}
