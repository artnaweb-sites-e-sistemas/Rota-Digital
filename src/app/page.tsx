import type { Metadata } from "next";

import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Rota Digital — Leads, Rotas Digitais e Propostas",
  description:
    "Plataforma para organizar leads, gerar Rotas Digitais com diagnóstico e compartilhar propostas por link público. [Resumo — ajustar copy depois.]",
};

export default function Home() {
  return <LandingPage />;
}
