"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Compass,
  CreditCard,
  FileText,
  LayoutDashboard,
  Users,
  UserCog,
  Settings,
  LogOut,
  SlidersHorizontal,
  Building2,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { isGeneralAdminEmail } from "@/lib/general-admin";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { parseUserSettingsDocForDashboard } from "@/lib/user-settings";
import {
  planBadgeVisualClasses,
  sidebarPlanBadgeLabel,
  type SidebarBillingPlan,
} from "@/lib/billing-plan-label";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import type { UserCompanyAboutSettings } from "@/types/user-settings";
import {
  resolveCompanyAboutNameForDisplay,
  resolveCompanyPrimaryImageForDisplay,
} from "@/lib/company-about-defaults";
import { cn } from "@/lib/utils";
import { QuotaGateProvider } from "@/components/limits/quota-gate-context";
import { DashboardNotifications } from "@/components/layout/dashboard-notifications";

const SIDEBAR_COLLAPSED_KEY = "rota-digital-sidebar-collapsed";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Leads", href: "/dashboard/leads", icon: Users },
  { name: "Rotas Digitais", href: "/dashboard/rotas", icon: Compass },
  { name: "Propostas", href: "/dashboard/propostas", icon: FileText },
] as const;

const settingsSubItems = [
  { name: "Sobre a Empresa", href: "/dashboard/settings/sobre-a-empresa", icon: Building2 },
  { name: "Inteligência Artificial", href: "/dashboard/settings/inteligencia-artificial", icon: Bot },
  { name: "Dados básicos", href: "/dashboard/settings/dados-basicos", icon: SlidersHorizontal },
  { name: "Pagamentos", href: "/dashboard/settings/pagamentos", icon: CreditCard },
] as const;

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const settingsSection = pathname.startsWith("/dashboard/settings");
  const usuariosSection = pathname.startsWith("/dashboard/usuarios");
  const [mainCollapsed, setMainCollapsed] = useState(false);
  const [companyAbout, setCompanyAbout] = useState<UserCompanyAboutSettings | null>(null);
  const [sidebarPlan, setSidebarPlan] = useState<SidebarBillingPlan>("Starter");

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") setMainCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setCompanyAbout(null);
      setSidebarPlan("Starter");
      return;
    }
    let cancelled = false;
    const settingsRef = doc(db, "userSettings", user.uid);
    const unsub = onSnapshot(
      settingsRef,
      (snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          setCompanyAbout(null);
          setSidebarPlan("Starter");
          return;
        }
        const parsed = parseUserSettingsDocForDashboard(snap.data() as Record<string, unknown>);
        setCompanyAbout(parsed.companyAbout);
        setSidebarPlan(parsed.plan);
      },
      () => {
        if (!cancelled) {
          setCompanyAbout(null);
          setSidebarPlan("Starter");
        }
      },
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [user]);

  const toggleMainSidebar = () => {
    setMainCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return null;
  }

  /** Mesma regra que `/api/admin-users` e `/dashboard/usuarios`: só este e-mail vê o divisor e o link. */
  const canAccessUsuariosAdmin = isGeneralAdminEmail(user.email);

  const agencyName = resolveCompanyAboutNameForDisplay(companyAbout?.companyName?.trim());
  const agencyLogoUrl = resolveCompanyPrimaryImageForDisplay(companyAbout?.primaryImageUrl);

  const handleLogout = async () => {
    if (!auth) {
      router.push("/login");
      return;
    }
    await signOut(auth);
    router.push("/login");
  };

  const navLinkClass = (active: boolean, iconOnly: boolean) =>
    cn(
      "group flex items-center rounded-md transition-all duration-200",
      iconOnly ? "justify-center px-2 py-2.5" : "gap-3 px-3.5 py-2.5",
      active
        ? "bg-sidebar-primary/12 text-foreground shadow-sm ring-1 ring-sidebar-primary/25 dark:bg-white/10 dark:text-white dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] dark:ring-white/10"
        : "text-muted-foreground hover:bg-muted hover:text-foreground dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100",
    );

  return (
    <div className="fixed inset-0 flex h-dvh max-h-dvh min-h-0 w-full flex-row overflow-hidden bg-background text-foreground font-sans">
      {/* Sidebar principal — largura no wrapper para o botão “aba” ficar metade fora */}
      <div
        className={cn(
          "relative flex min-h-0 max-h-full shrink-0 flex-col overflow-visible transition-[width] duration-200 ease-out",
          mainCollapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        <aside
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col justify-between overflow-y-auto border-r border-sidebar-border bg-sidebar/95 text-sidebar-foreground shadow-sm backdrop-blur-xl dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)] dark:bg-zinc-950/50",
          )}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              className={cn(
                "flex h-20 shrink-0 items-center border-b border-sidebar-border dark:border-white/5",
                mainCollapsed ? "justify-center px-2" : "px-4",
              )}
            >
              {!mainCollapsed ? (
                <div className="flex min-w-0 flex-1 items-center pl-3.5 pr-1">
                  <Image
                    src="/assets/logo/logo-dark.png"
                    alt="Rota Digital"
                    width={220}
                    height={62}
                    className="h-auto w-[8.75rem] dark:hidden"
                    priority
                  />
                  <Image
                    src="/assets/logo/logo-white.png"
                    alt="Rota Digital"
                    width={220}
                    height={62}
                    className="hidden h-auto w-[8.75rem] dark:block"
                    priority
                  />
                </div>
              ) : (
                <div className="flex size-10 items-center justify-center rounded-md bg-sidebar-accent/50 dark:bg-white/[0.04]">
                  <Image
                    src="/assets/logo/favicon-dark.png"
                    alt="Rota Digital"
                    width={32}
                    height={32}
                    className="h-7 w-7 dark:hidden"
                    priority
                  />
                  <Image
                    src="/assets/logo/favicon-white.png"
                    alt="Rota Digital"
                    width={32}
                    height={32}
                    className="hidden h-7 w-7 dark:block"
                    priority
                  />
                </div>
              )}
            </div>

          <nav className={cn("mt-6 min-h-0 flex-1 space-y-1.5 overflow-y-auto", mainCollapsed ? "px-2" : "px-4")}>
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  title={mainCollapsed ? item.name : undefined}
                  aria-label={mainCollapsed ? item.name : undefined}
                  className={navLinkClass(isActive, mainCollapsed)}
                >
                  <item.icon
                    className={cn(
                      "size-5 shrink-0 transition-colors",
                      isActive
                        ? "text-sidebar-primary dark:text-sidebar-primary"
                        : "group-hover:text-foreground dark:group-hover:text-zinc-300",
                    )}
                  />
                  {!mainCollapsed ? <span className="font-medium text-[14px]">{item.name}</span> : null}
                </Link>
              );
            })}

            <Link
              href="/dashboard/settings/sobre-a-empresa"
              title={mainCollapsed ? "Configurações" : undefined}
              aria-label={mainCollapsed ? "Configurações" : undefined}
              className={navLinkClass(settingsSection, mainCollapsed)}
            >
              <Settings
                className={cn(
                  "size-5 shrink-0 transition-colors",
                  settingsSection
                    ? "text-sidebar-primary dark:text-sidebar-primary"
                    : "group-hover:text-foreground dark:group-hover:text-zinc-300",
                )}
                aria-hidden
              />
              {!mainCollapsed ? <span className="font-medium text-[14px]">Configurações</span> : null}
            </Link>

            {canAccessUsuariosAdmin ? (
              <>
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  className={cn(
                    "my-2 shrink-0 border-t border-sidebar-border/90 dark:border-white/[0.08]",
                    mainCollapsed ? "mx-0.5" : undefined,
                  )}
                />
                <Link
                  href="/dashboard/usuarios"
                  title={mainCollapsed ? "Usuários" : undefined}
                  aria-label={mainCollapsed ? "Usuários" : undefined}
                  className={navLinkClass(usuariosSection, mainCollapsed)}
                >
                  <UserCog
                    className={cn(
                      "size-5 shrink-0 transition-colors",
                      usuariosSection
                        ? "text-sidebar-primary dark:text-sidebar-primary"
                        : "group-hover:text-foreground dark:group-hover:text-zinc-300",
                    )}
                    aria-hidden
                  />
                  {!mainCollapsed ? <span className="font-medium text-[14px]">Usuários</span> : null}
                </Link>
              </>
            ) : null}
          </nav>
        </div>

        <div
          className={cn(
            "mt-auto shrink-0 border-t border-sidebar-border/90 bg-gradient-to-b from-sidebar/40 to-muted/25 px-3 pb-3 pt-3 backdrop-blur-sm dark:border-white/[0.08] dark:from-zinc-950/40 dark:to-zinc-900/50",
            mainCollapsed ? "px-2 pb-3 pt-2" : "px-3",
          )}
        >
          {mainCollapsed ? (
            <div className="mb-3 flex justify-center relative" title={agencyName}>
              <div className="relative shrink-0">
                <div
                  className={cn(
                    "relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sidebar-border bg-sidebar-accent/50 shadow-sm",
                    "dark:border-white/12 dark:bg-white/[0.06]",
                  )}
                >
                  <img
                    src={agencyLogoUrl}
                    alt=""
                    className="size-full min-h-full min-w-full object-cover object-center"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <DashboardNotifications userId={user.uid} mainCollapsed={true} />
              </div>
            </div>
          ) : (
            <div className="mb-3 rounded-md border border-sidebar-border bg-sidebar-accent/40 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div
                    className={cn(
                      "relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sidebar-border bg-muted/60 shadow-sm",
                      "dark:border-white/12 dark:bg-zinc-800/80",
                    )}
                  >
                    <img
                      src={agencyLogoUrl}
                      alt=""
                      className="size-full min-h-full min-w-full object-cover object-center"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <DashboardNotifications userId={user.uid} mainCollapsed={false} />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="space-y-0.5">
                    <p
                      className="truncate font-heading text-sm font-semibold leading-tight tracking-tight text-sidebar-foreground dark:text-zinc-100"
                      title={agencyName}
                    >
                      {agencyName}
                    </p>
                    {user.email ? (
                      <p
                        className="truncate text-[11px] leading-snug text-muted-foreground dark:text-zinc-500"
                        title={user.email}
                      >
                        {user.email}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      "inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      planBadgeVisualClasses(sidebarPlan),
                    )}
                  >
                    {sidebarPlan === "Master" ? (
                      <span className="inline-flex items-center gap-1">
                        <Sparkles className="size-3 opacity-90" aria-hidden />
                        {sidebarPlanBadgeLabel(sidebarPlan)}
                      </span>
                    ) : (
                      sidebarPlanBadgeLabel(sidebarPlan)
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            title={mainCollapsed ? "Sair" : undefined}
            aria-label={mainCollapsed ? "Sair" : undefined}
            className={cn(
              "group flex w-full items-center rounded-lg border border-transparent text-muted-foreground transition-all duration-200",
              "hover:border-red-200/90 hover:bg-red-500/[0.07] hover:text-red-700",
              "dark:text-zinc-400 dark:hover:border-red-500/25 dark:hover:bg-red-500/10 dark:hover:text-red-300",
              mainCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
            )}
          >
            <LogOut className="size-5 shrink-0 transition-transform group-hover:-translate-x-0.5" aria-hidden />
            {!mainCollapsed ? <span className="text-sm font-medium">Sair</span> : null}
          </button>
        </div>
        </aside>

        <button
          type="button"
          onClick={toggleMainSidebar}
          aria-expanded={!mainCollapsed}
          aria-label={mainCollapsed ? "Expandir menu lateral" : "Recolher menu lateral (só ícones)"}
          title={mainCollapsed ? "Expandir menu" : "Recolher para ícones"}
          className={cn(
            /* Sempre ancorado na borda direita do wrapper da sidebar: quando a largura muda, o botão acompanha. */
            "absolute right-0 top-10 z-20 flex h-10 w-[1.375rem] -translate-y-1/2 translate-x-1/2 items-center justify-center",
            "rounded-l-md rounded-r-lg border border-black/10 bg-brand text-brand-foreground shadow-md",
            "transition-[filter,box-shadow] hover:brightness-[0.92] active:brightness-[0.86]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "dark:border-black/25 dark:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.45)]",
          )}
        >
          {mainCollapsed ? (
            <ChevronRight className="size-4 shrink-0 opacity-95" aria-hidden strokeWidth={2.5} />
          ) : (
            <ChevronLeft className="size-4 shrink-0 opacity-95" aria-hidden strokeWidth={2.5} />
          )}
        </button>
      </div>

      {/* Segunda sidebar — só na área Configurações */}
      {settingsSection ? (
        <aside className="flex max-h-full min-h-0 w-[13.5rem] shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar/90 text-sidebar-foreground backdrop-blur-xl dark:border-white/5 dark:bg-zinc-950/70">
          <div className="border-b border-sidebar-border py-5 pl-6 pr-4 dark:border-white/5">
            <p className="font-heading text-[10px] font-semibold uppercase tracking-widest text-muted-foreground dark:text-zinc-500">
              Configurações
            </p>
            <p className="mt-1 font-heading text-sm font-semibold tracking-tight text-foreground dark:text-zinc-100">
              Sua conta
            </p>
          </div>
          <nav className="flex-1 space-y-1 p-3">
            {settingsSubItems
              .filter(
                (sub) =>
                  sub.href !== "/dashboard/settings/pagamentos" || sidebarPlan === "Master",
              )
              .map((sub) => {
              const subActive = pathname === sub.href;
              return (
                <Link
                  key={sub.href}
                  href={sub.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2.5 text-[13px] font-medium transition-colors",
                    subActive
                      ? "bg-sidebar-primary/15 text-foreground ring-1 ring-sidebar-primary/25 dark:text-white"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground dark:text-zinc-500 dark:hover:bg-white/5 dark:hover:text-zinc-200",
                  )}
                >
                  <sub.icon className="size-4 shrink-0" aria-hidden />
                  {sub.name}
                </Link>
              );
            })}
          </nav>
        </aside>
      ) : null}

      <main
        id="rota-report-scroll-root"
        className="min-h-0 min-w-0 max-h-full flex-1 overflow-y-auto overflow-x-hidden bg-background dark:bg-zinc-950"
      >
        <div className="mx-auto w-full min-h-0 min-w-0 max-w-[1760px] px-4 py-10 sm:px-6 md:px-8 lg:px-10">
          <QuotaGateProvider>{children}</QuotaGateProvider>
        </div>
      </main>
    </div>
  );
}
