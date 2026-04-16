"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

/**
 * Links públicos de relatório (`/r/…`) e proposta (`/p/…`) devem abrir sempre em modo escuro,
 * independentemente do tema guardado nas configurações ou no `localStorage`.
 */
export function PublicShareThemeBootstrap() {
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme("dark");
    // Só ao abrir o link público — não repetir quando `setTheme` mudar de referência (senão anula cliques no toggle).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
