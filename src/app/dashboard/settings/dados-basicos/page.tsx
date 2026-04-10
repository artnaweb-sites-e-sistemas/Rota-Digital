"use client";

import { ReportCtaSettingsForm } from "@/components/settings/report-cta-settings-form";
import { AppearanceSettingsForm } from "@/components/settings/appearance-settings-form";

export default function SettingsDadosBasicosPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Dados básicos</h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Aparência do painel e destino dos botões de ação nos relatórios.
        </p>
      </div>

      <AppearanceSettingsForm />
      <ReportCtaSettingsForm />
    </div>
  );
}
