"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_KEY = "rota-digital-sidebar-collapsed";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Leads", href: "/dashboard/leads", icon: Users },
  { name: "Rotas Digitais", href: "/dashboard/rotas", icon: Sparkles },
] as const;

const settingsSubItems = [
  { name: "Dados básicos", href: "/dashboard/settings/dados-basicos", icon: SlidersHorizontal },
  { name: "Inteligência Artificial", href: "/dashboard/settings/inteligencia-artificial", icon: Bot },
] as const;

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const settingsSection = pathname.startsWith("/dashboard/settings");
  const [mainCollapsed, setMainCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") setMainCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

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
      {/* Sidebar principal — expandida ou só ícones */}
      <aside
        className={cn(
          "flex max-h-full min-h-0 shrink-0 flex-col justify-between overflow-y-auto border-r border-sidebar-border bg-sidebar/95 text-sidebar-foreground shadow-sm backdrop-blur-xl transition-[width] duration-200 ease-out dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)] dark:bg-zinc-950/50",
          mainCollapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        <div className="min-h-0 min-w-0">
          <div
            className={cn(
              "flex border-b border-sidebar-border dark:border-white/5",
              mainCollapsed ? "flex-col items-center gap-2 py-3 px-2" : "h-20 items-center justify-between px-4",
            )}
          >
            {!mainCollapsed ? (
              <div className="flex min-w-0 flex-1 items-center">
                <span className="truncate font-heading text-lg font-bold tracking-tight text-foreground dark:text-white">
                  Rota Digital
                </span>
              </div>
            ) : null}
            <button
              type="button"
              onClick={toggleMainSidebar}
              aria-expanded={!mainCollapsed}
              aria-label={mainCollapsed ? "Expandir menu lateral" : "Recolher menu lateral (só ícones)"}
              title={mainCollapsed ? "Expandir menu" : "Recolher para ícones"}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-200",
                mainCollapsed && "order-first",
              )}
            >
              {mainCollapsed ? (
                <ChevronRight className="size-5" aria-hidden />
              ) : (
                <ChevronLeft className="size-5" aria-hidden />
              )}
            </button>
          </div>

          <nav className={cn("mt-6 space-y-1.5", mainCollapsed ? "px-2" : "px-4")}>
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
              href="/dashboard/settings"
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
          </nav>
        </div>

        <div
          className={cn(
            "border-t border-sidebar-border bg-muted/30 p-4 dark:border-white/5 dark:bg-white/[0.02]",
            mainCollapsed && "px-2",
          )}
        >
          {!mainCollapsed ? (
            <div className="mb-3 rounded-md bg-muted px-3 py-3 font-sans ring-1 ring-border dark:bg-white/5 dark:ring-white/5">
              <div className="min-w-0 space-y-1">
                <p className="truncate text-[14px] font-medium leading-snug tracking-tight text-foreground dark:text-zinc-100">
                  {user.email}
                </p>
                <p className="font-heading text-[10px] font-semibold uppercase tracking-widest text-muted-foreground dark:text-zinc-500">
                  Plano Pro
                </p>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleLogout}
            title={mainCollapsed ? "Sair" : undefined}
            aria-label={mainCollapsed ? "Sair" : undefined}
            className={cn(
              "group flex w-full items-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-red-500/10 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400",
              mainCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3.5 py-2.5",
            )}
          >
            <LogOut className="size-5 shrink-0 transition-transform group-hover:-translate-x-0.5" aria-hidden />
            {!mainCollapsed ? <span className="font-medium text-[14px]">Sair</span> : null}
          </button>
        </div>
      </aside>

      {/* Segunda sidebar — só na área Configurações */}
      {settingsSection ? (
        <aside className="flex max-h-full min-h-0 w-[13.5rem] shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar/90 text-sidebar-foreground backdrop-blur-xl dark:border-white/5 dark:bg-zinc-950/70">
          <div className="border-b border-sidebar-border px-4 py-5 dark:border-white/5">
            <p className="font-heading text-[10px] font-semibold uppercase tracking-widest text-muted-foreground dark:text-zinc-500">
              Configurações
            </p>
            <p className="mt-1 font-heading text-sm font-semibold tracking-tight text-foreground dark:text-zinc-100">
              Sua conta
            </p>
          </div>
          <nav className="flex-1 space-y-1 p-3">
            {settingsSubItems.map((sub) => {
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

      <main className="min-h-0 min-w-0 max-h-full flex-1 overflow-y-auto overflow-x-hidden bg-background dark:bg-zinc-950">
        <div className="mx-auto w-full min-h-0 min-w-0 max-w-[1760px] px-6 py-10 sm:px-10 md:px-12">
          {children}
        </div>
      </main>
    </div>
  );
}
