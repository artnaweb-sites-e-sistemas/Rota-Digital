"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { VariantProps } from "class-variance-authority";

import { useAuth } from "@/lib/auth-context";
import { PlanLimitModal, type PlanLimitModalState } from "@/components/limits/plan-limit-modal";
import { normalizedSubscriptionPlanKey, type PlanKey } from "@/lib/plan-quotas";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

type UserQuotaPayload = {
  plan: string;
  rotas: { limit: number; used: number; isUnlimited: boolean; atLimit: boolean };
  propostas: { limit: number; used: number; isUnlimited: boolean; atLimit: boolean };
};

type QuotaKind = "rotas" | "propostas";

type LinkHref = ComponentProps<typeof Link>["href"];

function linkHrefToString(href: LinkHref): string {
  if (typeof href === "string") return href;
  if (href == null || typeof href !== "object") return "/";
  const o = href as {
    pathname?: string | null;
    query?: Record<string, string | string[] | undefined>;
    search?: string | null;
    hash?: string | null;
  };
  const pathname = o.pathname ?? "";
  if (typeof o.search === "string" && o.search.length > 0) {
    return `${pathname}${o.search}${o.hash ?? ""}`;
  }
  if (o.query && typeof o.query === "object") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(o.query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) params.append(key, String(item));
      } else {
        params.append(key, String(value));
      }
    }
    const q = params.toString();
    return `${pathname}${q ? `?${q}` : ""}${o.hash ?? ""}`;
  }
  return `${pathname}${o.hash ?? ""}`;
}

type QuotaGateContextValue = {
  openQuotaGate: (href: LinkHref, kind: QuotaKind) => Promise<void>;
  checking: boolean;
};

const QuotaGateContext = createContext<QuotaGateContextValue | null>(null);

export function QuotaGateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const [limitModalState, setLimitModalState] = useState<PlanLimitModalState | null>(null);
  const [checking, setChecking] = useState(false);

  const openQuotaGate = useCallback(
    async (hrefInput: LinkHref, kind: QuotaKind) => {
      const href = linkHrefToString(hrefInput);
      if (!user) return;
      setChecking(true);
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/user-quota", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) {
          router.push(href);
          return;
        }
        const data = (await res.json()) as UserQuotaPayload;
        const atLimit = kind === "rotas" ? data.rotas.atLimit : data.propostas.atLimit;
        if (atLimit) {
          const plan: PlanKey = normalizedSubscriptionPlanKey(data.plan);
          setLimitModalState({
            kind,
            plan,
            monthlyLimit: kind === "rotas" ? data.rotas.limit : data.propostas.limit,
            usedThisMonth: kind === "rotas" ? data.rotas.used : data.propostas.used,
          });
          return;
        }
        router.push(href);
      } catch {
        router.push(href);
      } finally {
        setChecking(false);
      }
    },
    [user, router],
  );

  const value = useMemo(() => ({ openQuotaGate, checking }), [openQuotaGate, checking]);

  return (
    <QuotaGateContext.Provider value={value}>
      {children}
      <PlanLimitModal
        state={limitModalState}
        onClose={() => setLimitModalState(null)}
        getIdToken={user ? () => user.getIdToken() : undefined}
      />
    </QuotaGateContext.Provider>
  );
}

export function useQuotaGateOptional(): QuotaGateContextValue | null {
  return useContext(QuotaGateContext);
}

type QuotaGuardLinkProps = Omit<ComponentProps<typeof Link>, "onClick"> & {
  quotaKind: QuotaKind;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
};

/**
 * Link que, no dashboard (com `QuotaGateProvider`), consulta a cota antes de navegar
 * e abre o `PlanLimitModal` se o limite estiver esgotado.
 */
export function QuotaGuardLink({
  href,
  quotaKind,
  className,
  children,
  onClick,
  variant,
  size,
  ...linkProps
}: QuotaGuardLinkProps) {
  const ctx = useContext(QuotaGateContext);
  const buttonStyle =
    variant != null ? buttonVariants({ variant, size: size ?? "lg" }) : undefined;

  if (!ctx) {
    return (
      <Link href={href} className={cn(buttonStyle, className)} onClick={onClick} {...linkProps}>
        {children}
      </Link>
    );
  }

  const { openQuotaGate, checking } = ctx;

  return (
    <Link
      href={href}
      className={cn(buttonStyle, className, checking && "pointer-events-none opacity-70")}
      onClick={(e) => {
        onClick?.(e);
        e.preventDefault();
        void openQuotaGate(href, quotaKind);
      }}
      aria-busy={checking}
      {...linkProps}
    >
      {children}
    </Link>
  );
}
