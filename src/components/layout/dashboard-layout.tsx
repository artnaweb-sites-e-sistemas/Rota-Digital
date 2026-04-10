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
      {/* Sidebar — tokens alinhados ao tema .dark do shadcn */}
      <aside className="w-64 flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col justify-between">
        <div>
          <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
            <span className="text-xl font-bold tracking-wide uppercase text-sidebar-foreground">
              Rota Digital
            </span>
          </div>
          <nav className="mt-6 px-4 space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  }`}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2 mb-2 text-sm text-muted-foreground">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-sidebar-accent-foreground font-bold shrink-0">
              {user.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sidebar-foreground">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span className="font-medium">Sair</span>
          </button>
        </div>
      </aside>

      {/* Main content — min-w-0 evita que o flex corte bordas/ring na largura útil */}
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-clip bg-background">
        <div className="mx-auto w-full min-h-0 min-w-0 max-w-[1760px] px-6 py-8 sm:px-8 md:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
