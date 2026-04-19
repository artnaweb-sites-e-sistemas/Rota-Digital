"use client";

import { useTheme } from "next-themes";
import React, { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface GlassSurfaceProps {
  children?: React.ReactNode;
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  borderWidth?: number;
  brightness?: number;
  opacity?: number;
  blur?: number;
  displace?: number;
  backgroundOpacity?: number;
  saturation?: number;
  distortionScale?: number;
  redOffset?: number;
  greenOffset?: number;
  blueOffset?: number;
  xChannel?: "R" | "G" | "B";
  yChannel?: "R" | "G" | "B";
  mixBlendMode?:
    | "normal"
    | "multiply"
    | "screen"
    | "overlay"
    | "darken"
    | "lighten"
    | "color-dodge"
    | "color-burn"
    | "hard-light"
    | "soft-light"
    | "difference"
    | "exclusion"
    | "hue"
    | "saturation"
    | "color"
    | "luminosity"
    | "plus-darker"
    | "plus-lighter";
  className?: string;
  innerClassName?: string;
  style?: React.CSSProperties;
  /**
   * Contorno / halo nas arestas.
   * `subtle` = borda e sombra bem leves + deslocamento cromático discreto.
   */
  edge?: "none" | "subtle" | "full";
}

function supportsSVGFilters(filterId: string) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  const isWebkit = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
  const isFirefox = /Firefox/.test(navigator.userAgent);

  if (isWebkit || isFirefox) {
    return false;
  }

  const div = document.createElement("div");
  div.style.backdropFilter = `url(#${filterId})`;

  return div.style.backdropFilter !== "";
}

function supportsBackdropFilter() {
  if (typeof window === "undefined") return false;
  return CSS.supports("backdrop-filter", "blur(10px)");
}

