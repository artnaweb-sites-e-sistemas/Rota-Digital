"use client";

import { ReportCtaSettingsForm } from "@/components/settings/report-cta-settings-form";
import { AppearanceSettingsForm } from "@/components/settings/appearance-settings-form";
import { SettingsQuotaOverview } from "@/components/settings/settings-quota-overview";

export default function SettingsDadosBasicosPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Dados básicos</h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Aparência do painel, destino dos botões de ação nos relatórios e consumo de cotas no ciclo atual.
        </p>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <AppearanceSettingsForm />
        <ReportCtaSettingsForm />
      </div>

      <SettingsQuotaOverview />
    </div>
  );
}
