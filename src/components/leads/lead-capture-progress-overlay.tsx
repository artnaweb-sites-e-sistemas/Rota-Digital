"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ProgressOverlayPageReloadWarning,
  ProgressOverlayRotaLabLogo,
} from "@/components/rotas/progress-overlay-shared";

type Props = {
  open: boolean;
  progress: number;
  /** Texto auxiliar (ex.: nicho + cidade). */
  hint?: string;
};

const STATUS_BY_PROGRESS = [
  { max: 22, text: "Consultando o Google Places na sua região…" },
  { max: 48, text: "Buscando telefone, site e endereço de cada resultado…" },
  { max: 72, text: "Cruzando com a sua base para evitar duplicados…" },
  { max: 94, text: "Gravando novos leads como “Novo Lead”…" },
  { max: 101, text: "Concluindo — atualizando a lista…" },
];

function statusLabel(p: number): string {
  for (const row of STATUS_BY_PROGRESS) {
    if (p < row.max) return row.text;
  }
  return STATUS_BY_PROGRESS[STATUS_BY_PROGRESS.length - 1]!.text;
}

export function LeadCaptureProgressOverlay({ open, progress, hint }: Props) {
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
      aria-labelledby="rd-lead-capture-progress-title"
      aria-describedby="rd-lead-capture-progress-desc"
    >
      <div className="absolute inset-0 bg-zinc-950/70 backdrop-blur-md backdrop-saturate-150" aria-hidden />
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-card/95 p-8 shadow-2xl ring-1 ring-brand/25 supports-[backdrop-filter]:bg-card/90">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-48 w-48 rounded-full bg-brand/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-16 h-40 w-40 rounded-full bg-brand/12 blur-3xl"
          aria-hidden
        />

        <div className="relative flex flex-col items-center text-center">
          <ProgressOverlayRotaLabLogo />

          <h2
            id="rd-lead-capture-progress-title"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            Captura automática de leads
          </h2>
          {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}

          <p
            id="rd-lead-capture-progress-desc"
            className="mt-4 min-h-[2.75rem] text-sm leading-relaxed text-muted-foreground"
          >
            {label}
          </p>

          <ProgressOverlayPageReloadWarning />

          <div className="mt-6 w-full space-y-2">
            <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
              <span>Progresso estimado</span>
              <span className="tabular-nums font-medium text-foreground">{Math.round(clamped)}%</span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-muted/80 ring-1 ring-white/5">
              <div
                className={`relative h-full overflow-hidden rounded-full bg-gradient-to-r from-[#1c1910] via-[#4a422c] to-[#5c5235] shadow-[0_0_24px_-2px_rgba(0,0,0,0.35)] ease-out ${
                  clamped >= 99 ? "transition-[width] duration-200" : "transition-[width] duration-[480ms]"
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
    document.body,
  );
}