const GlassSurface: React.FC<GlassSurfaceProps> = ({
  children,
  width = 200,
  height = 80,
  borderRadius = 20,
  borderWidth = 0.07,
  brightness = 50,
  opacity = 0.93,
  blur = 11,
  displace = 0,
  backgroundOpacity = 0,
  saturation = 1,
  distortionScale = -180,
  redOffset = 0,
  greenOffset = 10,
  blueOffset = 20,
  xChannel = "R",
  yChannel = "G",
  mixBlendMode = "difference",
  className = "",
  innerClassName,
  style = {},
  edge = "full",
}) => {
  const uniqueId = useId().replace(/:/g, "-");
  const filterId = `glass-filter-${uniqueId}`;
  const redGradId = `red-grad-${uniqueId}`;
  const blueGradId = `blue-grad-${uniqueId}`;

  const [svgSupported, setSvgSupported] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const feImageRef = useRef<SVGFEImageElement>(null);
  const redChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const greenChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const blueChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const gaussianBlurRef = useRef<SVGFEGaussianBlurElement>(null);

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Use dark mode as the default during SSR to prevent bright/gray flashing on the dark landing page
  const isDarkMode = !mounted ? true : resolvedTheme === "dark";
  const generateDisplacementMap = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    const actualWidth = rect?.width || 400;
    const actualHeight = rect?.height || 200;
    const bw =
      edge === "none" ? 0 : edge === "subtle" ? borderWidth * 0.32 : borderWidth;
    const edgeSize = Math.min(actualWidth, actualHeight) * (bw * 0.5);
    const chromatic = edge !== "none";

    const svgContent = !chromatic
      ? `
      <svg viewBox="0 0 ${actualWidth} ${actualHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" fill="black"></rect>
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${borderRadius}" fill="hsl(0 0% ${brightness}% / ${opacity})" style="filter:blur(${blur}px)" />
      </svg>
    `
      : `
      <svg viewBox="0 0 ${actualWidth} ${actualHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="red"/>
          </linearGradient>
          <linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="blue"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" fill="black"></rect>
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${borderRadius}" fill="url(#${redGradId})" />
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${borderRadius}" fill="url(#${blueGradId})" style="mix-blend-mode: ${mixBlendMode}" />
        <rect x="${edgeSize}" y="${edgeSize}" width="${actualWidth - edgeSize * 2}" height="${actualHeight - edgeSize * 2}" rx="${borderRadius}" fill="hsl(0 0% ${brightness}% / ${opacity})" style="filter:blur(${blur}px)" />
      </svg>
    `;

    return `data:image/svg+xml,${encodeURIComponent(svgContent)}`;
  };

  const updateDisplacementMap = () => {
    feImageRef.current?.setAttribute("href", generateDisplacementMap());
  };

  useEffect(() => {
    updateDisplacementMap();
    [
      { ref: redChannelRef, offset: redOffset },
      { ref: greenChannelRef, offset: greenOffset },
      { ref: blueChannelRef, offset: blueOffset },
    ].forEach(({ ref, offset }) => {
      if (ref.current) {
        const scaleMul = edge === "subtle" ? 0.5 : 1;
        ref.current.setAttribute("scale", ((distortionScale + offset) * scaleMul).toString());
        ref.current.setAttribute("xChannelSelector", xChannel);
        ref.current.setAttribute("yChannelSelector", yChannel);
      }
    });

    gaussianBlurRef.current?.setAttribute("stdDeviation", displace.toString());
  }, [
    width,
    height,
    borderRadius,
    borderWidth,
    brightness,
    opacity,
    blur,
    displace,
    distortionScale,
    redOffset,
    greenOffset,
    blueOffset,
    xChannel,
    yChannel,
    mixBlendMode,
    redGradId,
    blueGradId,
    edge,
  ]);

  useEffect(() => {
    setSvgSupported(supportsSVGFilters(filterId));
  }, [filterId]);

  useEffect(() => {
    if (!containerRef.current) return;

    const ro = new ResizeObserver(() => {
      setTimeout(updateDisplacementMap, 0);
    });

    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setTimeout(updateDisplacementMap, 0);
  }, [width, height]);

  const getContainerStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      ...style,
      width: typeof width === "number" ? `${width}px` : width,
      height: typeof height === "number" ? `${height}px` : height,
      borderRadius: `${borderRadius}px`,
      "--glass-frost": backgroundOpacity,
      "--glass-saturation": saturation,
    } as React.CSSProperties;

    const backdropFilterSupported = supportsBackdropFilter();

    const edgeStylesSvg = (): Pick<React.CSSProperties, "boxShadow" | "border"> => {
      if (edge === "none") {
        return { boxShadow: "none", border: "none" };
      }
      if (edge === "subtle") {
        return isDarkMode
          ? {
              border: "1px solid rgba(255, 255, 255, 0.07)",
              boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 1px 3px rgba(0, 0, 0, 0.12)`,
            }
          : {
              border: "1px solid rgba(0, 0, 0, 0.06)",
              boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.55), 0 1px 2px rgba(0, 0, 0, 0.04)`,
            };
      }
      return {
        boxShadow: isDarkMode
          ? `0 0 2px 1px color-mix(in oklch, white, transparent 65%) inset,
             0 0 10px 4px color-mix(in oklch, white, transparent 85%) inset,
             0px 4px 16px rgba(17, 17, 26, 0.05),
             0px 8px 24px rgba(17, 17, 26, 0.05),
             0px 16px 56px rgba(17, 17, 26, 0.05),
             0px 4px 16px rgba(17, 17, 26, 0.05) inset,
             0px 8px 24px rgba(17, 17, 26, 0.05) inset,
             0px 16px 56px rgba(17, 17, 26, 0.05) inset`
          : `0 0 2px 1px color-mix(in oklch, black, transparent 85%) inset,
             0 0 10px 4px color-mix(in oklch, black, transparent 90%) inset,
             0px 4px 16px rgba(17, 17, 26, 0.05),
             0px 8px 24px rgba(17, 17, 26, 0.05),
             0px 16px 56px rgba(17, 17, 26, 0.05),
             0px 4px 16px rgba(17, 17, 26, 0.05) inset,
             0px 8px 24px rgba(17, 17, 26, 0.05) inset,
             0px 16px 56px rgba(17, 17, 26, 0.05) inset`,
        border: "none",
      };
    };

    if (svgSupported) {
      return {
        ...baseStyles,
        background: isDarkMode
          ? `hsl(0 0% 0% / ${backgroundOpacity})`
          : `hsl(0 0% 100% / ${backgroundOpacity})`,
        backdropFilter: `url(#${filterId}) saturate(${saturation})`,
        ...edgeStylesSvg(),
      };
    }

    const edgeStylesFallbackDark = (): Pick<React.CSSProperties, "boxShadow" | "border"> => {
      if (edge === "none") return { border: "none", boxShadow: "none" };
      if (edge === "subtle") {
        return {
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.06)`,
        };
      }
      return {
        border: "1px solid rgba(255, 255, 255, 0.2)",
        boxShadow: `inset 0 1px 0 0 rgba(255, 255, 255, 0.2),
                    inset 0 -1px 0 0 rgba(255, 255, 255, 0.1)`,
      };
    };

    const edgeStylesFallbackLight = (): Pick<React.CSSProperties, "boxShadow" | "border"> => {
      if (edge === "none") return { border: "none", boxShadow: "none" };
      if (edge === "subtle") {
        return {
          border: "1px solid rgba(0, 0, 0, 0.07)",
          boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.55)`,
        };
      }
      return {
        border: "1px solid rgba(255, 255, 255, 0.3)",
        boxShadow: `inset 0 1px 0 0 rgba(255, 255, 255, 0.5),
                    inset 0 -1px 0 0 rgba(255, 255, 255, 0.3)`,
      };
    };

    if (isDarkMode) {
      if (!backdropFilterSupported) {
        return {
          ...baseStyles,
          background: "rgba(0, 0, 0, 0.4)",
          ...edgeStylesFallbackDark(),
        };
      }
      return {
        ...baseStyles,
        background: "rgba(255, 255, 255, 0.1)",
        backdropFilter: "blur(12px) saturate(1.8) brightness(1.2)",
        WebkitBackdropFilter: "blur(12px) saturate(1.8) brightness(1.2)",
        ...edgeStylesFallbackDark(),
      };
    }

    if (!backdropFilterSupported) {
      return {
        ...baseStyles,
        background: "rgba(255, 255, 255, 0.4)",
        ...edgeStylesFallbackLight(),
      };
    }
    return {
      ...baseStyles,
      background: "rgba(255, 255, 255, 0.25)",
      backdropFilter: "blur(12px) saturate(1.8) brightness(1.1)",
      WebkitBackdropFilter: "blur(12px) saturate(1.8) brightness(1.1)",
      ...(edge === "none"
        ? { border: "none", boxShadow: "none" }
        : edge === "subtle"
          ? {
              border: "1px solid rgba(0, 0, 0, 0.07)",
              boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.45)`,
            }
          : {
              border: "1px solid rgba(255, 255, 255, 0.3)",
              boxShadow: `0 8px 32px 0 rgba(31, 38, 135, 0.2),
                  0 2px 16px 0 rgba(31, 38, 135, 0.1),
                  inset 0 1px 0 0 rgba(255, 255, 255, 0.4),
                  inset 0 -1px 0 0 rgba(255, 255, 255, 0.2)`,
            }),
    };
  };

  const focusVisibleClasses = isDarkMode
    ? "focus-visible:outline-2 focus-visible:outline-[#0A84FF] focus-visible:outline-offset-2"
    : "focus-visible:outline-2 focus-visible:outline-[#007AFF] focus-visible:outline-offset-2";

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex items-center justify-center overflow-hidden transition-opacity duration-[260ms] ease-out",
        focusVisibleClasses,
        className,
      )}
      style={getContainerStyles()}
    >
      <svg
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-0"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
            <feImage ref={feImageRef} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />

            <feDisplacementMap ref={redChannelRef} in="SourceGraphic" in2="map" result="dispRed" />
            <feColorMatrix
              in="dispRed"
              type="matrix"
              values="1 0 0 0 0
                      0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 1 0"
              result="red"
            />

            <feDisplacementMap ref={greenChannelRef} in="SourceGraphic" in2="map" result="dispGreen" />
            <feColorMatrix
              in="dispGreen"
              type="matrix"
              values="0 0 0 0 0
                      0 1 0 0 0
                      0 0 0 0 0
                      0 0 0 1 0"
              result="green"
            />

            <feDisplacementMap ref={blueChannelRef} in="SourceGraphic" in2="map" result="dispBlue" />
            <feColorMatrix
              in="dispBlue"
              type="matrix"
              values="0 0 0 0 0
                      0 0 0 0 0
                      0 0 1 0 0
                      0 0 0 1 0"
              result="blue"
            />

            <feBlend in="red" in2="green" mode="screen" result="rg" />
            <feBlend in="rg" in2="blue" mode="screen" result="output" />
            <feGaussianBlur ref={gaussianBlurRef} in="output" stdDeviation="0.7" />
          </filter>
        </defs>
      </svg>

      <div
        className={cn(
          "relative z-10 flex h-full w-full items-center justify-center rounded-[inherit] p-2",
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
};

export default GlassSurface;
