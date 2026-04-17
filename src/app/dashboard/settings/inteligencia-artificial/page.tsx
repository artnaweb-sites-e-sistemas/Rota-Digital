"use client";

import { AiPromptSettingsForm } from "@/components/settings/ai-prompt-settings-form";

export default function SettingsInteligenciaArtificialPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Inteligência Artificial
        </h1>
        <p className="max-w-2xl text-sm leading-snug text-muted-foreground">
          Prompt da IA, canais sugeridos no relatório e alinhamento aos serviços que a agência vende.
        </p>
      </div>

      <AiPromptSettingsForm />
    </div>
  );
}
