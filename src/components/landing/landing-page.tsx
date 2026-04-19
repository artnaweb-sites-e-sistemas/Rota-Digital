"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  ChevronRight,
  Compass,
  FileText,
  Link2,
  LogIn,
  Send,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";

import Grainient from "@/components/grainient";
import GlassSurface from "@/components/glass-surface";
import { getRotaHeroHyperspeedOptions } from "@/components/hyperspeed";
import { PublicThemeToggle } from "@/components/public-theme-toggle";
import { useTheme } from "next-themes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { cn } from "@/lib/utils";

import { LandingProductTabs } from "@/components/landing/landing-product-tabs";
import BorderGlow from "@/components/BorderGlow";
import StarBorder from "@/components/StarBorder";

type LandingPlanFeature = string | { before: string; gold: string } | { before: string; red: string };

/** Destaca só os algarismos (incl. milhares tipo 1.000) na cor ouro da marca. */
function goldNumbersInText(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  const re = /(?:\d{1,3}(?:\.\d{3})+|\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(text.slice(last, m.index));
    }
    parts.push(
      <span key={`n-${m.index}`} className="font-medium text-brand tabular-nums">
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (parts.length === 0) return text;
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function PlanFeatureLabel({ feature }: { feature: LandingPlanFeature }) {
  if (typeof feature === "string") {
    return (
      <span className="leading-normal tracking-normal">{goldNumbersInText(feature)}</span>
    );
  }
  if ("gold" in feature) {
    return (
      <span className="inline leading-normal tracking-normal">
        {goldNumbersInText(feature.before)}
        {" "}
        <span className="font-medium text-brand">{feature.gold}</span>
      </span>
    );
  }
  return (
    <span className="inline leading-normal tracking-normal">
      {goldNumbersInText(feature.before)}
      {" "}
      <span className="font-medium text-destructive">{feature.red}</span>
    </span>
  );
}

const HeroHyperspeed = dynamic(() => import("@/components/hyperspeed"), {
  ssr: false,
  loading: () => null,
});

const NAV_LINKS = [
  { href: "#visao", label: "Visão" },
  { href: "#pilares", label: "Ecossistema" },
  { href: "#produto", label: "A Plataforma" },
  { href: "#como-funciona", label: "Fluxo" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "FAQ" },
] as const;

/** Scroll suave até ao id (só na landing). O `scroll-behavior` no CSS falha em alguns browsers com esta raiz de scroll. */
function scrollToLandingSection(hash: string) {
  const id = hash.startsWith("#") ? hash.slice(1) : hash;
  const el = document.getElementById(id);
  if (!el) return false;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  return true;
}

function handleInPageNavClick(e: MouseEvent<HTMLAnchorElement>, hash: string) {
  e.preventDefault();
  if (scrollToLandingSection(hash)) {
    window.history.pushState(null, "", hash);
  }
}

function SectionTitle({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto max-w-2xl text-center", className)}>
      {eyebrow ? (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-primary"
        >
          {eyebrow}
        </motion.p>
      ) : null}
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.1 }}
        className="font-heading text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl"
      >
        {title}
      </motion.h2>
      {description ? (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          {description}
        </motion.p>
      ) : null}
    </div>
  );
}

/** Imagem da hero (`public/videos/landing/hero.png`). */
function HeroVisual({ className }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, rotateX: 10, y: 40 }}
      animate={{ opacity: 1, rotateX: 0, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-muted shadow-[0_32px_80px_-16px_rgba(0,0,0,0.12)] dark:border-white/10 dark:shadow-[0_32px_80px_-16px_rgba(0,0,0,0.4)]",
        className,
      )}
    >
      <Image
        src="/videos/landing/hero.png"
        alt="Demonstração da plataforma Rota Digital"
        width={1920}
        height={1080}
        className="block h-auto w-full"
        sizes="(max-width: 1024px) 100vw, 50vw"
        priority
      />
    </motion.div>
  );
}

