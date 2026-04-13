"use client";

/**
 * Animação de troca de tema no estilo `react-native-theme-switch-animation` (fade / circular).
 *
 * **Circular:** quando o browser suporta View Transitions (`document.startViewTransition`),
 * usa capturas reais do ecrã (old/new `root`) — fora do círculo continua a ver a UI antiga,
 * não uma cor sólida. Caso contrário, cai no overlay com `--background` (menos fiel).
 */

import { flushSync } from "react-dom";

export type ThemeSwitchAnimationConfig =
  | { type: "fade"; duration: number }
  | { type: "circular"; duration: number; startingPoint: { cx: number; cy: number } };

export type SwitchThemeOptions = {
  switchThemeFunction: () => void;
  animationConfig: ThemeSwitchAnimationConfig;
  /** Se true, ignora animação (ex.: `prefers-reduced-motion`). */
  disableAnimation?: boolean;
};

/** Duração alinhada ao exemplo do `react-native-theme-switch-animation` (900 ms). */
export const THEME_SWITCH_CIRCULAR_DURATION_MS = 900;
export const THEME_SWITCH_FADE_DURATION_MS = 900;

/** Centro do alvo (equivalente a `measure` + metade da largura/altura no RN). */
export function themeSwitchCircularOrigin(element: Element): { cx: number; cy: number } {
  const r = element.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

/** Centro do ecrã (reveal automático ao carregar, ex. relatório público). */
export function themeSwitchViewportCenter(): { cx: number; cy: number } {
  if (typeof window === "undefined") return { cx: 0, cy: 0 };
  return { cx: window.innerWidth / 2, cy: window.innerHeight / 2 };
}

type ViewTransitionHandle = { finished: Promise<void> };

function getStartViewTransition(): ((cb: () => void | Promise<void>) => ViewTransitionHandle) | undefined {
  if (typeof document === "undefined") return undefined;
  const d = document as Document & { startViewTransition?: (cb: () => void | Promise<void>) => ViewTransitionHandle };
  return typeof d.startViewTransition === "function" ? d.startViewTransition.bind(document) : undefined;
}

/** Garante que o React aplica o tema antes do browser capturar o estado “new”. */
function runSwitchSynchronously(switchThemeFunction: () => void) {
  try {
    flushSync(() => {
      switchThemeFunction();
    });
  } catch {
    switchThemeFunction();
  }
}

function cleanupThemeSwitchVtVars() {
  const html = document.documentElement;
  html.removeAttribute("data-theme-switch-vt");
  html.style.removeProperty("--theme-switch-vt-cx");
  html.style.removeProperty("--theme-switch-vt-cy");
  html.style.removeProperty("--theme-switch-vt-duration");
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Cor de fundo atual do `:root` (token `--background`). */
function captureRootBackgroundColor(): string {
  const root = document.documentElement;
  const raw = getComputedStyle(root).getPropertyValue("--background").trim();
  if (raw) return raw;
  const bg = getComputedStyle(root).backgroundColor;
  return bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)" ? bg : "#fafafa";
}

function maxRevealRadiusPx(cx: number, cy: number): number {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const corners: [number, number][] = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ];
  let max = 0;
  for (const [x, y] of corners) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > max) max = d;
  }
  return max * 1.08;
}

/** Desaceleração mais suave no fim (máscara / opacidade no fallback). */
function easeOutQuint(t: number): number {
  return 1 - (1 - t) ** 5;
}

function removeNode(el: HTMLElement | null) {
  if (el?.parentNode) el.parentNode.removeChild(el);
}

/**
 * Igual à ideia do pacote RN: corre `switchThemeFunction` com overlay (fade ou circular).
 */
export default function switchTheme(options: SwitchThemeOptions): void {
  const { switchThemeFunction, animationConfig, disableAnimation } = options;

  if (disableAnimation || prefersReducedMotion() || typeof document === "undefined") {
    switchThemeFunction();
    return;
  }

  const startVt = getStartViewTransition();

  if (animationConfig.type === "circular" && startVt) {
    const html = document.documentElement;
    const { cx, cy } = animationConfig.startingPoint;
    const duration = Math.max(120, animationConfig.duration);
    html.style.setProperty("--theme-switch-vt-cx", `${cx}px`);
    html.style.setProperty("--theme-switch-vt-cy", `${cy}px`);
    html.style.setProperty("--theme-switch-vt-duration", `${duration}ms`);
    html.setAttribute("data-theme-switch-vt", "circular");

    const vt = startVt(() => {
      runSwitchSynchronously(switchThemeFunction);
    });

    void vt.finished.finally(() => {
      cleanupThemeSwitchVtVars();
    });
    return;
  }

  if (animationConfig.type === "fade" && startVt) {
    const html = document.documentElement;
    const duration = Math.max(120, animationConfig.duration);
    html.style.setProperty("--theme-switch-vt-duration", `${duration}ms`);
    html.setAttribute("data-theme-switch-vt", "fade");
    const vt = startVt(() => {
      runSwitchSynchronously(switchThemeFunction);
    });
    void vt.finished.finally(() => {
      cleanupThemeSwitchVtVars();
    });
    return;
  }

  const oldBg = captureRootBackgroundColor();
  const overlay = document.createElement("div");
  overlay.setAttribute("data-theme-switch-overlay", "");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483000",
    "pointer-events:auto",
    `background-color:${oldBg}`,
    "will-change:opacity,mask-image,-webkit-mask-image",
  ].join(";");

  document.body.appendChild(overlay);

  const duration = Math.max(120, animationConfig.duration);
  const runSwitch = () => {
    try {
      switchThemeFunction();
    } catch (e) {
      console.error(e);
    }
  };

  const finish = () => {
    removeNode(overlay);
  };

  const startSwitch = () => {
    requestAnimationFrame(() => {
      if (animationConfig.type === "fade") {
        runSwitch();
        overlay.style.opacity = "1";
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const o = 1 - easeOutQuint(t);
          overlay.style.opacity = String(o);
          if (t < 1) {
            requestAnimationFrame(tick);
          } else {
            finish();
          }
        };
        requestAnimationFrame(tick);
        return;
      }

      runSwitch();

      const { cx, cy } = animationConfig.startingPoint;
      const maxR = maxRevealRadiusPx(cx, cy);
      const minHolePx = 0.35;
      const maskAt = (r: number) =>
        `radial-gradient(circle at ${cx}px ${cy}px, transparent ${r}px, #fff ${r + 0.75}px)`;
      overlay.style.webkitMaskImage = maskAt(minHolePx);
      overlay.style.maskImage = maskAt(minHolePx);

      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const r = Math.max(minHolePx, easeOutQuint(t) * maxR);
        const mask = maskAt(r);
        overlay.style.webkitMaskImage = mask;
        overlay.style.maskImage = mask;
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          overlay.style.webkitMaskImage = "";
          overlay.style.maskImage = "";
          finish();
        }
      };
      requestAnimationFrame(tick);
    });
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(startSwitch);
  });
}

export { switchTheme };
