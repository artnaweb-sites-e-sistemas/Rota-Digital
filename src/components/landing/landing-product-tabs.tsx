"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Building2, Compass, FileText, Users, ChevronRight, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import BorderGlow from "@/components/BorderGlow";

/** Mesmo asset de demo em todos os módulos da secção #produto (layout alinhado ao card). */
const PRODUCT_PANEL_VIDEO_SRC = "/videos/landing/rota-digital-dark2.webm" as const;

const TABS = [
  {
    id: "leads",
    label: "Prospecção",
    icon: Users,
    videoSrc: "/videos/landing/leads-dark2.webm",
    title: "Controle total do seu funil",
    description:
      "Veja o funil completo num só painel, priorize com quem falar e o próximo passo de cada oportunidade.",
    bullets: [
      "Organize os leads por etapa da negociação",
      "Guarde histórico de mensagens, contatos e anotações",
      "Priorize os leads com mais chance de fechar",
    ],
  },
  {
    id: "rota",
    label: "Rota Digital",
    icon: Compass,
    videoSrc: PRODUCT_PANEL_VIDEO_SRC,
    title: "Diagnóstico que abre a venda",
    description:
      "A IA analisa site, Instagram e Google Meu Negócio e entrega um diagnóstico pronto para vender com mais contexto.",
    bullets: [
      "Diagnóstico em menos de 60 segundos",
      "Google Meu Negócio e concorrentes locais",
      "Link com sua marca e rota priorizada",
    ],
  },
  {
    id: "proposta",
    label: "Proposta",
    icon: FileText,
    videoSrc: "/videos/landing/propsota-dark2.webm",
    title: "Propostas com mais poder de fechamento",
    description:
      "Monte propostas a partir do diagnóstico, com escopo, linguagem e tom prontos para fechar a negociação.",
    bullets: [
      "Crie o escopo com base no diagnóstico da empresa",
      "Apresente o valor da sua solução com mais clareza",
      "Envie uma proposta mais bonita e fácil de entender",
    ],
  },
] as const;

/** Rotação automática dos painéis (sem precisar de clique ou hover). */
const AUTO_TAB_INTERVAL_MS = 3800;