export function LandingPage() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const { resolvedTheme } = useTheme();
  const heroHyperspeedOptions = useMemo(
    () => getRotaHeroHyperspeedOptions(resolvedTheme),
    [resolvedTheme],
  );

  return (
    <div className="relative min-h-svh bg-background text-foreground selection:bg-primary/30">
      {/* Background: light mode uses warm tones, dark mode uses dark grain */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[800px] overflow-hidden">
        {/* Light mode: warm subtle gradient; dark mode: radial glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.06] via-primary/[0.02] to-background dark:bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.04)_0%,transparent_70%)] dark:from-transparent dark:via-transparent" />
        {/* Grainient only visible in dark mode */}
        <Grainient
          color1="#0a0a0a"
          color2="#171717"
          color3="#262626"
          timeSpeed={0.15}
          colorBalance={0}
          warpStrength={0.6}
          warpFrequency={3}
          warpSpeed={1}
          warpAmplitude={30}
          blendAngle={0}
          blendSoftness={0.1}
          rotationAmount={360}
          noiseScale={2.5}
          grainAmount={0.04}
          grainScale={1.5}
          grainAnimated={true}
          className="h-full w-full opacity-0 dark:opacity-40 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background" />
      </div>

      <header className="fixed inset-x-0 top-0 z-50 pt-3 sm:pt-4">
        {/* max-width inline: garante 1000px mesmo se utilitário Tailwind/flex não limitar o filho */}
        <div
          className="mx-auto box-border min-w-0 px-4 sm:px-6"
          style={{ width: "100%", maxWidth: 1000 }}
        >
          <GlassSurface
            width="100%"
            height="auto"
            borderRadius={14}
            borderWidth={0.065}
            brightness={54}
            opacity={0.88}
            blur={13}
            displace={2.8}
            backgroundOpacity={0.6}
            saturation={1.12}
            distortionScale={-130}
            redOffset={0}
            greenOffset={8}
            blueOffset={18}
            mixBlendMode="soft-light"
            edge="subtle"
            innerClassName="!flex !h-auto !min-h-16 !w-full !min-w-0 !max-w-full !items-stretch !justify-center !p-0"
            className="box-border w-full min-w-0 max-w-full rounded-xl"
            style={{ maxWidth: 1000, boxSizing: "border-box" }}
          >
            <div className="flex h-16 w-full min-w-0 max-w-full items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4">
              <Link href="/" className="flex min-w-0 shrink items-center gap-2 font-bold tracking-tight transition-transform hover:scale-105 sm:gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/20 sm:size-9">
                  <Compass className="size-4 sm:size-5" aria-hidden />
                </span>
                <span className="truncate text-base sm:text-lg">Rota Digital</span>
              </Link>
              <nav className="hidden min-w-0 items-center gap-0 md:flex" aria-label="Navegação Principal">
                {NAV_LINKS.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={(e) => handleInPageNavClick(e, item.href)}
                    className="rounded-lg px-1.5 py-2 text-[11px] font-medium text-muted-foreground transition-all hover:bg-black/[0.04] hover:text-foreground sm:px-2 sm:text-xs dark:hover:bg-white/[0.06]"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <PublicThemeToggle
                  id="landing-theme-toggle"
                  className={cn(
                    "h-9 min-h-9 w-9 shrink-0 rounded-lg border border-solid border-border/55 bg-background/50 shadow-none transition-all hover:border-border hover:bg-accent/80 sm:h-10 sm:min-h-10 sm:w-10",
                    "[&_svg]:text-foreground",
                    "dark:border-white/15 dark:bg-zinc-900/40",
                  )}
                />
                <LinkButton
                  href="/login"
                  variant="cta"
                  size="default"
                  className="h-9 min-w-[12.5rem] shrink-0 gap-2 rounded-lg px-5 text-sm font-semibold shadow-lg shadow-primary/15 sm:h-10 sm:min-w-[15rem] sm:px-7 md:min-w-[16.5rem] md:px-8"
                >
                  <LogIn className="size-4 shrink-0" aria-hidden />
                  <span className="whitespace-nowrap">Acessar Plataforma</span>
                </LinkButton>
              </div>
            </div>
          </GlassSurface>
        </div>
      </header>

      <div className="h-[calc(4rem+0.875rem)] shrink-0 sm:h-[calc(4rem+1rem)]" aria-hidden />

      <main>
        {/* --- Hero Section --- */}
        <section className="relative z-10 overflow-hidden px-4 pt-20 pb-20 sm:px-6 md:pt-32 md:pb-32">
          <div className="pointer-events-none absolute inset-0 z-0 min-h-[520px] md:min-h-[640px] hidden md:block">
            <HeroHyperspeed
              className="min-h-full opacity-[0.34] saturate-[0.72] contrast-[0.92]"
              effectOptions={heroHyperspeedOptions}
            />
          </div>
          <div
            className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-background/94 via-background/84 to-background/76 dark:from-background/[0.93] dark:via-background/82 dark:to-background/74"
            aria-hidden
          />
          <div className="relative z-[2] mx-auto grid max-w-7xl gap-12 lg:grid-cols-2 lg:gap-12 xl:gap-16 lg:items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="max-w-2xl"
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/8 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary shadow-sm" >
                <Sparkles className="size-3.5" aria-hidden />
                <span>O Futuro da Gestão de Leads</span>
              </div>
              <h1 className="font-heading text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-6xl md:leading-[1.1] lg:text-[4rem]">
                Transforme<br />
                <span className="bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent">Leads</span> em Clientes.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                A plataforma definitiva para agências modernas. Organize leads, gere diagnósticos em segundos com IA e entregue propostas que fecham vendas.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <StarBorder
                  speed="6s"
                  thickness={2}
                  color="var(--brand)"
                  accentColor="color-mix(in srgb, var(--brand) 45%, #fdfbf7 55%)"
                  className="w-full rounded-lg sm:w-auto"
                  contentClassName="rounded-lg"
                >
                  <Link
                    href="/login"
                    className="flex w-full items-center justify-center gap-2 text-base font-semibold transition-colors hover:text-brand"
                  >
                    Começar Agora
                    <ArrowRight className="size-4" />
                  </Link>
                </StarBorder>
              </div>
              <div className="mt-10 flex items-center gap-4 text-sm font-medium text-muted-foreground">
                <div className="flex -space-x-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="size-8 rounded-full border-2 border-background bg-muted shadow-sm" />
                  ))}
                </div>
                <p>Junte-se a dezenas de agências de alta performance</p>
              </div>
            </motion.div>

            <div className="relative mx-auto mt-8 w-full max-w-[600px] lg:mt-0 lg:max-w-none">
              {/* Glow orb: stronger in light, different color balance */}
              <div className="absolute -inset-10 rounded-full bg-gradient-to-r from-primary/15 to-amber-500/10 opacity-60 blur-3xl dark:from-primary/20 dark:to-amber-400/15 dark:opacity-30" />
              <HeroVisual />
            </div>
          </div>
        </section>

        {/* --- Social Proof --- */}
        <section className="relative z-10 border-y border-brand/25 bg-brand/16 py-16 dark:border-brand/30 dark:bg-brand/14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex flex-col items-center justify-center gap-10">
              <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-foreground/75 dark:text-foreground/80">
                Poderosa infraestrutura de inteligência e design
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-16 gap-y-10 opacity-80 transition-all duration-700 hover:opacity-100">
                {["Google Gemini 1.5 Pro", "Next.js 15 App Router", "Tailwind Engine v4", "Firebase Realtime"].map((tech) => (
                  <div key={tech} className="group relative flex items-center gap-2">
                    <span className="text-sm font-bold tracking-tight text-foreground sm:text-base lg:text-xl">
                      {tech}
                    </span>
                    <div className="absolute -bottom-1 left-0 h-[2px] w-0 bg-brand/55 transition-all group-hover:w-full dark:bg-brand/50" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* --- Para quem (Visão) --- */}
        <section id="visao" className="relative z-10 scroll-mt-24 px-4 py-24 sm:px-6 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <SectionTitle
              eyebrow="A Dor do Mercado"
              title="Vender serviços digitais não precisa ser sofrido"
              description="A grande maioria das agências gasta horas estruturando propostas que são ignoradas. Nós mudamos esse jogo."
            />
            <div className="mt-16 grid gap-6 md:grid-cols-3">
              {[
                { icon: Users, t: "Gestão Desorganizada", d: "Leads perdidos no WhatsApp e planilhas obsoletas." },
                { icon: Compass, t: "Diagnósticos Demorados", d: "Horas analisando concorrentes e redes sociais manualmente." },
                { icon: FileText, t: "Propostas Ignoradas", d: "PDFs massantes que não conectam com a dor real do cliente." },
              ].map(({ icon: Icon, t, d }, idx) => (
                <motion.div
                  key={t}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                >
                  <Card className="group relative h-full overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-[transform,box-shadow] hover:-translate-y-1 hover:shadow-md dark:border-white/5 dark:bg-white/[0.02] dark:hover:shadow-lg">
                    {/* Brilho só no topo — sem alterar a cor da borda do card */}
                    <div
                      className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[2px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      aria-hidden
                    >
                      <div className="h-full bg-gradient-to-r from-transparent via-brand to-transparent" />
                      <div className="absolute left-1/2 top-full h-4 w-[85%] max-w-sm -translate-x-1/2 bg-gradient-to-b from-brand/35 to-transparent blur-md" />
                    </div>
                    <CardHeader className="p-8">
                      <div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-brand-muted text-brand">
                        <Icon className="size-6" aria-hidden />
                      </div>
                      <CardTitle className="text-xl font-bold">{t}</CardTitle>
                      <CardDescription className="mt-3 text-base leading-relaxed">{d}</CardDescription>
                    </CardHeader>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* --- Pilares (Ecossistema) --- */}
        <section id="pilares" className="relative z-10 scroll-mt-24 border-t px-4 py-14 sm:px-6 lg:py-20 bg-zinc-50/80 dark:border-white/5 dark:bg-zinc-950/20">
          <div className="mx-auto max-w-7xl">
            <SectionTitle
              eyebrow="O Ecossistema Completo"
              title="Tudo que você precisa para fechar mais"
              description="Uma suíte completa: do primeiro contato com o lead até a assinatura do contrato."
            />
            <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:gap-8">
              {[
                {
                  icon: Users,
                  title: "Gestão de Leads",
                  desc: "Domine seu funil de vendas. Cada contato estruturado em um só lugar.",
                  items: ["Pipeline visual e intuitivo", "Histórico completo de interações", "Fácil conversão para Rota"],
                },
                {
                  icon: Compass,
                  title: "Rotas Digitais",
                  desc: "Diagnósticos criados com IA a partir das URLs da empresa.",
                  items: ["Mapeamento IA de Instagram/Site", "Notas de maturidade digital", "Link público para o cliente"],
                },
                {
                  icon: FileText,
                  title: "Propostas Mágicas",
                  desc: "Gere documentos comerciais matadores a partir do diagnóstico.",
                  items: ["Geração do escopo em um clique", "Visão limpa e objetiva", "Efeito 'uau' no cliente"],
                },
                {
                  icon: Building2,
                  title: "A Sua Marca Em Foco",
                  desc: "Todo material gerado reflete a autoridade da sua agência.",
                  items: ["Branding personalizado", "Customização de cores e logos", "Experiência White-label"],
                },
              ].map((item, idx) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                >
                  <BorderGlow
                    className="h-full rounded-xl bg-white dark:bg-zinc-900/40"
                    backgroundColor="var(--background)"
                    borderRadius={12}
                    glowColor="43 38 48"
                    colors={["#c4b27a", "#8e7d4d", "#e8dcc4"]}
                    glowRadius={30}
                    contentInset={1}
                    animated={true}
                  >
                    <div className="p-8">
                      <div className="flex items-start justify-between">
                        <div className="flex size-14 items-center justify-center rounded-xl border border-brand/25 bg-brand/10 dark:border-brand/35 dark:bg-brand/15">
                          <item.icon className="size-7 text-brand" aria-hidden />
                        </div>
                      </div>
                      <h3 className="mt-6 font-heading text-2xl font-bold tracking-tight">{item.title}</h3>
                      <p className="mt-3 text-base text-muted-foreground">{item.desc}</p>

                      <ul className="mt-8 space-y-3">
                        {item.items.map((line) => (
                          <li key={line} className="flex items-center gap-3 text-sm font-medium text-foreground/80">
                            <CheckCircle2 className="size-4 shrink-0 text-brand" />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </BorderGlow>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* --- Produto em Ação --- */}
        <section id="produto" className="relative z-10 scroll-mt-24 px-4 py-24 sm:px-6 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <SectionTitle
              eyebrow="Inside The App"
              title="A plataforma em ação"
              description="Navegue pelas principais verticais do ecossistema Rota Digital."
            />
            <div className="mt-16">
              <LandingProductTabs />
            </div>
          </div>
        </section>

        {/* --- Como Funciona --- */}
        <section id="como-funciona" className="relative z-10 scroll-mt-24 border-t px-4 py-24 sm:px-6 lg:py-32 bg-zinc-50/80 dark:border-white/5 dark:bg-white/[0.01]">
          <div className="mx-auto max-w-7xl">
            <SectionTitle
              eyebrow="Jornada de Sucesso"
              title="Como você fecha mais contratos"
              description="Quatro passos simples entre a prospecção e o faturamento."
            />

            <div className="mt-20">
              <div className="grid gap-0 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
                {[
                  {
                    icon: Users,
                    title: "Cadastre o Lead",
                    desc: "Adicione as URLs do site e Instagram da marca que deseja prospectar.",
                    iconBg: "bg-brand/10 text-brand dark:bg-brand/15 dark:text-brand",
                  },
                  {
                    icon: Zap,
                    title: "Gere o Diagnóstico",
                    desc: "Nossa IA analisa e pontua a maturidade digital em segundos.",
                    iconBg: "bg-brand/10 text-brand dark:bg-brand/15 dark:text-brand",
                  },
                  {
                    icon: Send,
                    title: "Encante o Cliente",
                    desc: "Envie um link público lindíssimo com o dossiê completo da marca.",
                    iconBg: "bg-brand/10 text-brand dark:bg-brand/15 dark:text-brand",
                  },
                  {
                    icon: FileText,
                    title: "Feche a Proposta",
                    desc: "Apresente o escopo final formatado e pronto para assinatura.",
                    iconBg: "bg-brand/10 text-brand dark:bg-brand/15 dark:text-brand",
                  },
                ].map((step, i, arr) => (
                  <>
                    <motion.div
                      key={step.title}
                      initial={{ opacity: 0, y: 24 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                      className="group relative flex flex-col"
                    >
                      {/* Card */}
                      <div className="relative flex h-full flex-col overflow-hidden rounded-xl border bg-white p-6 shadow-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-md dark:border-white/5 dark:bg-[#121217]/60 dark:backdrop-blur-xl dark:hover:shadow-lg">
                        {/* Brilho no topo no hover — igual à secção #visao */}
                        <div
                          className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[2px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                          aria-hidden
                        >
                          <div className="h-full bg-gradient-to-r from-transparent via-brand to-transparent" />
                          <div className="absolute left-1/2 top-full h-4 w-[85%] max-w-sm -translate-x-1/2 bg-gradient-to-b from-brand/35 to-transparent blur-md" />
                        </div>

                        {/* Step number + icon row */}
                        <div className="mb-5 flex items-center justify-between">
                          <div className={cn("flex size-11 items-center justify-center rounded-xl", step.iconBg)}>
                            <step.icon className="size-5" aria-hidden />
                          </div>
                          <span className="font-heading text-3xl font-black tabular-nums text-foreground/14 [text-shadow:0_1px_0_rgba(255,255,255,0.35)] dark:text-brand/58 dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.65)]">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                        </div>

                        {/* Content */}
                        <h4 className="font-heading text-base font-bold tracking-tight text-foreground">{step.title}</h4>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
                      </div>
                    </motion.div>

                    {/* Connector arrow between cards — hidden on mobile & after last card */}
                    {i < arr.length - 1 && (
                      <div className="hidden items-center justify-center px-2 md:flex" aria-hidden>
                        <motion.div
                          initial={{ opacity: 0, scaleX: 0 }}
                          whileInView={{ opacity: 1, scaleX: 1 }}
                          viewport={{ once: true }}
                          transition={{ delay: i * 0.12 + 0.3, duration: 0.4 }}
                          className="flex items-center gap-0"
                        >
                          <div className="h-px w-6 bg-gradient-to-r from-border to-border/60 lg:w-8 dark:from-brand/55 dark:to-brand/30" />
                          <ChevronRight className="size-3.5 -ml-1 shrink-0 text-muted-foreground/55 dark:text-brand/85 dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]" strokeWidth={2.25} aria-hidden />
                        </motion.div>
                      </div>
                    )}
                  </>
                ))}
              </div>

              {/* Bottom badge */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.6 }}
                className="mx-auto mt-14 max-w-fit"
              >
                <BorderGlow
                  className="rounded-lg border-[0.5px] bg-white dark:bg-zinc-950/20"
                  backgroundColor="var(--background)"
                  borderRadius={8}
                  glowRadius={24}
                  glowIntensity={0.62}
                  glowColor="43 38 48"
                  coneSpread={14}
                  colors={["#c4b27a", "#8e7d4d", "#e8dcc4"]}
                  fillOpacity={0.34}
                  edgeSensitivity={38}
                  contentInset={1}
                  animated={true}
                  disablePointerTracking
                  loopEntranceAnimation
                  entranceSweepDurationScale={2.05}
                  restingBorderColor="color-mix(in oklch, var(--border) 52%, transparent)"
                  mobileStarSpeed="8s"
                  mobileStarThickness={1}
                >
                  <div className="flex items-center gap-2.5 px-5 py-2.5 text-sm font-medium text-muted-foreground">
                    <Link2 className="size-4 shrink-0 text-brand" aria-hidden />
                    Links públicos protegidos com design responsivo
                  </div>
                </BorderGlow>
              </motion.div>
            </div>
          </div>
        </section>

        {/* --- Planos --- */}
        <section id="planos" className="relative z-10 scroll-mt-24 px-4 py-24 sm:px-6 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <SectionTitle
              eyebrow="Investimento"
              title="Escalabilidade para sua agência"
              description="Escolha o plano que melhor se adapta ao momento do seu negócio."
            />

            <div className="mt-12 flex justify-center px-2">
              <div
                className={cn(
                  "relative inline-flex h-[3.25rem] items-stretch rounded-full border-2 p-1 text-sm",
                  /* Trilho sólido: no escuro usa cinza médio (nunca igual ao fundo zinc-950). */
                  "border-zinc-300 bg-zinc-200/95 shadow-inner shadow-black/10",
                  "dark:border-zinc-500 dark:bg-zinc-600 dark:shadow-[inset_0_2px_10px_rgba(0,0,0,0.35)]",
                )}
                role="tablist"
                aria-label="Ciclo de cobrança dos planos"
              >
                <div className="relative flex w-full items-center gap-0.5">
                  <motion.button
                    type="button"
                    role="tab"
                    whileTap={{ scale: 0.98 }}
                    aria-selected={billingCycle === "monthly"}
                    onClick={() => setBillingCycle("monthly")}
                    className={cn(
                      "relative isolate min-w-[7.75rem] rounded-full px-5 py-2.5 text-[13px] font-bold tracking-normal transition-colors duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      billingCycle === "monthly"
                        ? "text-brand-foreground"
                        : "text-zinc-700 hover:text-zinc-950 dark:text-white dark:hover:text-white",
                    )}
                  >
                    {billingCycle === "monthly" && (
                      <motion.div
                        layoutId="active-billing"
                        aria-hidden
                        className={cn(
                          "pointer-events-none absolute inset-0 z-0 rounded-full [background-image:none]",
                          /* Fundo sólido — token --brand (ouro ID visual), contraste via --brand-foreground. */
                          "shadow-[0_4px_18px_rgba(0,0,0,0.22)] ring-2 ring-black/20 dark:shadow-[0_6px_24px_rgba(0,0,0,0.5)] dark:ring-white/25",
                        )}
                        style={{ backgroundColor: "var(--brand)" }}
                        transition={{ type: "spring", bounce: 0.22, stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">Mensal</span>
                  </motion.button>

                  <motion.button
                    type="button"
                    role="tab"
                    whileTap={{ scale: 0.98 }}
                    aria-selected={billingCycle === "yearly"}
                    onClick={() => setBillingCycle("yearly")}
                    className={cn(
                      "relative isolate flex min-w-[8rem] items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-bold tracking-normal transition-colors duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      billingCycle === "yearly"
                        ? "text-brand-foreground"
                        : "text-zinc-700 hover:text-zinc-950 dark:text-white dark:hover:text-white",
                    )}
                  >
                    {billingCycle === "yearly" && (
                      <motion.div
                        layoutId="active-billing"
                        aria-hidden
                        className={cn(
                          "pointer-events-none absolute inset-0 z-0 rounded-full [background-image:none]",
                          "shadow-[0_4px_18px_rgba(0,0,0,0.22)] ring-2 ring-black/20 dark:shadow-[0_6px_24px_rgba(0,0,0,0.5)] dark:ring-white/25",
                        )}
                        style={{ backgroundColor: "var(--brand)" }}
                        transition={{ type: "spring", bounce: 0.22, stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">Anual</span>
                    <span
                      className={cn(
                        "relative z-10 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em]",
                        billingCycle === "yearly"
                          ? "bg-white text-zinc-950 shadow-sm ring-1 ring-black/10"
                          : "bg-[#f5f0e6] text-[#3d3528] shadow-sm ring-1 ring-[#c4b27a]/55 dark:bg-zinc-950 dark:text-[#f8f0d4] dark:shadow-none dark:ring-[#e8dcc4]/90",
                      )}
                    >
                      -20%
                    </span>
                  </motion.button>
                </div>
              </div>
            </div>

            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {[
                {
                  name: "Starter",
                  price: "0",
                  description: "Grátis, com quotas mensais para validar o funil.",
                  features: [
                    "1 diagnóstico (Rota Digital) com IA.",
                    "10 prospecções de leads.",
                    "1 geração de propostas",
                    { before: "Link Público", red: "sem a sua marca" },
                  ] satisfies LandingPlanFeature[],
                  buttonText: "Começar Grátis",
                  isFeatured: false,
                },
                {
                  name: "Pro",
                  price: billingCycle === "monthly" ? "147" : "97",
                  originalPrice: billingCycle === "monthly" ? "197" : "147",
                  description: "Mais capacidade mensal para prospectação diária.",
                  features: [
                    "10 diagnósticos (Rota Digital) com IA.",
                    "300 prospecções de leads.",
                    "20 gerações de propostas",
                    { before: "Link Público", gold: "com a sua marca" },
                  ] satisfies LandingPlanFeature[],
                  buttonText: "Assinar Pro",
                  isFeatured: true,
                },
                {
                  name: "Agency",
                  price: billingCycle === "monthly" ? "497" : "397",
                  description: "Volume mensal máximo para alta demanda.",
                  features: [
                    "30 diagnósticos (Rota Digital) com IA.",
                    "1.000 prospecções de leads.",
                    "100 gerações de propostas",
                    { before: "Link Público", gold: "com a sua marca" },
                  ] satisfies LandingPlanFeature[],
                  buttonText: "Falar com Consultor",
                  isFeatured: false,
                },
              ].map((plan, i) => (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  className="flex"
                >
                  {plan.isFeatured ? (
                    <BorderGlow
                      className="flex h-full w-full flex-col rounded-xl border-none bg-white p-0 dark:bg-zinc-950/40"
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
                      <div className="flex h-full flex-col p-8">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xl font-bold">{plan.name}</h4>
                          <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand">OFERTA</span>
                        </div>
                        <div className="mt-5 flex flex-col">
                          {plan.originalPrice && (
                            <span className="text-sm font-medium text-muted-foreground/60 line-through decoration-brand decoration-2">
                              R$ {plan.originalPrice},00
                            </span>
                          )}
                          <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-black text-foreground">R$ {plan.price}</span>
                            <span className="text-sm font-medium text-muted-foreground">/{billingCycle === "monthly" ? "mês" : "mês*"}</span>
                          </div>
                          {billingCycle === "yearly" && plan.price !== "0" && (
                            <span className="mt-1 text-[10px] font-bold text-brand uppercase tracking-tight">
                              Cerca de R$ {parseInt(plan.price) * 12},00 por ano
                            </span>
                          )}
                        </div>
                        <p className="mt-4 text-pretty text-sm leading-snug text-muted-foreground">{plan.description}</p>
                        <div className="my-8 h-px bg-border" />
                        <ul className="flex-1 space-y-2.5">
                          {plan.features.map((f, idx) => (
                            <li key={`${plan.name}-${idx}`} className="flex items-start gap-2 text-sm font-normal tracking-normal">
                              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" />
                              <PlanFeatureLabel feature={f} />
                            </li>
                          ))}
                        </ul>
                        <LinkButton
                          href="/login"
                          variant="cta"
                          className="mt-10 h-12 w-full rounded-lg font-bold"
                        >
                          {plan.buttonText}
                        </LinkButton>
                      </div>
                    </BorderGlow>
                  ) : (
                    <Card className="flex h-full w-full flex-col overflow-hidden rounded-xl border-border/50 bg-white shadow-sm transition-all hover:shadow-md dark:bg-zinc-950/20">
                      <div className="flex flex-1 flex-col p-8">
                        <h4 className="text-xl font-bold">{plan.name}</h4>
                        <div className="mt-5 flex flex-col">
                          {plan.originalPrice && (
                            <span className="text-sm font-medium text-muted-foreground/60 line-through decoration-brand decoration-2">
                              R$ {plan.originalPrice},00
                            </span>
                          )}
                          <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-black text-foreground">R$ {plan.price}</span>
                            <span className="text-sm font-medium text-muted-foreground">/{billingCycle === "monthly" ? "mês" : "mês*"}</span>
                          </div>
                          {billingCycle === "yearly" && plan.price !== "0" && (
                            <span className="mt-1 text-[11px] font-medium text-muted-foreground/80">
                              *cobrado anualmente
                            </span>
                          )}
                          {billingCycle === "yearly" && plan.price === "0" && (
                            <span className="mt-1 text-[11px] font-medium text-muted-foreground/80">
                              *Gratuito para testar
                            </span>
                          )}
                        </div>
                        <p className="mt-4 text-pretty text-sm leading-snug text-muted-foreground">{plan.description}</p>
                        <div className="my-8 h-px bg-border" />
                        <ul className="flex-1 space-y-2.5">
                          {plan.features.map((f, idx) => (
                            <li key={`${plan.name}-${idx}`} className="flex items-start gap-2 text-sm font-normal tracking-normal">
                              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand/60" />
                              <PlanFeatureLabel feature={f} />
                            </li>
                          ))}
                        </ul>
                        <LinkButton
                          href="/login"
                          variant="outline"
                          className="mt-10 h-12 w-full rounded-lg font-bold"
                        >
                          {plan.buttonText}
                        </LinkButton>
                      </div>
                    </Card>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* --- FAQ --- */}
        <section id="faq" className="relative z-10 scroll-mt-24 px-4 py-24 sm:px-6 lg:py-32">
          <div className="mx-auto max-w-3xl">
            <SectionTitle
              title="Perguntas Frequentes"
              description="Tudo o que você precisa saber sobre a plataforma que está mudando as agências digitais."
            />
            <div className="mt-16 space-y-4">
              {[
                {
                  q: "Como a IA gera o diagnóstico?",
                  a: "Nossa IA acessa as URLs públicas fornecidas (site e Instagram) e realiza uma varredura completa de copy, posicionamento e canais, comparando com as melhores práticas de mercado.",
                },
                {
                  q: "Posso personalizar a proposta com minha marca?",
                  a: "Com certeza. O Rota Digital foi feito para ser white-label. Você pode carregar seu logo, definir as cores da sua agência e os dados de contato que aparecerão nos links públicos.",
                },
                {
                  q: "O cliente precisa de conta para ver o relatório?",
                  a: "Não. Os links gerados (/r/ e /p/) são públicos e otimizados para qualquer dispositivo, permitindo visualização instantânea sem fricção.",
                },
                {
                  q: "Existe limite de geração de diagnósticos?",
                  a: "Depende do seu plano. Oferecemos créditos que são consumidos a cada diagnóstico gerado pela IA, garantindo que você sempre tenha o melhor custo-benefício.",
                },
              ].map((item, idx) => (
                <motion.details
                  key={item.q}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="group rounded-xl border bg-white shadow-sm transition-all open:shadow-md dark:border-white/5 dark:bg-zinc-950/40"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 text-sm font-bold text-foreground sm:text-base">
                    <span>{item.q}</span>
                    <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary transition-transform group-open:rotate-180">
                      <ChevronRight className="size-3.5 rotate-90" />
                    </div>
                  </summary>
                  <div className="border-t px-6 py-5 text-sm leading-relaxed text-muted-foreground sm:text-base dark:border-white/5">
                    {item.a}
                  </div>
                </motion.details>
              ))}
            </div>
          </div>
        </section>

        {/* --- CTA final --- */}
        <section className="relative z-10 px-4 py-24 sm:px-6 lg:py-32">
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border-0 bg-[#121217] px-6 py-20 text-center shadow-2xl sm:px-16 dark:border dark:border-white/10">
            <div className="absolute inset-0 z-0 overflow-hidden rounded-2xl">
              <Grainient
                color1="#e8dcc4"
                color2="#8e7d4d"
                color3="#3d3528"
                timeSpeed={0.25}
                colorBalance={0}
                warpStrength={1}
                warpFrequency={5}
                warpSpeed={2}
                warpAmplitude={50}
                blendAngle={0}
                blendSoftness={0.05}
                rotationAmount={500}
                noiseScale={2}
                grainAmount={0.1}
                grainScale={2}
                grainAnimated={false}
                contrast={1.5}
                gamma={1}
                saturation={1}
                centerX={0}
                centerY={0}
                zoom={0.9}
                className="h-full min-h-full w-full"
              />
            </div>
            <div className="pointer-events-none absolute inset-0 z-[1] rounded-2xl bg-gradient-to-b from-[#121217]/58 via-[#121217]/16 to-[#121217]/48" />

            <div className="relative z-10 mx-auto max-w-2xl">
              <h2 className="font-heading text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
                Pronto para escalar os resultados da sua agência?
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-zinc-100/95 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                Pare de perder tempo com propostas em PDF. Impressione seus clientes desde o primeiro diagnóstico.
              </p>

              <div className="mt-10 flex justify-center">
                <Link
                  href="/login"
                  className={cn(
                    "inline-flex h-14 min-h-14 items-center justify-center gap-2 rounded-md px-10 text-base font-bold",
                    "border border-white/14 bg-gradient-to-b from-white/[0.11] to-white/[0.04]",
                    "text-white",
                    "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]",
                    "backdrop-blur-xl backdrop-saturate-150",
                    "transition-[color,border-color,background-image] duration-300 ease-out",
                    "hover:border-white/22 hover:from-white/[0.14] hover:to-white/[0.05] hover:text-white",
                    "active:scale-[0.99]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121217]",
                  )}
                >
                  Criar Minha Conta Grátis
                  <ArrowRight className="size-5 shrink-0" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t bg-zinc-50 px-4 py-8 sm:px-6 dark:border-white/5 dark:bg-background">
        <div className="mx-auto max-w-7xl space-y-4 text-center sm:flex sm:items-center sm:justify-between sm:space-y-0 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Rota Digital SaaS. Todos os direitos reservados.</p>
          <p className="flex justify-center gap-1">Feito com ⚡️ no Brasil</p>
        </div>
      </footer>
    </div>
  );
}
