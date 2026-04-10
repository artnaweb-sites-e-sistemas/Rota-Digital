"use client";

import { AiPromptSettingsForm } from "@/components/settings/ai-prompt-settings-form";

export default function SettingsInteligenciaArtificialPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Inteligência Artificial
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Diretrizes gerais, canais recomendados no relatório e foco nos serviços que a sua agência
          oferece.
        </p>
      </div>

      <AiPromptSettingsForm />
    </div>
  );
}
