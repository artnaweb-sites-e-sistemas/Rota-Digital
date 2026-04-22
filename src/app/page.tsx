import type { Metadata } from "next";

import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "RouteLAB — Leads, Diagnósticos e Propostas",
  description:
    "Plataforma para organizar leads, gerar diagnósticos e compartilhar propostas com mais clareza e contexto.",
};

export default function Home() {
  return <LandingPage />;
}
