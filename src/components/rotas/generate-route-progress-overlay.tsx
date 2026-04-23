"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ImageUp, Loader2 } from "lucide-react";
import {
  ProgressOverlayPageReloadWarning,
  ProgressOverlayRotaLabLogo,
} from "@/components/rotas/progress-overlay-shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type GenerateRouteEvidenceRecovery = {
  companyName?: string;
  missingSite: boolean;
  missingInstagram: boolean;
  sitePreviewUrl: string | null;
  instagramPreviewUrl: string | null;
  uploadingSite: boolean;
  uploadingInstagram: boolean;
  onRequestSiteFile: () => void;
  onRequestInstagramFile: () => void;
  onAnalyzeWithoutPrints: () => void;
  onProceedWithAnalysis: () => void;
  canProceed: boolean;
  running: boolean;
  error: string | null;
};

type Props = {
  open: boolean;
  /** `recovery` = fluxo pós-coleta: prints em falta; senão barra de progresso. */
  view?: "progress" | "recovery";
  progress: number;
  companyName?: string;
  /** Sem transição CSS na largura (uso com animação frame a frame até 100%). */
  instantBarWidth?: boolean;
  /** `reanalyze`: textos para reanálise com IA (relatório já existente). */
  mode?: "generate" | "reanalyze";
  evidenceRecovery?: GenerateRouteEvidenceRecovery | null;
};

const STATUS_BY_PROGRESS = [
  { max: 18, text: "Coletando dados do site e do Instagram…" },
  { max: 38, text: "Consultando a IA e enriquecendo a análise…" },
  { max: 58, text: "Avaliando maturidade digital e pontos de atenção…" },
  { max: 78, text: "Montando diagnóstico e canais recomendados…" },
  { max: 95, text: "Finalizando relatório e salvando evidências…" },
  { max: 101, text: "Concluindo — abrindo seu relatório…" },
];

const STATUS_BY_PROGRESS_REANALYZE = [
  { max: 22, text: "A enviar o relatório e a sua observação…" },
  { max: 48, text: "A pedir à IA para refinar o diagnóstico…" },
  { max: 72, text: "A atualizar textos, tópicos e canais…" },
  { max: 92, text: "A guardar alterações no relatório…" },
  { max: 101, text: "A concluir…" },
];

function statusLabel(p: number, rows: { max: number; text: string }[]): string {
  for (const row of rows) {
    if (p < row.max) return row.text;
  }
  return rows[rows.length - 1]!.text;
}

function EvidenceRecoveryPanel({ r }: { r: GenerateRouteEvidenceRecovery }) {
  return (
    <>
      <h2
        id="rd-generate-recovery-title"
        className="text-lg font-semibold tracking-tight text-foreground"
      >
        Capturas em falta
      </h2>
      {r.companyName ? <p className="mt-1 text-sm text-muted-foreground">{r.companyName}</p> : null}
      <p
        id="rd-generate-recovery-desc"
        className="mt-4 w-full text-left text-sm leading-relaxed text-muted-foreground"
      >
        Não foi possível carregar automaticamente o site e/ou o Instagram. Envie um print (imagem) para
        a IA concluir a análise com contexto visual, ou continue sem imagens.
      </p>

      <div className="mt-4 w-full space-y-3">
        {r.missingSite ? (
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/90">Site</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={r.uploadingSite || r.running}
                onClick={r.onRequestSiteFile}
              >
                {r.uploadingSite ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ImageUp className="size-3.5" />
                )}
                {r.sitePreviewUrl ? "Substituir print do site" : "Enviar print do site"}
              </Button>
            </div>
            {r.sitePreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.sitePreviewUrl}
                alt=""
                className="mt-2 max-h-32 w-full rounded-md border border-border/60 object-contain object-top"
              />
            ) : null}
          </div>
        ) : null}

        {r.missingInstagram ? (
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/90">Instagram</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={r.uploadingInstagram || r.running}
                onClick={r.onRequestInstagramFile}
              >
                {r.uploadingInstagram ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ImageUp className="size-3.5" />
                )}
                {r.instagramPreviewUrl ? "Substituir print do Instagram" : "Enviar print do Instagram"}
              </Button>
            </div>
            {r.instagramPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.instagramPreviewUrl}
                alt=""
                className="mt-2 max-h-32 w-full rounded-md border border-border/60 object-contain object-top"
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {r.error ? (
        <div className="mt-3 w-full rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-left text-sm text-destructive">
          {r.error}
        </div>
      ) : null}

      <ProgressOverlayPageReloadWarning />

      <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row sm:justify-center sm:gap-3">
        <Button
          type="button"
          variant="outline"
          className="w-full sm:flex-1"
          disabled={r.running}
          onClick={r.onAnalyzeWithoutPrints}
        >
          {r.running ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Analisar sem os prints
        </Button>
        <Button
          type="button"
          variant="cta"
          className="w-full sm:flex-1"
          disabled={r.running || !r.canProceed}
          onClick={r.onProceedWithAnalysis}
        >
          {r.running ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Prosseguir com a análise
        </Button>
      </div>
    </>
  );
}

export function GenerateRouteProgressOverlay({
  open,
  view = "progress",
  progress,
  companyName,
  instantBarWidth = false,
  mode = "generate",
  evidenceRecovery = null,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const statusRows = mode === "reanalyze" ? STATUS_BY_PROGRESS_REANALYZE : STATUS_BY_PROGRESS;
  const title = mode === "reanalyze" ? "Reanalisando com IA" : "Gerando Rota Digital";
  const isRecovery = view === "recovery" && evidenceRecovery;

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
  const label = statusLabel(clamped, statusRows);

  return createPortal(
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={isRecovery ? "rd-generate-recovery-title" : "rd-generate-progress-title"}
      aria-describedby={isRecovery ? "rd-generate-recovery-desc" : "rd-generate-progress-desc"}
    >
      <div
        className="absolute inset-0 bg-zinc-950/70 backdrop-blur-md backdrop-saturate-150"
        aria-hidden
      />
      <div
        className={cn(
          "relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-card/95 p-8 shadow-2xl ring-1 ring-brand/25 supports-[backdrop-filter]:bg-card/90",
          isRecovery && "max-w-[460px]",
        )}
      >
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

          {isRecovery && evidenceRecovery ? (
            <EvidenceRecoveryPanel r={evidenceRecovery} />
          ) : (
            <>
              <h2
                id="rd-generate-progress-title"
                className="text-lg font-semibold tracking-tight text-foreground"
              >
                {title}
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

              <ProgressOverlayPageReloadWarning />

              <div className="mt-6 w-full space-y-2">
                <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                  <span>Progresso estimado</span>
                  <span className="tabular-nums font-medium text-foreground">
                    {Math.round(clamped)}%
                  </span>
                </div>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-muted/80 ring-1 ring-white/5">
                  <div
                    className={`relative h-full overflow-hidden rounded-full bg-gradient-to-r from-[#1c1910] via-[#4a422c] to-[#5c5235] shadow-[0_0_24px_-2px_rgba(0,0,0,0.35)] ease-out ${
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
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
