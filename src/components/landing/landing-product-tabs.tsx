"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Building2, Compass, FileText, Users, ChevronRight, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import BorderGlow from "@/components/BorderGlow";

const TABS = [
  {
    id: "leads",
    label: "Prospecção",
    icon: Users,
    title: "Domine seu Funil de Vendas",
    description: "Organize seus prospectos com inteligência e nunca mais perca uma oportunidade por falta de acompanhamento.",
    bullets: [
      "Pipeline visual com arrastar e soltar (Kanban)",
      "Histórico centralizado de interações e contatos",
      "Qualificação automática baseada em dados reais",
    ],
  },
  {
    id: "rota",
    label: "Rota Digital",
    icon: Compass,
    title: "Diagnóstico Inteligente com IA",
    description: "Nossa IA analisa a presença digital do lead em segundos, gerando um dossiê completo de maturidade e canais.",
    bullets: [
      "Análise automática de Instagram e Website",
      "Geração de notas de maturidade por setor",
      "Link público profissional para envio imediato",
    ],
  },
  {
    id: "proposta",
    label: "Envio de proposta",
    icon: FileText,
    title: "Venda com Autoridade Máxima",
    description: "Transforme diagnósticos em propostas comerciais irresistíveis que conectam o problema à sua solução.",
    bullets: [
      "Geração de escopo baseada no diagnóstico",
      "Design minimalista focado em conversão",
      "Página de proposta interativa e responsiva",
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
   * No strip horizontal (mobile), mantém o botão ativo visível.
   * Não usar scrollIntoView — nalguns browsers também faz scroll do documento e a página “salta” para cima.
   */
  useEffect(() => {
    const strip = tabsStripRef.current;
    if (!strip) return;
    if (strip.scrollWidth <= strip.clientWidth + 1) return;
    const btn = strip.querySelector<HTMLElement>(`[data-landing-tab="${active}"]`);
    if (!btn) return;

    const align = () => {
      const sr = strip.getBoundingClientRect();
      const br = btn.getBoundingClientRect();
      const pad = 12;
      let delta = 0;
      if (br.left < sr.left + pad) delta = br.left - sr.left - pad;
      else if (br.right > sr.right - pad) delta = br.right - sr.right + pad;
      if (delta !== 0) strip.scrollBy({ left: delta, behavior: "smooth" });
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
      className="grid gap-10 lg:grid-cols-[minmax(0,260px)_1fr] lg:gap-12"
      onMouseEnter={() => setPauseAuto(true)}
      onMouseLeave={() => setPauseAuto(false)}
    >
      <div
        ref={tabsStripRef}
        className="flex flex-row gap-3 overflow-x-auto pb-4 [scroll-padding-inline:12px] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:flex-col lg:overflow-visible lg:pb-0"
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

      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="h-full"
        >
          <BorderGlow
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
            <div className="grid h-full gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr]">
              <div className="flex flex-col justify-center">
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

              <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border bg-zinc-50 shadow-inner dark:border-white/5 dark:bg-white/[0.02]">
                <div className="absolute inset-0 bg-gradient-to-br from-brand/5 via-transparent to-transparent" />
                <div className="relative z-10 p-4 text-center">
                  <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-white border shadow-sm dark:bg-background dark:border-border/50">
                    <panel.icon className="size-6 text-brand" />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Interface Preview</p>
                  <div className="mt-6 flex flex-col gap-2 w-full max-w-[240px] mx-auto">
                    <div className="h-2 w-3/4 rounded bg-brand/20" />
                    <div className="h-2 w-full rounded bg-zinc-200 dark:bg-muted" />
                    <div className="h-2 w-1/2 rounded bg-zinc-200 dark:bg-muted" />
                  </div>
                  <div className="mt-8 grid grid-cols-3 gap-2 w-full max-w-[240px] mx-auto">
                    {[1, 2, 3].map(i => <div key={i} className="aspect-square rounded-lg bg-zinc-200/70 dark:bg-muted/50" />)}
                  </div>
                </div>
                {/* Decorative Elements */}
                <div className="absolute -bottom-10 -right-10 size-40 rounded-full bg-brand/10 blur-3xl opacity-50 dark:bg-brand/20" />
                <div className="absolute -top-10 -left-10 size-40 rounded-full bg-amber-500/5 blur-3xl opacity-30 dark:bg-purple-500/10" />
              </div>
            </div>
          </BorderGlow>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
