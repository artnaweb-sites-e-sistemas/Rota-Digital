"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PUBLIC_REPORT_THEME_TOGGLE_ID } from "@/lib/theme-switch-animation";
import { cn } from "@/lib/utils";

const VISIBLE_MS = 6000;
const EXIT_MS = 400;

/**
 * Tooltip flutuante (overlay) que aparece sobre o botão de tema na página compartilhada.
 * Design refinado: fundo branco puro, sombra profunda, animação de entrada elástica
 * e pulso sutil enquanto visível. Não empurra o layout (absolute/fixed).
 */
export function PublicThemeToggleHint() {
  const [phase, setPhase] = useState<"hidden" | "enter" | "visible" | "exit">("hidden");
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePosition = useCallback(() => {
    const btn = document.getElementById(PUBLIC_REPORT_THEME_TOGGLE_ID);
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    // Posiciona à esquerda do botão, centralizado verticalmente
    setCoords({
      top: rect.top + rect.height / 2,
      right: window.innerWidth - rect.left + 12, // 12px de gap
    });
  }, []);

  const dismiss = useCallback(() => {
    if (phase === "exit" || phase === "hidden") return;
    setPhase("exit");
    removeTimerRef.current = setTimeout(() => {
      setPhase("hidden");
    }, EXIT_MS);
  }, [phase]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Pequeno delay para garantir que o layout estabilizou
    const startTimer = setTimeout(() => {
      updatePosition();
      setPhase("enter");
      requestAnimationFrame(() => setPhase("visible"));
      exitTimerRef.current = setTimeout(() => dismiss(), VISIBLE_MS);
    }, 800);

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      clearTimeout(startTimer);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
    };
  }, [dismiss, updatePosition]);

  // Fecha se clicar no botão ou em qualquer lugar
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      dismiss();
    };
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [dismiss]);

  if (phase === "hidden" || !coords) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed z-[100] pointer-events-none",
        "flex items-center justify-end",
        phase === "enter" && "opacity-0 scale-90 translate-x-4",
        phase === "visible" && [
          "opacity-100 scale-100 translate-x-0",
          "transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
          "animate-hint-float"
        ],
        phase === "exit" && "opacity-0 scale-95 -translate-y-2 transition-all duration-400 ease-in",
      )}
      style={{
        top: coords.top,
        right: coords.right,
        transformOrigin: "right center",
        marginTop: "-20px", // Metade da altura aproximada para centralizar no eixo Y
      }}
    >
      <div className="relative">
        {/* Corpo do Tooltip */}
        <div className={cn(
          "bg-white text-zinc-900 px-4 py-2.5 rounded-2xl border border-zinc-200/50",
          "shadow-[0_20px_50px_rgba(0,0,0,0.3),0_0_0_1px_rgba(0,0,0,0.05)]",
          "flex items-center gap-2 min-w-[160px] whitespace-nowrap"
        )}>
          <span className="flex h-2 w-2 rounded-full bg-brand animate-pulse" />
          <p className="text-[13px] font-bold tracking-tight antialiased">
            Modo Claro? Clique aqui
          </p>
        </div>

        {/* Seta (Arrow) */}
        <div className={cn(
          "absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rotate-45",
          "bg-white border-r border-t border-zinc-200/50 shadow-[2px_-2px_5px_rgba(0,0,0,0.05)]"
        )} />
      </div>

      <style jsx global>{`
        @keyframes hint-float {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-6px); }
        }
        .animate-hint-float {
          animation: hint-float 2.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
