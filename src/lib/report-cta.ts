import type { UserReportCtaSettings } from "@/types/user-settings";

const FALLBACK_MAILTO = `mailto:?subject=${encodeURIComponent("Rota Digital — Reunião estratégica")}&body=${encodeURIComponent(
  "Olá, gostaria de agendar uma reunião para validar prioridades, definir cronograma e dar início à execução do plano com segurança.",
)}`;

export type ResolvedReportCta = {
  top: {
    href: string;
    label: string;
    openInNewTab: boolean;
    useWhatsAppIcon: boolean;
  };
  bottom: {
    href: string;
    label: string;
    openInNewTab: boolean;
    useWhatsAppIcon: boolean;
    useCalendarIcon: boolean;
  };
};

export function onlyDigitsPhone(input: string): string {
  return input.replace(/\D/g, "");
}

/** Extrai dígitos do que o utilizador escreve ou cola; reconhece `wa.me/5511…`. */
export function digitsFromPhoneInput(raw: string): string {
  const t = raw.trim();
  const wa = /(?:https?:\/\/)?(?:www\.)?wa\.me\/+?(\d+)/i.exec(t);
  if (wa?.[1]) return wa[1];
  return onlyDigitsPhone(t);
}

/**
 * Máscara para telefone em formulários: números BR (10–11 dígitos sem DDI ou já com 55)
 * usam o formato +55 (DD) NNNNN-NNNN; outros ficam como + e os dígitos.
 */
export function maskPhoneDisplayLoose(rawDigits: string): string {
  const d = onlyDigitsPhone(rawDigits).slice(0, 15);
  if (!d) return "";
  const asBrNational = d.length >= 10 && d.length <= 11 && !d.startsWith("55");
  const asBrWithCountry = d.startsWith("55") && d.length >= 12;
  if (asBrNational || asBrWithCountry) {
    const with55 = asBrNational ? `55${d}`.slice(0, 15) : d;
    return maskWhatsappBRDisplay(with55);
  }
  return `+${d}`;
}

/** BR: se vier 10–11 dígitos sem DDI, assume celular com DDD e prefixa 55. */
export function normalizeWhatsappDigitsForStorage(digits: string): string {
  let d = onlyDigitsPhone(digits);
  if (d.length >= 10 && d.length <= 11 && !d.startsWith("55")) {
    d = `55${d}`;
  }
  return d.slice(0, 15);
}

function formatBRLocalNumber(num: string): string {
  if (!num) return "";
  if (num.length <= 4) return num;
  if (num.length <= 8) {
    return `${num.slice(0, 4)}-${num.slice(4)}`;
  }
  return `${num.slice(0, 5)}-${num.slice(5, 9)}`;
}

/** Máscara visual +55 (DD) NNNNN-NNNN a partir de dígitos armazenados. */
export function maskWhatsappBRDisplay(rawDigits: string): string {
  let d = onlyDigitsPhone(rawDigits).slice(0, 15);
  if (!d) return "";

  const forFormat =
    d.length >= 10 && !d.startsWith("55") ? `55${d}`.slice(0, 15) : d;

  if (!forFormat.startsWith("55")) {
    return `+${forFormat}`;
  }

  const rest = forFormat.slice(2);
  if (!rest) return "+55 ";
  if (rest.length <= 2) return `+55 (${rest}`;
  const ddd = rest.slice(0, 2);
  const num = rest.slice(2);
  if (!num) return `+55 (${ddd}) `;
  return `+55 (${ddd}) ${formatBRLocalNumber(num)}`;
}

export function buildWhatsAppHref(digits: string, prefilledMessage?: string): string {
  const d = normalizeWhatsappDigitsForStorage(digits);
  if (d.length < 12) return "";
  let url = `https://wa.me/${d}`;
  if (prefilledMessage?.trim()) {
    url += `?text=${encodeURIComponent(prefilledMessage.trim())}`;
  }
  return url;
}

function normalizeExternalUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) {
    try {
      new URL(t);
      return t;
    } catch {
      return null;
    }
  }
  const candidate = `https://${t.replace(/^\/+/, "")}`;
  try {
    new URL(candidate);
    return candidate;
  } catch {
    return null;
  }
}

/** Resolve CTAs do relatório: config do usuário > env > mailto. */
export function resolveReportCtas(
  settings: UserReportCtaSettings | null | undefined,
  envOverrideUrl?: string | null
): ResolvedReportCta {
  const envTrim = envOverrideUrl?.trim();
  const fallbackHref = envTrim || FALLBACK_MAILTO;
  const fallbackNewTab = envTrim ? envTrim.startsWith("http") : false;

  const defaultResult: ResolvedReportCta = {
    top: {
      href: "#report-chamada-acao",
      label: "Falar com especialista",
      openInNewTab: false,
      useWhatsAppIcon: false,
    },
    bottom: {
      href: fallbackHref,
      label: "Agendar reunião estratégica",
      openInNewTab: fallbackNewTab,
      useWhatsAppIcon: false,
      useCalendarIcon: true,
    },
  };

  if (!settings) return defaultResult;

  if (settings.ctaMode === "whatsapp") {
    const wa = buildWhatsAppHref(settings.whatsappPhone);
    if (!wa) return defaultResult;
    return {
      top: {
        href: wa,
        label: "Falar com especialista",
        openInNewTab: true,
        useWhatsAppIcon: true,
      },
      bottom: {
        href: wa,
        label: "Agendar reunião estratégica",
        openInNewTab: true,
        useWhatsAppIcon: true,
        useCalendarIcon: false,
      },
    };
  }

  const url = normalizeExternalUrl(settings.ctaUrl);
  if (!url) return defaultResult;

  return {
    top: {
      href: url,
      label: "Falar com especialista",
      openInNewTab: true,
      useWhatsAppIcon: false,
    },
    bottom: {
      href: url,
      label: "Agendar reunião estratégica",
      openInNewTab: true,
      useWhatsAppIcon: false,
      useCalendarIcon: true,
    },
  };
}
