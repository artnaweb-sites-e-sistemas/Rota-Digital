"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/auth-context";
import { getUserUiTheme } from "@/lib/user-settings";

function isPublicSharePath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname.startsWith("/r/") || pathname.startsWith("/p/");
}

/**
 * Ao entrar na conta, aplica o tema salvo em Dados básicos (Firestore).
 * O `next-themes` continua persistindo em localStorage para visitantes / antes do login.
 * Rotas públicas de partilha (`/r/…`, `/p/…`) ignoram o tema da conta — ficam a cargo de
 * `PublicShareThemeBootstrap` (sempre escuro ao abrir).
 */
export function UserThemeSync() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { setTheme } = useTheme();

  // Só ao montar / mudar de conta (`user?.uid`). Incluir `setTheme` nos deps faria o efeito
  // rodar de novo quando a referência mudasse e reaplicaria o Firestore, anulando "Claro".
  useEffect(() => {
    if (!user?.uid) return;
    if (isPublicSharePath(pathname)) return;
    let cancelled = false;
    void getUserUiTheme(user.uid).then((t) => {
      if (!cancelled && t) setTheme(t);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, pathname]); // eslint-disable-line react-hooks/exhaustive-deps -- setTheme omitido de propósito

  return null;
}
