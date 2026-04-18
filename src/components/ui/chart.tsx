"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
    color?: string;
  };
};

type ChartContextValue = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextValue | null>(null);

function useChart() {
  const ctx = React.useContext(ChartContext);
  if (!ctx) {
    throw new Error("useChart só pode ser usado dentro de ChartContainer.");
  }
  return ctx;
}

function chartStyleFromConfig(id: string, config: ChartConfig): string {
  const lines = Object.entries(config)
    .filter(([, v]) => v.color)
    .map(([k, v]) => `  --color-${k}: ${v.color};`);
  if (!lines.length) return "";
  return `[data-chart="${id}"] {\n${lines.join("\n")}\n}`;
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig;
    children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
  }
>(function ChartContainer({ id, className, children, config, ...props }, ref) {
  const uid = React.useId().replace(/:/g, "");
  const chartId = id ?? `c${uid}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <style
        dangerouslySetInnerHTML={{
          __html: chartStyleFromConfig(chartId, config),
        }}
      />
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          "flex aspect-auto min-h-[200px] w-full justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
          className,
        )}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer width="100%" height="100%">
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = "ChartContainer";

const ChartTooltip = RechartsPrimitive.Tooltip;

type TooltipPayloadItem = {
  value?: number;
  name?: string;
  dataKey?: string;
  color?: string;
  payload?: Record<string, unknown>;
};

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    active?: boolean;
    payload?: TooltipPayloadItem[];
    label?: string | number;
    hideLabel?: boolean;
    indicator?: "dot" | "line";
  }
>(function ChartTooltipContent(
  { active, payload, className, hideLabel, label, indicator = "dot", ...props },
  ref,
) {
  if (!active || !payload?.length) {
    return null;
  }
  const item = payload[0];
  const v = item.value;

  return (
    <div
      ref={ref}
      className={cn(
        "grid min-w-[7rem] gap-1 rounded-lg border border-border/60 bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md",
        className,
      )}
      {...props}
    >
      {!hideLabel && label != null ? <div className="font-medium text-muted-foreground">{label}</div> : null}
      <div className="flex items-center gap-2">
        {indicator === "dot" && item.color ? (
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
        ) : null}
        <span className="font-mono font-semibold tabular-nums text-foreground">
          {typeof v === "number" ? v.toLocaleString("pt-BR") : "—"}
        </span>
      </div>
    </div>
  );
});
ChartTooltipContent.displayName = "ChartTooltipContent";

export { ChartContainer, ChartTooltip, ChartTooltipContent, useChart };