export function LandingProductTabs() {
  const [active, setActive] = useState<(typeof TABS)[number]["id"]>("leads");
  const [pauseAuto, setPauseAuto] = useState(false);
  const tabsStripRef = useRef<HTMLDivElement>(null);

  const panel = TABS.find((t) => t.id === active)!;

  /**
   * No mobile, mantém o botão ativo visível no "carrossel" (agora vertical).
   * Não usar scrollIntoView — nalguns browsers também faz scroll do documento e a página “salta” para cima.
   */
  useEffect(() => {
    const strip = tabsStripRef.current;
    if (!strip) return;
    const hasHorizontalOverflow = strip.scrollWidth > strip.clientWidth + 1;
    const hasVerticalOverflow = strip.scrollHeight > strip.clientHeight + 1;
    if (!hasHorizontalOverflow && !hasVerticalOverflow) return;
    const btn = strip.querySelector<HTMLElement>(`[data-landing-tab="${active}"]`);
    if (!btn) return;

    const align = () => {
      const sr = strip.getBoundingClientRect();
      const br = btn.getBoundingClientRect();
      const pad = 12;
      let deltaX = 0;
      let deltaY = 0;
      if (hasHorizontalOverflow) {
        if (br.left < sr.left + pad) deltaX = br.left - sr.left - pad;
        else if (br.right > sr.right - pad) deltaX = br.right - sr.right + pad;
      }
      if (hasVerticalOverflow) {
        if (br.top < sr.top + pad) deltaY = br.top - sr.top - pad;
        else if (br.bottom > sr.bottom - pad) deltaY = br.bottom - sr.bottom + pad;
      }
      if (deltaX !== 0 || deltaY !== 0) {
        strip.scrollBy({ left: deltaX, top: deltaY, behavior: "smooth" });
      }
    };

    requestAnimationFrame(align);
  }, [active]);

  useEffect(() => {
    if (TABS.length < 2 || pauseAuto) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setActive((prev) => {
        const i = TABS.findIndex((t) => t.id === prev);
        return TABS[(i + 1) % TABS.length]!.id;
      });
    }, AUTO_TAB_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [pauseAuto]);

  return (
    <div
      className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,260px)_1fr] lg:gap-12"
      onMouseEnter={() => setPauseAuto(true)}
      onMouseLeave={() => setPauseAuto(false)}
      onTouchStartCapture={() => setPauseAuto(true)}
      onTouchEndCapture={() => setPauseAuto(false)}
      onTouchCancelCapture={() => setPauseAuto(false)}
    >
      <div
        ref={tabsStripRef}
        className="flex flex-col gap-3 pb-1 pr-0 lg:max-h-none lg:flex-col lg:overflow-visible lg:pb-0 lg:pr-0"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isOn = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              data-landing-tab={tab.id}
              onClick={() => setActive(tab.id)}
              className={cn(
                "group relative flex shrink-0 items-center justify-between gap-4 rounded-xl border p-4 text-left transition-all duration-300",
                isOn
                  ? "border-primary/40 bg-primary/8 text-foreground shadow-md ring-1 ring-primary/15 dark:bg-primary/10 dark:shadow-primary/5"
                  : "border-border bg-white text-muted-foreground hover:bg-zinc-50 hover:text-foreground dark:bg-card/40 dark:hover:bg-muted/80",
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex size-10 items-center justify-center rounded-lg transition-colors",
                  isOn ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-zinc-100 text-muted-foreground group-hover:bg-zinc-200 dark:bg-muted/50 dark:group-hover:bg-muted"
                )}>
                  <Icon className="size-5 shrink-0" aria-hidden />
                </div>
                <span className="font-semibold">{tab.label}</span>
              </div>
              <ChevronRight className={cn(
                "size-4 transition-transform hidden lg:block",
                isOn ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
              )} />
              {isOn && (
                <motion.div
                  layoutId="active-pill"
                  className="absolute -left-1 hidden h-8 w-1 rounded-sm bg-brand lg:block"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* `overflow-x-hidden` na grelha força `overflow-y: auto` no mesmo elemento (CSS) e cria scroll vertical falso nas células. Só `min-w-0` + animação em Y. */}
      <div className="min-h-0 min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="h-full"
          >
          <BorderGlow
            disableBorderGlowOnMobile
            className="h-full rounded-xl bg-white dark:bg-zinc-950/20"
            backgroundColor="var(--background)"
            borderRadius={12}
            glowRadius={40}
            glowColor="43 38 48"
            colors={["#c4b27a", "#8e7d4d", "#e8dcc4"]}
            contentInset={1}
            animated={true}
            disablePointerTracking
            loopEntranceAnimation
          >
            <div className="grid h-full gap-8 px-6 pb-0 pt-6 sm:px-10 sm:pb-0 sm:pt-10 lg:grid-cols-[1fr_1.1fr]">
              <div className="flex flex-col justify-center pb-6 sm:pb-10">
                <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.15em] text-brand">
                  <Building2 className="size-4" aria-hidden />
                  <span>Módulo {panel.label}</span>
                </div>
                <h3 className="font-heading text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                  {panel.title}
                </h3>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {panel.description}
                </p>

                <ul className="mt-8 space-y-4">
                  {panel.bullets.map((line) => (
                    <li key={line} className="flex items-start gap-3">
                      <div className="mt-1 flex size-5 items-center justify-center rounded-md bg-brand/10 text-brand">
                        <CheckCircle2 className="size-3.5" />
                      </div>
                      <span className="text-sm font-medium text-foreground/80">{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div
                className={cn(
                  "relative rounded-br-xl leading-none",
                  /* Mobile: corta canto arredondado; desktop: sem clip (vídeo inteiro + bleed) */
                  "max-lg:overflow-hidden lg:overflow-visible",
                  /* Mobile / tablet: bleed à direita (exceto Proposta — ver abaixo) */
                  panel.id !== "proposta" &&
                    "max-lg:-mr-6 sm:max-lg:-mr-10 max-lg:ml-0 max-lg:w-[calc(100%+1.5rem)] sm:max-lg:w-[calc(100%+2.5rem)]",
                  /* Proposta (só max-lg): sem margem negativa; respiro em baixo e à direita */
                  panel.id === "proposta" &&
                    "max-lg:mx-0 max-lg:w-full max-lg:mb-6 max-lg:pr-0 sm:max-lg:mb-8 sm:max-lg:pr-2",
                  /**
                   * Desktop: o *wrapper* compensa px-10 + contentInset (1px) para encostar à borda;
                   * o <video> fica só com max-height + tamanho intrínseco — não “amplia” o vídeo.
                   */
                  "lg:mx-0 lg:flex lg:h-full lg:min-h-0 lg:min-w-0 lg:items-end lg:justify-end",
                  "lg:w-[calc(100%+2.5rem+1px)] lg:max-w-none lg:-mr-[calc(2.5rem+1px)]",
                  /* Proposta: `margin` não aparece com grid + `h-full`; `padding-bottom` cria o vazio em baixo do vídeo. */
                  panel.id === "proposta" ? "lg:pb-14" : "lg:-mb-6",
                )}
              >
                <video
                  key={panel.videoSrc}
                  className={cn(
                    "z-0 block max-w-none",
                    /* Mobile: fluxo natural, inteiro, à direita */
                    "max-lg:relative max-lg:h-auto max-lg:object-contain max-lg:object-right",
                    panel.id === "proposta"
                      ? "max-lg:w-[calc(100%+12px)] max-lg:max-w-none max-lg:-mr-3 max-lg:max-h-[min(400px,85vh)]"
                      : "max-lg:w-full",
                    /* Desktop: frame completo (intrínseco + limite de altura), alinhado à direita do wrapper */
                    "lg:h-auto lg:w-auto lg:max-w-none lg:shrink-0",
                    panel.id === "proposta"
                      ? "lg:max-h-[min(300px,calc(100vh-12rem))]"
                      : "lg:max-h-[min(340px,calc(100vh-12rem))]",
                    "lg:object-contain lg:object-right",
                  )}
                  src={panel.videoSrc}
                  muted
                  loop
                  playsInline
                  autoPlay
                  preload="auto"
                  aria-label={`Demonstração em vídeo do módulo ${panel.label}`}
                />
              </div>
            </div>
          </BorderGlow>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
