"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/auth-context";
import { getUserUiTheme } from "@/lib/user-settings";

/**
 * Ao entrar na conta, aplica o tema salvo em Dados básicos (Firestore).
 * O `next-themes` continua persistindo em localStorage para visitantes / antes do login.
 */
export function UserThemeSync() {
  const { user } = useAuth();
  const { setTheme } = useTheme();

  // Só ao montar / mudar de conta (`user?.uid`). Incluir `setTheme` nos deps faria o efeito
  // rodar de novo quando a referência mudasse e reaplicaria o Firestore, anulando "Claro".
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    void getUserUiTheme(user.uid).then((t) => {
      if (!cancelled && t) setTheme(t);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps -- setTheme omitido de propósito

  return null;
}
