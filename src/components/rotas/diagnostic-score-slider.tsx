"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

function parseScoreDraft(draft: string): number {
  const n = Number(String(draft).replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.min(10, Math.max(0, n));
}

function scoreValueTextClass(score: number): string {
  if (score < 4) {
    return "text-[color:var(--rota-sev-a-fg)] dark:text-[color:var(--rota-sev-a-fg-dark)]";
  }
  if (score < 7) {
    return "text-[color:var(--rota-sev-b-fg)] dark:text-[color:var(--rota-sev-b-fg-dark)]";
  }
  return "text-[color:var(--rota-sev-c-fg)] dark:text-[color:var(--rota-sev-c-fg-dark)]";
}

function scoreBarClass(score: number): string {
  if (score < 4) return "bg-[color:var(--rota-sev-a-bar)]";
  if (score < 7) return "bg-[color:var(--rota-sev-b-bar)]";
  return "bg-[color:var(--rota-sev-c-bar)]";
}

type DiagnosticScoreSliderProps = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Controlo 0–10 em passos de 0,1 (valor interno 0–100) para edição do diagnóstico por tópico.
 */
export function DiagnosticScoreSlider({ value, onChange, disabled, className }: DiagnosticScoreSliderProps) {
  const id = useId();
  const score = parseScoreDraft(value);
  const sliderInt = Math.round(score * 10);
  const display = (sliderInt / 10).toFixed(1);
  const fillPct = sliderInt;

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border border-border/70 bg-gradient-to-b from-muted/45 to-muted/10 px-3.5 py-3.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] dark:from-muted/30 dark:to-muted/5 dark:border-white/[0.08]",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="flex items-end justify-between gap-3">
        <label
          htmlFor={id}
          className="pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Nota do tópico
        </label>
        <div className="flex flex-col items-end gap-1" aria-live="polite">
          <div className="flex items-baseline gap-0.5 tabular-nums">
            <span className={cn("text-3xl font-bold leading-none tracking-tight sm:text-[2rem]", scoreValueTextClass(score))}>
              {display}
            </span>
            <span className="text-sm font-medium text-muted-foreground">/10</span>
          </div>
          <div className="h-1 w-[4.5rem] overflow-hidden rounded-full bg-muted/80">
            <div
              className={cn("h-full rounded-full transition-[width] duration-150 ease-out", scoreBarClass(score))}
              style={{ width: `${fillPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={sliderInt}
          disabled={disabled}
          onChange={(e) => onChange((Number(e.target.value) / 10).toFixed(1))}
          className="diagnostic-score-slider w-full"
          style={{ ["--slider-fill" as string]: `${fillPct}%` }}
          aria-valuemin={0}
          aria-valuemax={10}
          aria-valuenow={Number.parseFloat(display)}
          aria-valuetext={`${display} de 10`}
        />
        <div className="flex justify-between px-0.5 text-[10px] font-medium tabular-nums tracking-wide text-muted-foreground">
          <span>0</span>
          <span className="text-muted-foreground/80">5</span>
          <span>10</span>
        </div>
      </div>
    </div>
  );
}
