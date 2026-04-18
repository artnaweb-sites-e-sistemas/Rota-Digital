"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ADMIN_PLATFORM_SERIES_MIN_YEAR } from "@/lib/admin-platform-series-query";

export type PlatformPeriodYear = number | "all";
export type PlatformPeriodMonth = number | "all";

const MONTH_ITEMS: { value: number; label: string }[] = Array.from({ length: 12 }, (_, i) => {
  const value = i + 1;
  const raw = new Date(2000, i, 1).toLocaleDateString("pt-BR", { month: "long" });
  const label = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : String(value);
  return { value, label };
});

type PlatformPeriodSelectorProps = {
  year: PlatformPeriodYear;
  month: PlatformPeriodMonth;
  onYearChange: (y: PlatformPeriodYear) => void;
  onMonthChange: (m: PlatformPeriodMonth) => void;
  disabled?: boolean;
  className?: string;
};

function capitalizePt(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function PlatformPeriodSelector({
  year,
  month,
  onYearChange,
  onMonthChange,
  disabled,
  className,
}: PlatformPeriodSelectorProps) {
  const maxYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = maxYear; y >= ADMIN_PLATFORM_SERIES_MIN_YEAR; y--) {
    years.push(y);
  }

  const yearValue = year === "all" ? "all" : String(year);
  const monthValue = month === "all" ? "all" : String(month);

  const yearTriggerLabel =
    year === "all" ? "Todos os anos" : String(year);
  const monthTriggerLabel =
    month === "all"
      ? "Todos os meses"
      : capitalizePt(new Date(2000, month - 1, 1).toLocaleDateString("pt-BR", { month: "long" }));

  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:justify-start",
        className,
      )}
    >
      <Select
        value={yearValue}
        onValueChange={(v) => onYearChange(v === "all" ? "all" : Number(v))}
        disabled={disabled}
      >
        <SelectTrigger
          size="sm"
          className="h-9 min-w-[10.5rem] flex-1 border-border/80 bg-background dark:border-white/10 dark:bg-zinc-950/60 sm:flex-initial"
          aria-label="Ano"
        >
          <SelectValue>{yearTriggerLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os anos</SelectItem>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={monthValue}
        onValueChange={(v) => onMonthChange(v === "all" ? "all" : Number(v))}
        disabled={disabled}
      >
        <SelectTrigger
          size="sm"
          className="h-9 min-w-[11rem] flex-1 border-border/80 bg-background dark:border-white/10 dark:bg-zinc-950/60 sm:flex-initial"
          aria-label="Mês"
        >
          <SelectValue>{monthTriggerLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os meses</SelectItem>
          {MONTH_ITEMS.map(({ value: mv, label }) => (
            <SelectItem key={mv} value={String(mv)}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
