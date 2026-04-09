"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";

type Props = {
  open: boolean;
  progress: number;
  companyName?: string;
  /** Sem transição CSS na largura (uso com animação frame a frame até 100%). */
  instantBarWidth?: boolean;
};

const STATUS_BY_PROGRESS = [
  { max: 18, text: "Coletando dados do site e do Instagram…" },
  { max: 38, text: "Consultando a IA e enriquecendo a análise…" },
  { max: 58, text: "Avaliando maturidade digital e pontos de atenção…" },
  { max: 78, text: "Montando diagnóstico e canais recomendados…" },
  { max: 95, text: "Finalizando relatório e salvando evidências…" },
  { max: 101, text: "Concluindo — abrindo seu relatório…" },
];

function statusLabel(p: number): string {
  for (const row of STATUS_BY_PROGRESS) {
    if (p < row.max) return row.text;
  }
  return STATUS_BY_PROGRESS[STATUS_BY_PROGRESS.length - 1]!.text;
}

export function GenerateRouteProgressOverlay({
  open,
  progress,
  companyName,
  instantBarWidth = false,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted || !open) return null;

  const clamped = Math.min(100, Math.max(0, progress));
  const label = statusLabel(clamped);

  return createPortal(
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rd-generate-progress-title"
      aria-describedby="rd-generate-progress-desc"
    >
      <div
        className="absolute inset-0 bg-zinc-950/70 backdrop-blur-md backdrop-saturate-150"
        aria-hidden
      />
      <div
        className="relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-card/95 p-8 shadow-2xl ring-1 ring-indigo-500/25 supports-[backdrop-filter]:bg-card/90"
      >
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-48 w-48 rounded-full bg-indigo-500/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-16 h-40 w-40 rounded-full bg-violet-600/15 blur-3xl"
          aria-hidden
        />

        <div className="relative flex flex-col items-center text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/30">
            <Sparkles className="h-7 w-7 text-white" strokeWidth={1.75} />
          </div>

          <h2
            id="rd-generate-progress-title"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            Gerando Rota Digital
          </h2>
          {companyName ? (
            <p className="mt-1 text-sm text-muted-foreground">{companyName}</p>
          ) : null}

          <p
            id="rd-generate-progress-desc"
            className="mt-4 min-h-[2.75rem] text-sm leading-relaxed text-muted-foreground"
          >
            {label}
          </p>

          <div className="mt-6 w-full space-y-2">
            <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
              <span>Progresso estimado</span>
              <span className="tabular-nums font-medium text-foreground">{Math.round(clamped)}%</span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-muted/80 ring-1 ring-white/5">
              <div
                className={`relative h-full overflow-hidden rounded-full bg-gradient-to-r from-indigo-600 via-violet-500 to-indigo-500 shadow-[0_0_24px_-2px_rgba(99,102,241,0.55)] ease-out ${
                  instantBarWidth
                    ? "transition-none"
                    : clamped >= 99
                      ? "transition-[width] duration-200"
                      : "transition-[width] duration-[480ms]"
                }`}
                style={{ width: `${clamped}%` }}
              >
                <div
                  className="rd-progress-shine absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent opacity-90"
                  aria-hidden
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
