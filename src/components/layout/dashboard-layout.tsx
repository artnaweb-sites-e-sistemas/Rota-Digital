"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { LayoutDashboard, Users, Settings, LogOut, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Leads", href: "/dashboard/leads", icon: Users },
  { name: "Rotas Digitais", href: "/dashboard/rotas", icon: Sparkles },
  { name: "Configurações", href: "/dashboard/settings", icon: Settings },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return null; // or a loading spinner
  }

  const handleLogout = async () => {
    if (!auth) {
      router.push("/login");
      return;
    }
    await signOut(auth);
    router.push("/login");
  };

  return (
    <div className="fixed inset-0 flex min-h-0 overflow-hidden bg-background text-foreground font-sans">
      {/* Sidebar — Design refinado com Glassmorphism sutil */}
      <aside className="w-64 flex-shrink-0 bg-zinc-950/50 backdrop-blur-xl text-sidebar-foreground border-r border-white/5 flex flex-col justify-between shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">
        <div>
          <div className="h-20 flex items-center px-6 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/20">
                <Sparkles size={20} className="text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight text-white">
                Rota Digital
              </span>
            </div>
          </div>
          <nav className="mt-8 px-4 space-y-1.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`group flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 ${
                    isActive
                      ? "bg-white/10 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] ring-1 ring-white/10"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
                  }`}
                >
                  <item.icon className={`w-5 h-5 shrink-0 transition-colors ${isActive ? "text-indigo-400" : "group-hover:text-zinc-300"}`} />
                  <span className="font-medium text-[14px]">{item.name}</span>
                  {isActive && (
                    <div className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3 px-3 py-3 mb-3 rounded-xl bg-white/5 ring-1 ring-white/5 text-sm">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-white font-bold shrink-0 shadow-inner">
              {user.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate font-semibold text-zinc-200 text-xs">{user.email}</p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Plano Pro</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-200 group"
          >
            <LogOut className="w-5 h-5 shrink-0 transition-transform group-hover:-translate-x-0.5" />
            <span className="font-medium text-[14px]">Sair</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-clip bg-zinc-950">
        <div className="mx-auto w-full min-h-0 min-w-0 max-w-[1760px] px-6 py-10 sm:px-10 md:px-12">
          {children}
        </div>
      </main>
    </div>
  );
}
