"use client";

import { CompanyAboutSettingsForm } from "@/components/settings/company-about-settings-form";

export default function SettingsSobreAEmpresaPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Sobre a Empresa
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Defina como a sua agência será apresentada nas propostas comerciais.
        </p>
      </div>

      <CompanyAboutSettingsForm />
    </div>
  );
}
