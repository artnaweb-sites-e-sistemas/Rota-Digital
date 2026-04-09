"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RotaDigitalReport } from "@/types/report";
import { getReportSiteIconSrc } from "@/lib/report-brand";

type Size = "sm" | "md";

const BOX: Record<Size, string> = {
  sm: "size-8",
  md: "size-9",
};

const ICON: Record<Size, string> = {
  sm: "size-3.5",
  md: "size-4",
};

type Props = {
  report: RotaDigitalReport;
  size?: Size;
  className?: string;
};

/** Favicon/logo do site do relatório; se falhar ao carregar ou não houver URL, mostra ícone de prédio. */
export function ReportSiteAvatar({ report, size = "md", className }: Props) {
  const [broken, setBroken] = useState(false);
  const src = getReportSiteIconSrc(report);
  const showImg = Boolean(src) && !broken;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md",
        BOX[size],
        !showImg && "bg-violet-500/15 text-violet-600 dark:text-violet-400",
        className,
        showImg && "bg-white p-1 dark:bg-zinc-100",
      )}
    >
      {showImg ? (
        <img
          src={src}
          alt=""
          className="size-full object-contain"
          onError={() => setBroken(true)}
        />
      ) : (
        <Building2 className={cn(ICON[size], "shrink-0")} aria-hidden />
      )}
    </div>
  );
}
