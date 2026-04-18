"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export type PlatformStatAreaPoint = {
  day: string;
  value: number;
  /** Rótulo longo para o tooltip (ex.: data em pt-BR). */
  dateLabel?: string;
};

type PlatformStatAreaChartProps = {
  data: PlatformStatAreaPoint[];
  color: string;
  yMax: number;
  ariaLabel: string;
  /** Rótulo da linha no tooltip (ex.: «Quantidade», «Valor»). */
  valueLabel?: string;
  yTickFormatter?: (v: number) => string;
  tooltipValueFormatter?: (v: number) => string;
  yAllowDecimals?: boolean;
};

const VALUE_KEY = "value";

/** Largura assumida antes da 1.ª medição (mobile-first, evita 31 rótulos no 1.º frame). */
const CHART_WIDTH_FALLBACK_PX = 400;

/**
 * Intervalo do eixo X no Recharts: `interval={n}` mostra cerca de um rótulo a cada (n+1) pontos.
 * Ecrã mais estreito ⇒ menos rótulos alvo ⇒ `n` maior.
 */
function responsiveXAxisInterval(widthPx: number, pointCount: number): number {
  if (pointCount <= 1) return 0;
  const w = widthPx > 0 ? widthPx : CHART_WIDTH_FALLBACK_PX;

  let targetLabels: number;
  if (w < 400) targetLabels = 5;
  else if (w < 560) targetLabels = 7;
  else if (w < 768) targetLabels = 10;
  else if (w < 1024) targetLabels = 14;
  else if (w < 1400) targetLabels = 22;
  else targetLabels = pointCount;

  targetLabels = Math.max(3, Math.min(targetLabels, pointCount));
  const step = Math.ceil(pointCount / targetLabels);
  return Math.max(0, step - 1);
}

export function PlatformStatAreaChart({
  data,
  color,
  yMax,
  ariaLabel,
  valueLabel = "Quantidade",
  yTickFormatter,
  tooltipValueFormatter,
  yAllowDecimals = false,
}: PlatformStatAreaChartProps) {
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const [chartWidthPx, setChartWidthPx] = useState(0);

  useLayoutEffect(() => {
    const el = chartWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const update = () => {
      const w = el.getBoundingClientRect().width;
      setChartWidthPx((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const xAxisInterval = useMemo(
    () => responsiveXAxisInterval(chartWidthPx, data.length),
    [chartWidthPx, data.length],
  );

  const chartConfig = {
    [VALUE_KEY]: { label: valueLabel, color },
  } satisfies ChartConfig;

  const defaultTick = (v: number) => Math.round(Number(v)).toLocaleString("pt-BR");
  const domainMax = Math.max(yMax, 1);
  const formatTooltipVal =
    tooltipValueFormatter ??
    ((q: number) => (typeof q === "number" ? q.toLocaleString("pt-BR") : "—"));

  return (
    <ChartContainer ref={chartWrapRef} config={chartConfig} className="h-[220px] w-full" aria-label={ariaLabel}>
      <AreaChart
        data={data}
        margin={{ left: 2, right: 8, top: 8, bottom: 0 }}
        accessibilityLayer
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tick={{ fontSize: 11 }}
          interval={xAxisInterval}
          minTickGap={0}
        />
        <YAxis
          domain={[0, domainMax]}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={52}
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => (yTickFormatter ?? defaultTick)(Number(v))}
          allowDecimals={yAllowDecimals}
        />
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as PlatformStatAreaPoint | undefined;
            if (!row) return null;
            const title = row.dateLabel?.trim() || `Dia ${row.day}`;
            const qty = row.value;
            return (
              <div
                className={cn(
                  "min-w-[11rem] space-y-2 rounded-lg border border-border/60 bg-popover px-3 py-2.5 text-popover-foreground shadow-md",
                )}
              >
                <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
                <div className="flex items-center justify-between gap-6 border-t border-border/50 pt-2">
                  <span className="text-xs text-muted-foreground">{valueLabel}</span>
                  <span
                    className="text-base font-bold tabular-nums tracking-tight"
                    style={{ color }}
                  >
                    {typeof qty === "number" ? formatTooltipVal(qty) : "—"}
                  </span>
                </div>
              </div>
            );
          }}
          cursor={{ stroke: "var(--border)", strokeOpacity: 0.6, strokeWidth: 1 }}
        />
        <Area
          dataKey={VALUE_KEY}
          type="natural"
          fill={`var(--color-${VALUE_KEY})`}
          fillOpacity={0.4}
          stroke={`var(--color-${VALUE_KEY})`}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
