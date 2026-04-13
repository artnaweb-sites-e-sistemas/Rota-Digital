"use client";

import { useEffect, useState } from "react";
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
  /** Só favicon Google (listagens); hero do relatório e OG seguem iguais. */
  faviconOnly?: boolean;
};

/** Favicon/logo do site do relatório; se falhar ao carregar ou não houver URL, mostra ícone de prédio. */
export function ReportSiteAvatar({ report, size = "md", className, faviconOnly }: Props) {
  const [broken, setBroken] = useState(false);
  const src = getReportSiteIconSrc(report, { faviconOnly });
  const showImg = Boolean(src) && !broken;

  useEffect(() => {
    setBroken(false);
  }, [report.id, src]);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md",
        BOX[size],
        !showImg && "bg-brand/15 text-brand dark:text-brand",
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
