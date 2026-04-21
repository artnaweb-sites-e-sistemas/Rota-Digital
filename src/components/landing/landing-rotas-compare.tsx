"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";

type LandingRotasCompareProps = {
  className?: string;
  /** Camada inferior (ex.: modo claro à direita). */
  imageBottomSrc: string;
  /** Camada superior com clip à esquerda do handle (ex.: modo escuro à esquerda). */
  imageTopSrc: string;
  bottomAlt: string;
  topAlt: string;
};

/**
 * Comparador estilo “antes e depois”: arraste a barra vertical para revelar cada captura.
 * Duas camadas com object-cover ancoradas no topo; a de cima usa clip-path na horizontal.
 */
export function LandingRotasCompare({
  className,
  imageBottomSrc,
  imageTopSrc,
  bottomAlt,
  topAlt,
}: LandingRotasCompareProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(50);
  const [dragging, setDragging] = useState(false);

  const setFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - r.left, 0), r.width);
    setPct(r.width > 0 ? (x / r.width) * 100 : 50);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => setFromClientX(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, setFromClientX]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
    setFromClientX(e.clientX);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") setPct((p) => Math.max(0, p - 2));
    if (e.key === "ArrowRight") setPct((p) => Math.min(100, p + 2));
  };

  return (
    <div
      role="presentation"
      className={cn(
        "relative w-full select-none",
        /* 16/9 em vez de 16/10: caixa mais baixa (~mesma largura, ~10% menos altura), alinhado a mockups 16:9. */
        "aspect-video",
        className,
      )}
    >
      {/*
        pointer-events-none no track: arraste só no handle (botão + faixa vertical).
        Sem isto, o pointerdown na área da imagem iniciava o arraste.
      */}
      <div
        ref={trackRef}
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-t-xl rounded-b-none"
      >
        {/* object-cover + top: preenche o retângulo e corta a parte de baixo; as duas camadas alinhadas. */}
        <Image
          src={imageBottomSrc}
          alt={bottomAlt}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="pointer-events-none object-cover object-top"
          priority={false}
        />
        <Image
          src={imageTopSrc}
          alt={topAlt}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="pointer-events-none object-cover object-top"
          style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
          priority={false}
        />

        {/* Faixa vertical (handle + linha): único sítio que inicia arraste; `pointer-events-auto` vence o `none` do pai. */}
        <button
          type="button"
          aria-label="Arrastar para comparar modo claro e escuro"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          role="slider"
          className="pointer-events-auto absolute top-0 bottom-0 z-10 flex w-10 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          style={{ left: `${pct}%` }}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
        >
          <span className="flex h-12 w-8 items-center justify-center rounded-full border border-border bg-background/95 shadow-md backdrop-blur-sm dark:bg-zinc-900/95">
            <GripVertical className="size-5 text-brand" aria-hidden />
          </span>
        </button>
      </div>
    </div>
  );
}
