/**
 * Animação circular de troca de tema (equivalente web ao padrão “circular” do RN).
 * Usa `clip-path` sobre um overlay com o fundo do tema de destino — sem Playwright / sem pacote nativo.
 */

/** Alinhado a `globals.css` (:root / .dark) — fundo principal de cada modo. */
const LIGHT_BACKGROUND = "oklch(0.985 0.004 85)";
const DARK_BACKGROUND = "oklch(0.145 0.006 85)";

const DURATION_MS = 900;

export type ThemeSwitchTarget = "light" | "dark";

function overlayBackgroundForTarget(target: ThemeSwitchTarget): string {
  return target === "dark" ? DARK_BACKGROUND : LIGHT_BACKGROUND;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function circleRadiusToCoverViewport(cx: number, cy: number): number {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) + 12;
}

/**
 * @param originEl Elemento onde começa o círculo (ex.: botão do sol/lua).
 * @param target Tema **após** a animação (`light` ou `dark`).
 * @param applyTheme Deve chamar `setTheme(...)` do next-themes (ou equivalente).
 * @returns Promise que resolve quando o tema foi aplicado (imediatamente se sem animação).
 */
export function switchThemeWithCircularReveal(
  originEl: HTMLElement | null,
  target: ThemeSwitchTarget,
  applyTheme: () => void,
): Promise<void> {
  if (typeof document === "undefined") {
    applyTheme();
    return Promise.resolve();
  }

  if (prefersReducedMotion() || !originEl) {
    applyTheme();
    return Promise.resolve();
  }

  const rect = originEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const r = circleRadiusToCoverViewport(cx, cy);
  const bg = overlayBackgroundForTarget(target);

  const overlay = document.createElement("div");
  overlay.setAttribute("data-rota-theme-switch-overlay", "");
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483646",
    "pointer-events:none",
    `background:${bg}`,
    `clip-path:circle(0px at ${cx}px ${cy}px)`,
    "will-change:clip-path",
  ].join(";");

  document.documentElement.appendChild(overlay);
  void overlay.offsetHeight;

  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      overlay.removeEventListener("transitionend", onTransitionEnd);
      window.clearTimeout(safetyTimer);
      applyTheme();
      overlay.remove();
      resolve();
    };

    const onTransitionEnd = (ev: TransitionEvent) => {
      if (ev.target !== overlay || ev.propertyName !== "clip-path") return;
      finish();
    };

    overlay.addEventListener("transitionend", onTransitionEnd);
    const safetyTimer = window.setTimeout(finish, DURATION_MS + 200);

    requestAnimationFrame(() => {
      overlay.style.transition = `clip-path ${DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      overlay.style.clipPath = `circle(${r}px at ${cx}px ${cy}px)`;
    });
  });
}
