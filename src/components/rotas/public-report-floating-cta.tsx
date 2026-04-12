"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Calendar, X } from "lucide-react";

import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ResolvedReportCta } from "@/lib/report-cta";

/** `main` rolável: página pública `/r/...` e área de conteúdo do dashboard. */
const SCROLL_ROOT_ID = "rota-report-scroll-root";
const BOTTOM_CTA_ID = "report-chamada-acao";
/** Card “Diagnóstico por tópico” em `rota-digital-report-view.tsx`. */
const DIAGNOSTIC_SECTION_ID = "report-section-diagnostico-topicos";
const STORAGE_PREFIX = "rota-public-floating-cta-dismiss";

/** Fallback se o relatório não tiver bloco de diagnóstico: rolagem mínima (px). */
const ENGAGE_SCROLL_FALLBACK_PX = 200;
/** Só faz sentido se a página for claramente rolável. */
const MIN_SCROLLABLE_GAP_PX = 120;

type BottomCta = ResolvedReportCta["bottom"];

function storageDismissKey(slugOrId: string) {
  return `${STORAGE_PREFIX}:${slugOrId}`;
}

/**
 * CTA flutuante no relatório (página pública e pré-visualização no dashboard): aparece quando o scroll
 * chega ao **fim** da seção “Diagnóstico por tópico” (base do card alinha com a borda inferior do main;
 * fallback por rolagem se essa seção não existir),
 * some quando o CTA principal do fim entra na tela (evita duplicar) e pode ser fechado
 * (lembrado na sessão). Animações com spring + AnimatePresence (motion).
 */
export function PublicReportFloatingCta({
  bottomCta,
  storageKey,
}: {
  bottomCta: BottomCta;
  storageKey: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [bottomCtaVisible, setBottomCtaVisible] = useState(false);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const reducedMotionPref = useReducedMotion();
  const reduceMotion = reducedMotionPref === true;

  const dismissStorageKey = useMemo(
    () => storageDismissKey(storageKey.trim() || "default"),
    [storageKey],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(dismissStorageKey) === "1") setDismissed(true);
    } catch {
      /* private mode */
    }
  }, [dismissStorageKey]);

  const bindScrollRoot = useCallback(() => {
    scrollRootRef.current = document.getElementById(SCROLL_ROOT_ID) as HTMLElement | null;
    return scrollRootRef.current;
  }, []);

  const updateEngaged = useCallback(() => {
    const root = scrollRootRef.current ?? bindScrollRoot();
    if (!root) return;
    const { scrollTop, scrollHeight, clientHeight } = root;
    const scrollable = scrollHeight - clientHeight;
    const hasRoom = scrollable >= MIN_SCROLLABLE_GAP_PX;
    if (!hasRoom) {
      setEngaged(false);
      return;
    }

    const diagnosticEl = document.getElementById(DIAGNOSTIC_SECTION_ID);
    if (!diagnosticEl) {
      setEngaged(scrollTop >= ENGAGE_SCROLL_FALLBACK_PX);
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const elRect = diagnosticEl.getBoundingClientRect();
    /** Base do card de diagnóstico atingiu ou passou da borda de baixo da área visível = fim da seção. */
    const reachedEndOfDiagnosticSection = elRect.bottom <= rootRect.bottom + 0.5;
    setEngaged(reachedEndOfDiagnosticSection);
  }, [bindScrollRoot]);

  useEffect(() => {
    const root = bindScrollRoot();
    if (!root) return;

    updateEngaged();

    const onScroll = () => updateEngaged();
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    const bottomEl = document.getElementById(BOTTOM_CTA_ID);
    if (!bottomEl) {
      return () => {
        root.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries[0];
        if (!hit) return;
        setBottomCtaVisible(hit.isIntersecting && hit.intersectionRatio > 0.04);
      },
      { root, threshold: [0, 0.04, 0.12, 0.25] },
    );
    io.observe(bottomEl);

    return () => {
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      io.disconnect();
    };
  }, [bindScrollRoot, updateEngaged]);

  const visible = !dismissed && engaged && !bottomCtaVisible;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(dismissStorageKey, "1");
    } catch {
      /* ignore */
    }
  };

  /** Spring suave (entrada/saída); curva ease no modo reduzido — alinhado a padrões de UI motion. */
  const panelTransition = reduceMotion
    ? { duration: 0.26, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }
    : { type: "spring" as const, stiffness: 380, damping: 34, mass: 0.86 };

  return (
    <div
      className={cn(
        "no-print pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 sm:px-4",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2",
      )}
      aria-hidden={!visible}
    >
      <AnimatePresence mode="sync">
        {visible ? (
          <motion.div
            key="report-floating-cta"
            role="region"
            aria-label="Convite para falar com a Rota Digital"
            aria-live="polite"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 34, scale: 0.91 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
            transition={panelTransition}
            className="pointer-events-auto w-full max-md:max-w-sm md:max-w-md origin-bottom"
            style={{ willChange: reduceMotion ? "opacity" : "transform, opacity" }}
          >
            <div
              className={cn(
                "relative flex flex-col gap-2.5 rounded-2xl border border-border/90 bg-card/92 px-3.5 py-3 shadow-xl ring-1 ring-foreground/[0.06] backdrop-blur-md",
                "dark:border-white/12 dark:bg-zinc-950/90 dark:ring-white/[0.08]",
              )}
            >
              <button
                type="button"
                tabIndex={visible ? undefined : -1}
                onClick={handleDismiss}
                className={cn(
                  "absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full",
                  "text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                )}
                aria-label="Fechar este convite"
              >
                <X className="size-4" aria-hidden />
              </button>

              <div className="pr-8">
                <p className="text-[13px] font-medium leading-snug text-foreground sm:text-sm">
                  Ficou com dúvida sobre os próximos passos?
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground sm:text-[13px]">
                  Posso explicar como colocar o plano em prática.
                </p>
              </div>

              <a
                href={bottomCta.href}
                tabIndex={visible ? undefined : -1}
                {...(bottomCta.openInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                onClick={() => {
                  if (bottomCta.href.trim().startsWith("#")) handleDismiss();
                }}
                className={cn(
                  buttonVariants({ variant: "ctaMotionGreen", size: "default" }),
                  "h-10 w-full shrink-0 justify-center gap-2 px-4 text-sm font-semibold",
                )}
              >
                {bottomCta.useWhatsAppIcon ? (
                  <WhatsAppIcon className="size-4 shrink-0" />
                ) : (
                  <Calendar className="size-4 shrink-0" aria-hidden />
                )}
                {bottomCta.label}
              </a>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
