"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type SVGProps,
} from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Lead, LEAD_STATUSES, normalizeLeadStatus, type LeadStatus } from "@/types/lead";
import { getLeads, createLead, updateLead } from "@/lib/leads";
import { deleteReportsByLead, getReportsByUser } from "@/lib/reports";
import type { RotaDigitalReport } from "@/types/report";
import { buildWhatsAppHref, maskWhatsappBRDisplay, onlyDigitsPhone } from "@/lib/report-cta";
import { useLeadTableColumnWidths } from "@/lib/leads-table-column-widths";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isLeadStatusSelectable, leadHasGeneratedRoute } from "@/lib/lead-status-rules";
import {
  compareLeadsForTableSort,
  getLeadFollowupDay,
  statusUsesFollowupUrgencyColor,
} from "@/lib/lead-followup";
import {
  LEAD_STATUS_DOT_CLASSES,
  LEAD_STATUS_MENU_DOT_CLASSES,
  leadStatusDropdownTriggerSurface,
} from "@/lib/lead-status-ui";
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Sparkles,
  X,
  Users,
} from "lucide-react";
import Link from "next/link";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { LeadCaptureProgressOverlay } from "@/components/leads/lead-capture-progress-overlay";
// import { toast } from "sonner"; // If not available, we can use a simple alert or just implement without it

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const LEADS_PAGE_SIZE_STORAGE_KEY = "leads_page_size";
const LEADS_CAPTURE_FORM_STORAGE_KEY = "leads_capture_form_v1";
const DEFAULT_PHONE_COUNTRY_CODE = "55";

const ALL_STATUSES: LeadStatus[] = [...LEAD_STATUSES];

/** Valor interno em português (evita exibir “all” no gatilho do select). */
const STATUS_FILTER_TODOS = "todos" as const;

type StatusFilter = typeof STATUS_FILTER_TODOS | LeadStatus;

type PhoneCountry = {
  code: string;
  flag: string;
  label: string;
};

const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: "55", flag: "🇧🇷", label: "Brasil" },
  { code: "1", flag: "🇺🇸", label: "Estados Unidos / Canadá" },
  { code: "351", flag: "🇵🇹", label: "Portugal" },
  { code: "34", flag: "🇪🇸", label: "Espanha" },
  { code: "44", flag: "🇬🇧", label: "Reino Unido" },
  { code: "49", flag: "🇩🇪", label: "Alemanha" },
  { code: "39", flag: "🇮🇹", label: "Itália" },
  { code: "33", flag: "🇫🇷", label: "França" },
  { code: "598", flag: "🇺🇾", label: "Uruguai" },
  { code: "54", flag: "🇦🇷", label: "Argentina" },
  { code: "56", flag: "🇨🇱", label: "Chile" },
  { code: "57", flag: "🇨🇴", label: "Colômbia" },
  { code: "52", flag: "🇲🇽", label: "México" },
];

function statusFilterLabel(v: StatusFilter): string {
  if (v === "Novo Lead") return "Novos leads";
  return v === STATUS_FILTER_TODOS ? "Todos os status" : v;
}

function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

/** Uma linha ou vírgula/ponto e vírgula por item (nichos e cidades). */
function splitToList(raw: string): string[] {
  const parts = raw
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).slice(0, 40);
}

type CaptureTagInputProps = {
  id: string;
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  minHeightClassName: string;
};

function CaptureTagInput({
  id,
  tags,
  onChange,
  placeholder,
  minHeightClassName,
}: CaptureTagInputProps) {
  const [draft, setDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const appendTagsFromRaw = useCallback(
    (raw: string) => {
      const parsed = splitToList(raw);
      if (!parsed.length) return;
      const merged = Array.from(new Set([...tags, ...parsed])).slice(0, 40);
      onChange(merged);
    },
    [onChange, tags],
  );

  const commitDraft = useCallback(() => {
    const value = draft.trim();
    if (!value) return;
    appendTagsFromRaw(value);
    setDraft("");
  }, [appendTagsFromRaw, draft]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitDraft();
    }
    if (event.key === "Backspace" && !draft && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditingValue(tags[index] ?? "");
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditingValue("");
  };

  const commitEditing = useCallback(() => {
    if (editingIndex === null) return;
    const parsed = splitToList(editingValue);
    if (!parsed.length) {
      onChange(tags.filter((_, index) => index !== editingIndex));
      cancelEditing();
      return;
    }
    const withoutCurrent = tags.filter((_, index) => index !== editingIndex);
    const dedupedParsed = Array.from(new Set(parsed));
    const alreadyUsed = new Set(withoutCurrent);
    const replacement: string[] = [];
    for (const value of dedupedParsed) {
      if (alreadyUsed.has(value)) continue;
      replacement.push(value);
      alreadyUsed.add(value);
    }
    if (!replacement.length) {
      onChange(withoutCurrent);
      cancelEditing();
      return;
    }
    const next = [...withoutCurrent];
    next.splice(editingIndex, 0, ...replacement);
    onChange(next.slice(0, 40));
    cancelEditing();
  }, [editingIndex, editingValue, onChange, tags]);

  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-start gap-2 rounded-md border border-white/15 bg-white/[0.07] px-2.5 py-2 transition-colors focus-within:border-brand/55 focus-within:ring-2 focus-within:ring-brand/25",
        minHeightClassName,
      )}
    >
      {tags.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/15 px-2 py-1 text-xs font-medium text-zinc-100"
        >
          {editingIndex === index ? (
            <input
              value={editingValue}
              onChange={(event) => setEditingValue(event.target.value)}
              onBlur={commitEditing}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitEditing();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEditing();
                }
              }}
              className="h-4 w-28 bg-transparent text-xs text-zinc-100 outline-none"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={() => startEditing(index)}
              className="rounded px-0.5 text-left transition-colors hover:text-white"
              title={`Editar ${tag}`}
            >
              {tag}
            </button>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onChange(tags.filter((_, currentIndex) => currentIndex !== index));
              if (editingIndex === index) {
                cancelEditing();
              }
            }}
            className="inline-flex size-4 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/20 hover:text-white"
            aria-label={`Remover ${tag}`}
            title={`Remover ${tag}`}
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (/[,\n;]/.test(nextValue)) {
            appendTagsFromRaw(nextValue);
            setDraft("");
            return;
          }
          setDraft(nextValue);
        }}
        onKeyDown={handleKeyDown}
        onBlur={commitDraft}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData("text");
          if (!/[,\n;]/.test(pasted)) return;
          event.preventDefault();
          appendTagsFromRaw(pasted);
        }}
        placeholder={tags.length ? "" : placeholder}
        className="h-6 min-w-[12rem] flex-1 bg-transparent text-sm text-zinc-50 placeholder:text-zinc-400 placeholder:opacity-100 outline-none"
        autoComplete="off"
      />
    </div>
  );
}

function stripBrazilCountryCode(raw: string, aggressive = false): string {
  let digits = raw.replace(/\D/g, "");
  const trimmed = raw.trim();
  const hasExplicitCountryCode =
    /^\+?55[\s().-]/.test(trimmed) || /^0055/.test(trimmed) || /^\s*55\d{9,11}$/.test(trimmed);
  if (digits.startsWith("55")) {
    const shouldStrip = hasExplicitCountryCode || digits.length > 11 || (aggressive && digits.length >= 11);
    if (shouldStrip) {
      const withoutCountry = digits.slice(2);
      if (withoutCountry.length >= 8) digits = withoutCountry;
    }
  }
  return digits;
}

function onlyPhoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

function parsePhoneForForm(raw: string | undefined): { countryCode: string; localDigits: string } {
  const input = (raw ?? "").trim();
  const digits = onlyPhoneDigits(input);
  if (!digits) return { countryCode: DEFAULT_PHONE_COUNTRY_CODE, localDigits: "" };

  // Números legados sem prefixo internacional explícito devem abrir como Brasil.
  const hasExplicitInternationalPrefix = input.startsWith("+") || input.startsWith("00");
  if (!hasExplicitInternationalPrefix) {
    return {
      countryCode: DEFAULT_PHONE_COUNTRY_CODE,
      localDigits: stripBrazilCountryCode(input, true),
    };
  }

  const intlDigits = input.startsWith("00") && digits.startsWith("00") ? digits.slice(2) : digits;
  const sortedCodes = [...PHONE_COUNTRIES].sort((a, b) => b.code.length - a.code.length);
  for (const country of sortedCodes) {
    if (!intlDigits.startsWith(country.code)) continue;
    const localDigits = intlDigits.slice(country.code.length);
    if (localDigits.length >= 6) {
      return { countryCode: country.code, localDigits };
    }
  }
  return {
    countryCode: DEFAULT_PHONE_COUNTRY_CODE,
    localDigits: stripBrazilCountryCode(raw ?? "", true),
  };
}

function composePhoneForStorage(localPhone: string, countryCode: string): string {
  const digits = onlyPhoneDigits(localPhone);
  if (!digits) return "";
  const cc = countryCode.trim() || DEFAULT_PHONE_COUNTRY_CODE;
  return `+${cc}${digits}`;
}

function formatPhoneBr(value: string): string {
  const digits = stripBrazilCountryCode(value).slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function normalizeWebsiteHref(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function normalizeInstagramHref(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("@")) return `https://instagram.com.br/${value}`;
  if (/^instagram\.com/i.test(value) || /^www\.instagram\.com/i.test(value)) {
    return `https://${value.replace(/^https?:\/\//i, "")}`;
  }
  return `https://instagram.com.br/@${value.replace(/^@/, "")}`;
}

function InstagramBrandGlyph(props: SVGProps<SVGSVGElement>) {
  const { className, ...rest } = props;
  return (
    <svg viewBox="0 0 24 24" className={cn("shrink-0", className)} {...rest}>
      <path
        fill="currentColor"
        d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"
      />
    </svg>
  );
}

/** Dígitos nacionais ou já com 55; remove zeros de tronco (ex.: 011…) para wa.me com +55. */
function leadPhoneDigitsForWhatsApp(raw: string): string {
  return onlyDigitsPhone(raw).replace(/^0+/, "");
}

function leadPhoneDigitsForCopy(raw: string): string {
  const digits = leadPhoneDigitsForWhatsApp(raw);
  if (digits.length > 11 && digits.startsWith("55")) return digits.slice(2);
  return digits;
}

/** Regra prática BR: WhatsApp costuma estar em celular (DDD + número de 9 dígitos iniciado em 9). */
function isLikelyWhatsAppBr(raw: string): boolean {
  const digits = leadPhoneDigitsForWhatsApp(raw);
  let national = digits;
  if (national.length > 11 && national.startsWith("55")) {
    national = national.slice(2);
  }
  if (national.length !== 11) return false;
  return national.charAt(2) === "9";
}

/** Dígitos do telefone do lead para busca (com variante sem DDI 55). */
function leadPhoneDigitVariants(raw: string | undefined): string[] {
  const d = onlyDigitsPhone(raw ?? "").replace(/^0+/, "");
  if (!d || d.length < 6) return [];
  const out = new Set<string>();
  out.add(d);
  if (d.startsWith("55") && d.length > 4) out.add(d.slice(2));
  return [...out];
}

/** Termo tratável como número (só dígitos após limpar), mín. 6 para evitar ruído. */
function searchTermAsPhoneDigits(term: string): string | null {
  const d = onlyDigitsPhone(term).replace(/^0+/, "");
  if (d.length < 6) return null;
  return d;
}

/** `?status=` na URL (ex.: vindo do dashboard). */
function statusFromQueryParam(raw: string | null): LeadStatus | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (ALL_STATUSES.includes(decoded as LeadStatus)) return decoded as LeadStatus;
  const fromLegacy = normalizeLeadStatus(decoded);
  if (decoded === "Novo" || decoded === "Qualificado") return fromLegacy;
  return null;
}

/** Busca em nome, empresa, e-mail, URLs; telefone compara só por dígitos (ex.: 11973290094 casa com +55 (11) 97329-0094). */
function leadMatchesSearch(lead: Lead, rawQuery: string): boolean {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  const terms = q.split(/\s+/).filter(Boolean);
  const fieldTexts = [
    lead.name,
    lead.company,
    lead.email,
    lead.phone || "",
    lead.websiteUrl || "",
    lead.instagramUrl || "",
  ].map(normalizeSearchText);
  const hayFlat = fieldTexts.join(" ");
  const phoneVariants = leadPhoneDigitVariants(lead.phone);
  return terms.every((term) => {
    if (hayFlat.includes(term)) return true;
    const phoneDigits = searchTermAsPhoneDigits(term);
    if (phoneDigits && phoneVariants.length > 0) {
      const queryVariants = new Set<string>([phoneDigits]);
      if (phoneDigits.startsWith("55") && phoneDigits.length > 4) {
        queryVariants.add(phoneDigits.slice(2));
      }
      for (const qd of queryVariants) {
        for (const pv of phoneVariants) {
          if (pv.includes(qd) || qd.includes(pv)) return true;
        }
      }
    }
    return fieldTexts.some((field) =>
      field.split(/[\s@._\-/+]+/).some((word) => word.length > 0 && word.startsWith(term)),
    );
  });
}

function publicAppOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

function sharedReportHref(slug: string): string {
  const origin = publicAppOrigin();
  const safeSlug = encodeURIComponent(slug.trim());
  if (!origin) return `/r/${safeSlug}`;
  return `${origin}/r/${safeSlug}`;
}

/** Chip verde do WhatsApp na tabela (link externo compacto). */
const TABLE_EXTERNAL_LINK_CHIP_CLASS =
  "inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border border-[#25D366]/20 bg-[#25D366]/5 text-[#25D366]/80 transition-colors hover:border-[#25D366]/35 hover:bg-[#25D366]/10 hover:text-[#25D366] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#25D366]/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background dark:border-[#25D366]/15 dark:bg-[#25D366]/10 dark:hover:border-[#25D366]/28 dark:hover:bg-[#25D366]/12";

/** Chip da rota pública / painel — tom marca, distinto do WhatsApp. */
const TABLE_PUBLIC_ROUTE_CHIP_CLASS =
  "inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border border-brand/30 bg-brand/10 text-brand transition-colors hover:border-brand/50 hover:bg-brand/18 hover:text-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background dark:border-brand/40 dark:bg-brand/15 dark:text-brand dark:hover:border-brand/50 dark:hover:bg-brand/22";

/** Chip “gerar rota” — tom âmbar, distinto do link externo (ícone Sparkles). */
const TABLE_CREATE_ROUTE_CHIP_CLASS =
  "inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border border-amber-500/35 bg-amber-500/10 text-amber-800 transition-colors hover:border-amber-500/55 hover:bg-amber-500/18 hover:text-amber-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200 dark:hover:border-amber-300/45 dark:hover:bg-amber-400/16 dark:hover:text-amber-50";

const FOLLOWUP_NEUTRAL_BADGE_CLASS =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-border/80 bg-muted/60 px-1.5 text-[10px] font-bold uppercase tabular-nums tracking-wide text-muted-foreground dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400";

function leadFollowupBadgeClass(status: LeadStatus, day: number): string {
  if (!statusUsesFollowupUrgencyColor(status)) return FOLLOWUP_NEUTRAL_BADGE_CLASS;
  if (day <= 2) {
    return "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-emerald-700/40 bg-emerald-500/12 px-1.5 text-[10px] font-bold uppercase tabular-nums tracking-wide text-emerald-900 dark:border-emerald-400/45 dark:bg-emerald-500/18 dark:text-emerald-100";
  }
  if (day <= 5) {
    return "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-amber-700/40 bg-amber-500/12 px-1.5 text-[10px] font-bold uppercase tabular-nums tracking-wide text-amber-900 dark:border-amber-400/45 dark:bg-amber-500/18 dark:text-amber-100";
  }
  return "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-red-700/40 bg-red-500/12 px-1.5 text-[10px] font-bold uppercase tabular-nums tracking-wide text-red-900 dark:border-red-400/45 dark:bg-red-500/18 dark:text-red-100";
}

function LeadFollowupCell({ lead }: { lead: Lead }) {
  const day = getLeadFollowupDay(lead);
  return (
    <span className={leadFollowupBadgeClass(lead.status, day)} title={`Followup dia ${day}`}>
      D{day}
    </span>
  );
}

function LeadTableSharedRouteLink({
  lead,
  rowHasRoute,
  publicSlugByReportId,
}: {
  lead: Lead;
  rowHasRoute: boolean;
  publicSlugByReportId: Map<string, string>;
}) {
  const canOpenNewRotaForm =
    (lead.status === "Novo Lead" || lead.status === "Em Contato") && !rowHasRoute;

  if (canOpenNewRotaForm) {
    const href = `/dashboard/rotas/new?leadId=${encodeURIComponent(lead.id)}`;
    return (
      <Link
        href={href}
        className={TABLE_CREATE_ROUTE_CHIP_CLASS}
        aria-label={`Gerar rota digital para ${lead.name}`}
        title="Gerar rota para este lead (abre o formulário com o lead já selecionado)"
        onClick={(e) => e.stopPropagation()}
      >
        <Sparkles className="size-3 shrink-0" aria-hidden />
      </Link>
    );
  }

  if (!rowHasRoute || lead.status !== "Rota Gerada" || !lead.reportId) {
    return null;
  }
  const slug = publicSlugByReportId.get(lead.reportId);
  const href = slug ? sharedReportHref(slug) : `/dashboard/rotas/${lead.reportId}`;
  const opensPublic = Boolean(slug);
  const label = opensPublic
    ? `Abrir rota pública${slug ? ` (${slug})` : ""}`
    : "Abrir relatório da rota";
  return (
    <Link
      href={href}
      target={opensPublic ? "_blank" : undefined}
      rel={opensPublic ? "noopener noreferrer" : undefined}
      className={TABLE_PUBLIC_ROUTE_CHIP_CLASS}
      aria-label={label}
      title={opensPublic ? "Abrir página pública da rota" : "Abrir relatório no painel"}
      onClick={(e) => e.stopPropagation()}
    >
      <ExternalLink className="size-3 shrink-0" aria-hidden />
    </Link>
  );
}

function LeadTableColumnResizeHandle({
  leftColumnIndex,
  onResizerMouseDown,
}: {
  leftColumnIndex: number;
  onResizerMouseDown: (leftColumnIndex: number, e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label="Arrastar para redimensionar a coluna"
      title="Redimensionar coluna"
      className={cn(
        "group absolute inset-y-2 right-0 z-10 flex w-2.5 cursor-col-resize items-center justify-center border-0 bg-transparent p-0",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/45",
      )}
      onMouseDown={(e) => onResizerMouseDown(leftColumnIndex, e)}
    >
      {/* Linha fina mas legível; o botão largo só define a zona de arrasto. */}
      <span
        className={cn(
          "pointer-events-none block h-[min(64%,2.25rem)] w-px shrink-0 origin-center scale-x-[0.55]",
          "bg-foreground/[0.14] transition-[transform,background-color] duration-150 ease-out",
          "group-hover:scale-x-100 group-hover:bg-foreground/[0.24]",
          "group-active:bg-foreground/[0.3]",
          "dark:bg-white/[0.16] dark:group-hover:bg-white/[0.26] dark:group-active:bg-white/[0.32]",
        )}
        aria-hidden
      />
    </button>
  );
}

function LeadTablePhoneCell({
  leadId,
  phone,
  lastCopiedLeadId,
  onPhoneCopied,
}: {
  leadId: string;
  phone: string | undefined;
  lastCopiedLeadId: string | null;
  onPhoneCopied: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const trimmed = phone?.trim() ?? "";
  const isLastCopiedRow = lastCopiedLeadId === leadId;
  if (!trimmed) {
    return (
      <div className="flex w-full min-w-0 items-center gap-2">
        <span
          className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/35 text-muted-foreground/45"
          aria-hidden
          title="Telefone indisponível"
        >
          <Copy className="size-3" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">Sem telefone</span>
        <span
          className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/35 text-muted-foreground/45"
          aria-hidden
          title="WhatsApp indisponível"
        >
          <WhatsAppIcon className="size-3" aria-hidden />
        </span>
      </div>
    );
  }
  const waDigits = leadPhoneDigitsForWhatsApp(trimmed);
  const copyDigits = leadPhoneDigitsForCopy(trimmed);
  const waHref = isLikelyWhatsAppBr(trimmed) ? buildWhatsAppHref(waDigits) : null;
  const displayPlus55 = maskWhatsappBRDisplay(waDigits);
  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      {copyDigits ? (
        <span className="relative inline-flex shrink-0 items-center">
          <span
            className={cn(
              "pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded-md border border-emerald-500/40 bg-emerald-500/12 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-200 transition-all duration-200",
              copied ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
            )}
            aria-hidden
          >
            Copiado
          </span>
          <button
            type="button"
            className={cn(
              "inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border border-border bg-background/70 text-muted-foreground transition-[color,transform] duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40 active:scale-[0.92]",
            )}
            aria-label={`Copiar telefone ${displayPlus55}`}
            title="Copiar telefone sem +55"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard.writeText(copyDigits).then(() => {
                onPhoneCopied();
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              });
            }}
          >
            <Copy
              className={cn(
                "size-3 transition-colors duration-200",
                isLastCopiedRow && "text-emerald-600 dark:text-emerald-400",
              )}
              aria-hidden
            />
          </button>
        </span>
      ) : (
        <span
          className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/35 text-muted-foreground/45"
          aria-hidden
          title="Copiar indisponível"
        >
          <Copy className="size-3" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={displayPlus55}>
        {displayPlus55 || trimmed}
      </span>
      {waHref ? (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className={TABLE_EXTERNAL_LINK_CHIP_CLASS}
          aria-label={`Abrir WhatsApp ${displayPlus55}`}
          title="Abrir no WhatsApp"
          onClick={(e) => e.stopPropagation()}
        >
          <WhatsAppIcon className="size-3" aria-hidden />
        </a>
      ) : (
        <span
          className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/35 text-muted-foreground/45"
          aria-hidden
          title="WhatsApp indisponível"
        >
          <WhatsAppIcon className="size-3" aria-hidden />
        </span>
      )}
    </div>
  );
}

function LeadsPageContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [reports, setReports] = useState<RotaDigitalReport[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(STATUS_FILTER_TODOS);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pendingRestoreScrollYRef = useRef<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  /** Último lead em que o utilizador copiou o telefone (destaque no ícone até outro clique). */
  const [lastPhoneCopyLeadId, setLastPhoneCopyLeadId] = useState<string | null>(null);
  const leadsTableRef = useRef<HTMLTableElement | null>(null);
  const [leadTableColWidthsPct, { onResizerMouseDown: onLeadTableColResizeMouseDown }] =
    useLeadTableColumnWidths(leadsTableRef);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureNiches, setCaptureNiches] = useState<string[]>([]);
  const [captureCities, setCaptureCities] = useState<string[]>([]);
  const [captureMax, setCaptureMax] = useState(25);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureNoticeOpen, setCaptureNoticeOpen] = useState(false);
  const [captureNoticeMessage, setCaptureNoticeMessage] = useState("");

  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState<string>(DEFAULT_PHONE_COUNTRY_CODE);
  const [company, setCompany] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [status, setStatus] = useState<LeadStatus>("Novo Lead");

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [data, userReports] = await Promise.all([
        getLeads(user.uid),
        getReportsByUser(user.uid),
      ]);
      setLeads(data);
      setReports(userReports);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const publicSlugByReportId = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of reports) {
      if (r.publicSlug) m.set(r.id, r.publicSlug);
    }
    return m;
  }, [reports]);

  const captureOverlayHint = useMemo(() => {
    const n = captureNiches[0];
    const c = captureCities[0];
    if (n && c) return `${n} · ${c}`;
    if (n) return n;
    return undefined;
  }, [captureNiches, captureCities]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    const raw = window.localStorage.getItem(LEADS_PAGE_SIZE_STORAGE_KEY);
    if (!raw) return;
    const parsed = Number(raw);
    if (PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])) {
      setPageSize(parsed);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LEADS_PAGE_SIZE_STORAGE_KEY, String(pageSize));
  }, [pageSize]);

  useEffect(() => {
    const raw = window.localStorage.getItem(LEADS_CAPTURE_FORM_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        niches?: unknown;
        cities?: unknown;
        max?: unknown;
      };
      if (Array.isArray(parsed.niches)) {
        setCaptureNiches(splitToList(parsed.niches.join(",")));
      }
      if (Array.isArray(parsed.cities)) {
        setCaptureCities(splitToList(parsed.cities.join(",")));
      }
      if (typeof parsed.max === "number" && Number.isFinite(parsed.max)) {
        setCaptureMax(Math.min(50, Math.max(1, Math.floor(parsed.max))));
      }
    } catch {
      // Ignora dados inválidos no storage.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      LEADS_CAPTURE_FORM_STORAGE_KEY,
      JSON.stringify({
        niches: captureNiches,
        cities: captureCities,
        max: captureMax,
      }),
    );
  }, [captureCities, captureMax, captureNiches]);

  useEffect(() => {
    if (!captureBusy) return;
    const id = window.setInterval(() => {
      setCaptureProgress((p) => (p >= 88 ? p : p + 2));
    }, 240);
    return () => window.clearInterval(id);
  }, [captureBusy]);

  useEffect(() => {
    if (isDialogOpen || deleteConfirmOpen) return;
    const top = pendingRestoreScrollYRef.current;
    if (top === null) return;
    pendingRestoreScrollYRef.current = null;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top, behavior: "auto" });
      });
    });
  }, [deleteConfirmOpen, isDialogOpen]);

  const statusQuery = searchParams.get("status");
  useEffect(() => {
    const parsed = statusFromQueryParam(statusQuery);
    if (parsed) setStatusFilter(parsed);
    else setStatusFilter(STATUS_FILTER_TODOS);
  }, [statusQuery]);

  const filteredLeads = useMemo(
    () =>
      leads
        .filter((lead) => {
          if (!leadMatchesSearch(lead, search)) return false;
          // Com busca preenchida, prioriza o termo e ignora o filtro de status.
          if (search.trim()) return true;
          if (statusFilter !== STATUS_FILTER_TODOS && lead.status !== statusFilter) return false;
          return true;
        })
        .sort(compareLeadsForTableSort),
    [leads, search, statusFilter],
  );

  const pageCount = Math.max(1, Math.ceil(filteredLeads.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), pageCount);
  const pageSliceStart = (safePage - 1) * pageSize;
  const paginatedLeads = filteredLeads.slice(pageSliceStart, pageSliceStart + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, pageSize]);

  useEffect(() => {
    setCurrentPage((p) => Math.min(Math.max(1, p), pageCount));
  }, [pageCount]);

  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== STATUS_FILTER_TODOS;

  const openForm = (lead?: Lead) => {
    if (lead) {
      const parsedPhone = parsePhoneForForm(lead.phone);
      setEditingLead(lead);
      setName(lead.name);
      setEmail(lead.email);
      setPhoneCountryCode(parsedPhone.countryCode);
      setPhone(
        parsedPhone.countryCode === DEFAULT_PHONE_COUNTRY_CODE
          ? formatPhoneBr(parsedPhone.localDigits)
          : parsedPhone.localDigits,
      );
      setCompany(lead.company);
      setWebsiteUrl(lead.websiteUrl?.trim() ?? "");
      setInstagramUrl(lead.instagramUrl?.trim() ?? "");
      const hasRoute = leadHasGeneratedRoute({
        reportDocumentExists: false,
        reportIdOnLead: lead.reportId,
      });
      let nextStatus = lead.status;
      if (!hasRoute && nextStatus === "Rota Gerada") nextStatus = "Novo Lead";
      if (hasRoute && nextStatus === "Novo Lead") nextStatus = "Rota Gerada";
      setStatus(nextStatus);
    } else {
      setEditingLead(null);
      setName("");
      setEmail("");
      setPhone("");
      setPhoneCountryCode(DEFAULT_PHONE_COUNTRY_CODE);
      setCompany("");
      setWebsiteUrl("");
      setInstagramUrl("");
      setStatus("Novo Lead");
    }
    setSaveError(null);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim() || !company.trim()) {
      setSaveError("Nome e Empresa são obrigatórios.");
      return;
    }
    const hasRoute = editingLead
      ? leadHasGeneratedRoute({ reportDocumentExists: false, reportIdOnLead: editingLead.reportId })
      : false;
    if (!isLeadStatusSelectable(status, hasRoute)) {
      setSaveError(
        hasRoute
          ? "Com rota gerada não é possível voltar o status para Novo Lead ou Em Contato."
          : "O status Rota Gerada só fica disponível depois de gerar o relatório para este lead.",
      );
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    pendingRestoreScrollYRef.current = window.scrollY;
    try {
      const payload = {
        name,
        email,
        phone: composePhoneForStorage(phone, phoneCountryCode),
        company,
        status,
        websiteUrl: websiteUrl.trim(),
        instagramUrl: instagramUrl.trim(),
      };
      if (editingLead) {
        await updateLead(editingLead.id, payload);
        setLeads((prev) =>
          prev.map((leadRow) =>
            leadRow.id === editingLead.id
              ? {
                  ...leadRow,
                  ...payload,
                }
              : leadRow,
          ),
        );
      } else {
        await createLead({
          userId: user.uid,
          ...payload,
        });
        await fetchLeads();
      }
      setIsDialogOpen(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido ao salvar.";
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteConfirm = (lead: Lead) => {
    setDeleteTarget(lead);
    setDeleteError(null);
    setDeleteConfirmOpen(true);
  };

  const handleDelete = async () => {
    if (!user || !deleteTarget) return;
    pendingRestoreScrollYRef.current = window.scrollY;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteReportsByLead({ leadId: deleteTarget.id, userId: user.uid });
      const idToken = await user.getIdToken();
      const res = await fetch("/api/leads-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ leadId: deleteTarget.id }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "Não foi possível excluir o lead.");
      }
      setLeads((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    } catch (error) {
      console.error(error);
      setDeleteError("Não foi possível excluir o lead agora. Tente novamente.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLeadStatusChange = async (leadRow: Lead, next: LeadStatus) => {
    if (!user || next === leadRow.status) return;
    const hasRoute = leadHasGeneratedRoute({
      reportDocumentExists: false,
      reportIdOnLead: leadRow.reportId,
    });
    if (!isLeadStatusSelectable(next, hasRoute)) return;
    try {
      await updateLead(leadRow.id, { status: next });
      await fetchLeads();
    } catch (error) {
      console.error(error);
    }
  };

  const openCapture = () => {
    setCaptureError(null);
    setCaptureOpen(true);
  };

  const runCapture = async () => {
    if (!user) return;
    const niches = captureNiches;
    const cities = captureCities;
    if (!niches.length || !cities.length) {
      setCaptureError("Informe ao menos um nicho e uma cidade (linhas ou separados por vírgula).");
      return;
    }
    const maxResults = Math.min(50, Math.max(1, Math.floor(Number(captureMax)) || 25));
    setCaptureError(null);
    setCaptureBusy(true);
    setCaptureProgress(4);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/leads-capture", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          niches,
          cities,
          maxResults,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        created?: number;
        requested?: number;
        eligibleUnique?: number;
        diagnostics?: {
          textSearches: number;
          placesFromSearch: number;
          detailCalls: number;
          skippedNoDetails: number;
          skippedNoContact: number;
          skippedDuplicate: number;
        };
      };
      if (!res.ok) {
        setCaptureError(payload.error || "Não foi possível concluir a captura.");
        return;
      }
      setCaptureProgress(100);
      const created = typeof payload.created === "number" ? payload.created : 0;
      const requested = typeof payload.requested === "number" ? payload.requested : maxResults;
      const eligible =
        typeof payload.eligibleUnique === "number" ? payload.eligibleUnique : undefined;
      await fetchLeads();
      if (created === 0) {
        const d = payload.diagnostics;
        let msg =
          "Nenhum lead novo gravado. Só entram empresas com telefone (8+ dígitos), site ou e-mail público, sem duplicar a sua lista.";
        if (d) {
          if (d.placesFromSearch === 0 && d.textSearches > 0) {
            msg +=
              " O Google não devolveu resultados para esta pesquisa — confira a chave `GOOGLE_PLACES_API_KEY`, a API Places (New) e as restrições da chave (pedidos vêm do servidor, não do browser).";
          } else if (d.detailCalls > 0 && d.skippedNoDetails === d.detailCalls) {
            msg +=
              " Não foi possível obter detalhes dos lugares (404/erro) — confira se a mesma chave permite Place Details (New).";
          } else {
            if (d.skippedNoContact > 0) {
              msg += ` ${d.skippedNoContact} resultado(s) sem contacto público suficiente.`;
            }
            if (d.skippedDuplicate > 0) {
              msg += ` ${d.skippedDuplicate} ignorado(s) por já existirem na base (telefone, site ou Google Place).`;
            }
          }
        }
        setCaptureError(msg);
        return;
      }
      setCaptureOpen(false);
      if (created < requested) {
        const extra =
          typeof eligible === "number"
            ? ` Na pesquisa apareceram ${eligible} empresa(s) com contacto público (telefone, site ou e-mail) que ainda não estavam duplicadas na sua base.`
            : "";
        setCaptureNoticeMessage(
          `Foram cadastrados ${created} de ${requested} leads.${extra} Para chegar ao número total, experimente alargar cidades, variar os nichos ou repetir mais tarde — o Google pode devolver resultados diferentes ao longo do tempo.`,
        );
        setCaptureNoticeOpen(true);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro de rede ao capturar leads.";
      setCaptureError(msg);
    } finally {
      setCaptureBusy(false);
      setTimeout(() => setCaptureProgress(0), 400);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Leads</h1>
          <p className="mt-1 text-muted-foreground">Gerencie seus contatos e oportunidades de negócio.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="gap-2 border-white/15 bg-white/[0.03] text-foreground hover:bg-white/[0.06]"
            onClick={openCapture}
            disabled={captureBusy || !user}
          >
            <MapPin className="size-4 shrink-0" aria-hidden />
            Captura automática
          </Button>
          <Button variant="cta" size="lg" onClick={() => openForm()} className="gap-2">
            <Plus className="size-4 shrink-0" aria-hidden />
            Novo Lead
          </Button>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          showCloseButton
          className={cn(
            "max-h-[min(92vh,820px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-y-auto overflow-x-hidden border-white/10 bg-zinc-950 p-0 text-zinc-100 shadow-2xl sm:max-w-xl md:max-w-[36rem]",
            "rounded-2xl ring-1 ring-white/10",
          )}
        >
          <div className="relative border-b border-white/[0.06] bg-white/[0.015] px-6 pb-5 pt-6 pr-14 sm:px-8 sm:pb-6 sm:pt-7 sm:pr-16">
            <DialogHeader className="gap-1.5 space-y-0 text-left">
              <DialogTitle className="font-heading text-lg font-semibold tracking-tight text-white sm:text-xl">
                {editingLead ? "Editar lead" : "Novo lead"}
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed text-zinc-500 sm:text-sm">
                {editingLead
                  ? "Atualize os dados do contacto. As alterações refletem-se na lista e nas rotas associadas."
                  : "Preencha os dados básicos para criar o contacto e acompanhar o funil na Rota Digital."}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-6 px-6 py-6 sm:px-8 sm:py-7">
            <section className="space-y-3.5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <div className="space-y-2">
                  <Label htmlFor="lead-name" className="text-xs font-medium text-zinc-500">
                    Nome completo <span className="text-red-400/90">*</span>
                  </Label>
                  <Input
                    id="lead-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="Ex.: João Silva"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-company" className="text-xs font-medium text-zinc-500">
                    Empresa <span className="text-red-400/90">*</span>
                  </Label>
                  <Input
                    id="lead-company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="Ex.: Tech Solutions"
                    autoComplete="organization"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3.5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <div className="space-y-2">
                  <Label htmlFor="lead-email" className="text-xs font-medium text-zinc-500">
                    E-mail <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <Input
                    id="lead-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="nome@empresa.com"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-phone" className="text-xs font-medium text-zinc-500">
                    Telefone / WhatsApp <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <div className="relative">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="absolute left-2.5 top-1/2 inline-flex h-6 -translate-y-1/2 items-center gap-1 rounded-sm border border-white/10 bg-white/[0.06] px-2 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.11]"
                        title="Selecionar país"
                      >
                        <span aria-hidden>
                          {PHONE_COUNTRIES.find((country) => country.code === phoneCountryCode)?.flag ?? "🌐"}
                        </span>
                        <span>+{phoneCountryCode}</span>
                        <ChevronDown className="size-3 opacity-70" aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-[16rem] p-1.5">
                        {PHONE_COUNTRIES.map((country) => (
                          <DropdownMenuItem
                            key={country.code}
                            className="gap-2 rounded-md py-2"
                            onClick={() => {
                              setPhoneCountryCode(country.code);
                              setPhone((current) => {
                                if (country.code === DEFAULT_PHONE_COUNTRY_CODE) return formatPhoneBr(current);
                                return onlyPhoneDigits(current).slice(0, 15);
                              });
                            }}
                          >
                            <span aria-hidden>{country.flag}</span>
                            <span className="flex-1 text-left">{country.label}</span>
                            <span className="text-xs text-muted-foreground">+{country.code}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Input
                      id="lead-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (phoneCountryCode === DEFAULT_PHONE_COUNTRY_CODE) {
                          setPhone(formatPhoneBr(next));
                          return;
                        }
                        setPhone(onlyPhoneDigits(next).slice(0, 15));
                      }}
                      onPaste={(e) => {
                        const pasted = e.clipboardData.getData("text");
                        if (!pasted) return;
                        e.preventDefault();
                        const digits = onlyPhoneDigits(pasted);
                        if (!digits) return;
                        if (phoneCountryCode === DEFAULT_PHONE_COUNTRY_CODE) {
                          const withoutCountry = stripBrazilCountryCode(pasted, true);
                          setPhone(formatPhoneBr(withoutCountry));
                          return;
                        }
                        const withoutSelectedCode = digits.startsWith(phoneCountryCode)
                          ? digits.slice(phoneCountryCode.length)
                          : digits;
                        setPhone(withoutSelectedCode.slice(0, 15));
                      }}
                      className="h-10 rounded-md border-white/10 bg-white/[0.04] pl-[5.4rem] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                      placeholder={
                        phoneCountryCode === DEFAULT_PHONE_COUNTRY_CODE
                          ? "(11) 99999-9999"
                          : "Digite o telefone"
                      }
                      autoComplete="tel"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-3.5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <div className="space-y-2">
                  <Label htmlFor="lead-website" className="text-xs font-medium text-zinc-500">
                    Site da empresa <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <Input
                    id="lead-website"
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="https://empresa.com.br"
                    autoComplete="url"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-instagram" className="text-xs font-medium text-zinc-500">
                    Instagram <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <Input
                    id="lead-instagram"
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="https://instagram.com/empresa ou @empresa"
                    autoComplete="off"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3.5">
              <div className="space-y-2">
                <Label htmlFor="lead-status" className="text-xs font-medium text-zinc-500">
                  Status atual
                </Label>
                <Select
                  value={status}
                  onValueChange={(val) => {
                    if (val) setStatus(val as LeadStatus);
                  }}
                >
                  <SelectTrigger
                    id="lead-status"
                    className="h-10 w-full rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 focus-visible:border-brand/45 dark:hover:bg-white/[0.06]"
                  >
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent sideOffset={8}>
                    {(() => {
                      const hasRouteForDialog = editingLead
                        ? leadHasGeneratedRoute({
                            reportDocumentExists: false,
                            reportIdOnLead: editingLead.reportId,
                          })
                        : false;
                      return ALL_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} disabled={!isLeadStatusSelectable(s, hasRouteForDialog)}>
                          {s}
                        </SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>
            </section>

            {saveError ? (
              <div
                role="alert"
                className="rounded-md border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-sm font-medium leading-relaxed text-red-300"
              >
                {saveError}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] bg-white/[0.02] px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-8 sm:py-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSaving}
              className="h-10 rounded-md text-zinc-400 hover:bg-white/5 hover:text-zinc-200 sm:min-w-[7rem]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="cta"
              size="lg"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="min-w-[10rem] gap-2"
            >
              {isSaving ? <Loader2 className="size-4 animate-spin shrink-0" aria-hidden /> : null}
              {isSaving ? "A guardar…" : "Salvar lead"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(next) => {
          if (isDeleting) return;
          setDeleteConfirmOpen(next);
          if (!next) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent
          showCloseButton
          className={cn(
            "w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden border-white/10 bg-zinc-950 p-0 text-zinc-100 shadow-2xl sm:max-w-md",
            "rounded-2xl ring-1 ring-white/10",
          )}
        >
          <div className="border-b border-white/[0.06] bg-white/[0.015] px-6 py-5 sm:px-8 sm:py-6">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="font-heading text-lg font-semibold tracking-tight text-white">
                Confirmar exclusão
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-zinc-200">
                Você vai excluir o lead{" "}
                <span className="font-semibold text-white">{deleteTarget?.name ?? "selecionado"}</span> e a rota
                vinculada. Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-3 px-6 py-4 sm:px-8 sm:py-5">
            {deleteError ? (
              <div
                role="alert"
                className="rounded-md border border-red-400/35 bg-red-500/15 px-3.5 py-2.5 text-sm font-medium leading-relaxed text-red-200"
              >
                {deleteError}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] bg-white/[0.02] px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-8 sm:py-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (isDeleting) return;
                setDeleteConfirmOpen(false);
                setDeleteTarget(null);
                setDeleteError(null);
              }}
              disabled={isDeleting}
              className="h-10 rounded-md text-zinc-200 hover:bg-white/10 hover:text-white sm:min-w-[7rem]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={isDeleting || !deleteTarget}
              className="min-w-[10rem] gap-2"
            >
              {isDeleting ? <Loader2 className="size-4 animate-spin shrink-0" aria-hidden /> : null}
              {isDeleting ? "Excluindo…" : "Excluir lead"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={captureOpen}
        onOpenChange={(next) => {
          if (captureBusy) return;
          setCaptureOpen(next);
          if (!next) setCaptureError(null);
        }}
      >
        <DialogContent
          showCloseButton
          className={cn(
            "max-h-[min(92vh,820px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-y-auto overflow-x-hidden border-white/10 bg-zinc-950 p-0 text-zinc-100 shadow-2xl sm:max-w-xl md:max-w-[36rem]",
            "rounded-2xl ring-1 ring-white/10",
          )}
        >
          <div className="relative border-b border-white/[0.06] bg-white/[0.015] px-6 pb-5 pt-6 pr-14 sm:px-8 sm:pb-6 sm:pt-7 sm:pr-16">
            <DialogHeader className="gap-1.5 space-y-0 text-left">
              <DialogTitle className="font-heading text-lg font-semibold tracking-tight text-white sm:text-xl">
                Captura automática (Google Places)
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed text-zinc-300 sm:text-sm">
                Nichos e cidades no Google Places.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 px-6 py-6 sm:px-8 sm:py-7">
            <div className="space-y-2">
              <Label htmlFor="capture-niches" className="text-xs font-medium text-zinc-200">
                Nichos / segmentos <span className="text-red-400">*</span>
              </Label>
              <CaptureTagInput
                id="capture-niches"
                tags={captureNiches}
                onChange={setCaptureNiches}
                placeholder="Ex.: clínica dentária"
                minHeightClassName="min-h-[88px]"
              />
              <p className="text-[11px] leading-relaxed text-zinc-400">
                Pressione Enter ou vírgula para criar cada tag.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="capture-cities" className="text-xs font-medium text-zinc-200">
                Cidades <span className="text-red-400">*</span>
              </Label>
              <CaptureTagInput
                id="capture-cities"
                tags={captureCities}
                onChange={setCaptureCities}
                placeholder="Campinas"
                minHeightClassName="min-h-[72px]"
              />
              <p className="text-[11px] leading-relaxed text-zinc-400">
                Pressione Enter ou vírgula para criar cada cidade.
              </p>
            </div>

            <div className="space-y-4 rounded-xl border border-white/12 bg-white/[0.05] px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex items-end justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="capture-radius" className="text-xs font-medium text-zinc-200">
                    Raio da captação
                  </Label>
                  <p className="text-[12px] leading-relaxed text-zinc-300 sm:text-[13px]">
                    Quanto maior o valor, mais empresas tentamos trazer.
                  </p>
                </div>
                <output
                  htmlFor="capture-radius"
                  className="shrink-0 rounded-full border border-brand/45 bg-brand px-3 py-1.5 text-sm font-bold tabular-nums text-brand-foreground shadow-[0_1px_0_0_rgba(255,255,255,0.12)_inset,0_1px_8px_-2px_rgba(0,0,0,0.35)] ring-1 ring-black/20 dark:border-brand/55 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.14)_inset,0_2px_12px_-2px_rgba(0,0,0,0.45)] dark:ring-white/10"
                >
                  {captureMax} leads
                </output>
              </div>
              <div className="relative pt-1">
                <div
                  className="pointer-events-none absolute left-0 right-0 top-[calc(50%+2px)] h-2 -translate-y-1/2 rounded-full bg-white/18"
                  aria-hidden
                />
                <input
                  id="capture-radius"
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={captureMax}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setCaptureMax(Number.isFinite(v) ? v : 25);
                  }}
                  className={cn(
                    "relative z-[1] h-2 w-full cursor-pointer appearance-none bg-transparent",
                    "[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent",
                    "[&::-webkit-slider-thumb]:mt-[-4px] [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/25 [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-[#8a7a4a] [&::-webkit-slider-thumb]:to-brand [&::-webkit-slider-thumb]:shadow-[0_2px_10px_rgba(0,0,0,0.35)]",
                    "[&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent",
                    "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-white/25 [&::-moz-range-thumb]:bg-gradient-to-br [&::-moz-range-thumb]:from-[#8a7a4a] [&::-moz-range-thumb]:to-brand [&::-moz-range-thumb]:shadow-[0_2px_10px_rgba(0,0,0,0.35)]",
                  )}
                  aria-valuemin={1}
                  aria-valuemax={50}
                  aria-valuenow={captureMax}
                  aria-valuetext={`${captureMax} leads`}
                />
              </div>
              <div className="flex justify-between text-xs font-semibold tabular-nums tracking-wide text-zinc-400">
                <span>1</span>
                <span>50</span>
              </div>
            </div>

            {captureError ? (
              <div
                role="alert"
                className="rounded-md border border-red-400/35 bg-red-500/15 px-3.5 py-2.5 text-sm font-medium leading-relaxed text-red-200"
              >
                {captureError}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] bg-white/[0.02] px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-8 sm:py-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCaptureOpen(false)}
              disabled={captureBusy}
              className="h-10 rounded-md text-zinc-200 hover:bg-white/10 hover:text-white sm:min-w-[7rem]"
            >
              Fechar
            </Button>
            <Button
              type="button"
              variant="cta"
              size="lg"
              disabled={captureBusy}
              onClick={() => void runCapture()}
              className="min-w-[10rem] gap-2"
            >
              {captureBusy ? <Loader2 className="size-4 animate-spin shrink-0" aria-hidden /> : null}
              {captureBusy ? "A capturar…" : "Iniciar captura"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <LeadCaptureProgressOverlay open={captureBusy} progress={captureProgress} hint={captureOverlayHint} />

      <Dialog open={captureNoticeOpen} onOpenChange={setCaptureNoticeOpen}>
        <DialogContent
          showCloseButton
          className={cn(
            "w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden border-white/10 bg-zinc-950 p-0 text-zinc-100 shadow-2xl sm:max-w-md",
            "rounded-2xl ring-1 ring-white/10",
          )}
        >
          <div className="border-b border-white/[0.06] bg-white/[0.015] px-6 py-5 sm:px-8 sm:py-6">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="font-heading text-lg font-semibold tracking-tight text-white">
                Resultado da captura
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-zinc-200">
                {captureNoticeMessage}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex justify-end border-t border-white/[0.06] bg-white/[0.02] px-6 py-4 sm:px-8 sm:py-5">
            <Button type="button" variant="cta" size="lg" onClick={() => setCaptureNoticeOpen(false)}>
              Entendi
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl dark:border-white/5 dark:bg-white/[0.02]">
        <div className="border-b border-border px-4 py-4 dark:border-white/5 sm:px-6">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center sm:gap-3">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="leads-table-search"
                  name="leads_table_search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome, empresa, e-mail ou telefone…"
                  className="h-10 w-full rounded-md border-input bg-background pl-9 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-brand/50 focus-visible:ring-brand/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                  aria-label="Buscar leads"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                />
                {search.trim() ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Limpar busca"
                    title="Limpar busca"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>
              <Select
                value={statusFilter}
                onValueChange={(val) => {
                  if (val) setStatusFilter(val as StatusFilter);
                }}
              >
                <SelectTrigger
                  className="w-full font-medium sm:w-[14rem] sm:shrink-0"
                  aria-label="Filtrar por status do funil"
                >
                  <SelectValue placeholder="Todos os status">{statusFilterLabel(statusFilter)}</SelectValue>
                </SelectTrigger>
                <SelectContent align="start" className="max-h-72">
                  <SelectItem value={STATUS_FILTER_TODOS}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full bg-zinc-400/80 ring-1 ring-black/8 dark:bg-zinc-500 dark:ring-white/10"
                        aria-hidden
                      />
                      Todos os status
                    </span>
                  </SelectItem>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full ring-1 ring-black/8 dark:ring-white/10",
                            LEAD_STATUS_MENU_DOT_CLASSES[s],
                          )}
                          aria-hidden
                        />
                        {s}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {leads.length > 0 ? (
              <p className="text-[11px] leading-snug text-muted-foreground sm:text-xs">
                {hasActiveFilters ? (
                  <>
                    <span className="text-foreground/80">
                      {filteredLeads.length} de {leads.length}
                    </span>{" "}
                    {leads.length === 1 ? "lead encontrado" : "leads encontrados"}
                    {filteredLeads.length > 0 && pageCount > 1 ? (
                      <>
                        {" "}
                        · página {safePage} de {pageCount}
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="text-foreground/80">{leads.length}</span>{" "}
                    {leads.length === 1 ? "lead no total" : "leads no total"}
                    {filteredLeads.length > 0 && pageCount > 1 ? (
                      <>
                        {" "}
                        · página {safePage} de {pageCount}
                      </>
                    ) : null}
                  </>
                )}
              </p>
            ) : null}
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center items-center py-24">
            <Loader2 className="animate-spin text-muted-foreground" size={40} />
          </div>
        ) : (
          <Table ref={leadsTableRef} className="table-fixed">
            <colgroup>
              {leadTableColWidthsPct.map((pct, i) => (
                <col key={i} style={{ width: `${pct}%` }} />
              ))}
            </colgroup>
            <TableHeader>
              <TableRow className="border-border bg-muted/40 hover:bg-transparent dark:border-white/5 dark:bg-white/[0.03]">
                <TableHead className="relative h-auto py-3 pl-6 pr-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Followup
                  <LeadTableColumnResizeHandle
                    leftColumnIndex={0}
                    onResizerMouseDown={onLeadTableColResizeMouseDown}
                  />
                </TableHead>
                <TableHead className="relative h-auto px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Nome
                  <LeadTableColumnResizeHandle
                    leftColumnIndex={1}
                    onResizerMouseDown={onLeadTableColResizeMouseDown}
                  />
                </TableHead>
                <TableHead className="relative h-auto px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Empresa
                  <LeadTableColumnResizeHandle
                    leftColumnIndex={2}
                    onResizerMouseDown={onLeadTableColResizeMouseDown}
                  />
                </TableHead>
                <TableHead className="relative h-auto px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  E-mail
                  <LeadTableColumnResizeHandle
                    leftColumnIndex={3}
                    onResizerMouseDown={onLeadTableColResizeMouseDown}
                  />
                </TableHead>
                <TableHead className="relative h-auto px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Telefone/Whatsapp
                  <LeadTableColumnResizeHandle
                    leftColumnIndex={4}
                    onResizerMouseDown={onLeadTableColResizeMouseDown}
                  />
                </TableHead>
                <TableHead className="relative h-auto px-3 py-3 align-middle text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Status
                  <LeadTableColumnResizeHandle
                    leftColumnIndex={5}
                    onResizerMouseDown={onLeadTableColResizeMouseDown}
                  />
                </TableHead>
                <TableHead className="h-auto min-w-[3rem] py-3 pl-3 pr-6 align-middle" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow className="border-b-0 hover:bg-transparent">
                  <TableCell colSpan={7} className="text-center py-24">
                    <div className="flex flex-col items-center gap-3">
                      <Users className="size-12 text-muted-foreground/50" />
                      <p className="font-medium text-muted-foreground">Nenhum lead encontrado.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredLeads.length === 0 ? (
                <TableRow className="border-b-0 hover:bg-transparent">
                  <TableCell colSpan={7} className="text-center py-16">
                    <p className="font-medium text-muted-foreground">
                      Nenhum lead corresponde à busca ou ao status selecionado.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setStatusFilter(STATUS_FILTER_TODOS);
                      }}
                      className="mt-3 text-sm font-semibold text-brand hover:text-brand/90 dark:text-brand dark:hover:text-brand"
                    >
                      Limpar filtros
                    </button>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLeads.map((lead) => {
                  const rowHasRoute = leadHasGeneratedRoute({
                    reportDocumentExists: false,
                    reportIdOnLead: lead.reportId,
                  });
                  const websiteHref = normalizeWebsiteHref(lead.websiteUrl);
                  const instagramHref = normalizeInstagramHref(lead.instagramUrl);
                  return (
                  <TableRow
                    key={lead.id}
                    className="border-border transition-colors hover:bg-muted/50 dark:border-white/5 dark:hover:bg-white/[0.06] group"
                  >
                    <TableCell className="py-4 pl-6 pr-3 align-middle">
                      <LeadFollowupCell lead={lead} />
                    </TableCell>
                    <TableCell className="px-3 py-4 align-middle">
                      <Link
                        href={`/dashboard/leads/${lead.id}`}
                        className="block truncate text-base font-bold text-foreground transition-colors hover:text-brand dark:hover:text-brand"
                      >
                        {lead.name}
                      </Link>
                    </TableCell>
                    <TableCell className="px-3 py-4 align-middle">
                      <div className="flex w-full min-w-0 items-center gap-2">
                        <span
                          className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90"
                          title={lead.company}
                        >
                          {lead.company}
                        </span>
                        <div className="inline-flex shrink-0 items-center gap-1.5">
                        {websiteHref ? (
                          <a
                            href={websiteHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex size-[20px] shrink-0 items-center justify-center rounded-md border border-sky-500/35 bg-sky-500/12 text-sky-300 transition-colors hover:border-sky-400/45 hover:bg-sky-500/20 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400/40"
                            aria-label={`Abrir site de ${lead.company}`}
                            title="Abrir website"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Globe className="size-3" aria-hidden />
                          </a>
                        ) : (
                          <span
                            className="inline-flex size-[20px] shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/35 text-muted-foreground/45"
                            aria-hidden
                            title="Website não cadastrado"
                          >
                            <Globe className="size-3" aria-hidden />
                          </span>
                        )}
                        {instagramHref ? (
                          <a
                            href={instagramHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex size-[20px] shrink-0 items-center justify-center rounded-md border border-pink-300/45 bg-gradient-to-r from-fuchsia-500/[0.07] via-rose-500/[0.08] to-amber-500/[0.07] text-pink-600 transition-colors hover:border-pink-300/65 hover:from-fuchsia-500/[0.11] hover:via-rose-500/[0.12] hover:to-amber-500/[0.11] hover:text-pink-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pink-500/40 dark:border-pink-500/28 dark:from-fuchsia-500/[0.11] dark:via-rose-500/[0.10] dark:to-amber-500/[0.09] dark:text-pink-400"
                            aria-label={`Abrir Instagram de ${lead.company}`}
                            title="Abrir Instagram"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <InstagramBrandGlyph className="size-3" aria-hidden />
                          </a>
                        ) : null}
                        {!instagramHref ? (
                          <span
                            className="inline-flex size-[20px] shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/35 text-muted-foreground/45"
                            aria-hidden
                            title="Instagram não cadastrado"
                          >
                            <InstagramBrandGlyph className="size-3" aria-hidden />
                          </span>
                        ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-4 align-middle">
                      <span className="block truncate text-sm font-medium text-foreground/90">{lead.email || "Sem e-mail"}</span>
                    </TableCell>
                    <TableCell className="min-w-0 px-3 py-4 align-middle">
                      <LeadTablePhoneCell
                        leadId={lead.id}
                        phone={lead.phone}
                        lastCopiedLeadId={lastPhoneCopyLeadId}
                        onPhoneCopied={() => setLastPhoneCopyLeadId(lead.id)}
                      />
                    </TableCell>
                    <TableCell className="px-3 py-4 align-middle">
                      <div className="inline-flex max-w-full items-center gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            title="Alterar status"
                            className={cn(
                              "group/badge inline-flex h-5 min-h-5 w-fit max-w-full min-w-0 shrink cursor-pointer items-center justify-center gap-1 overflow-hidden rounded-md px-2.5 py-0.5 text-left text-[10px] font-bold uppercase tracking-wider shadow-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:focus-visible:ring-ring/40",
                              leadStatusDropdownTriggerSurface(lead.status),
                            )}
                          >
                            <span
                              className={cn(
                                "mr-0.5 h-1.5 w-1.5 shrink-0 rounded-full",
                                LEAD_STATUS_DOT_CLASSES[lead.status],
                              )}
                              aria-hidden
                            />
                            <span className="min-w-0 truncate">{lead.status}</span>
                            <ChevronDown className="size-3 shrink-0 opacity-70" aria-hidden />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="min-w-[13.5rem] p-1.5">
                            <div className="px-2 pb-1.5 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Status do funil
                            </div>
                            {ALL_STATUSES.map((s) => (
                              <DropdownMenuItem
                                key={s}
                                disabled={
                                  lead.status === s || !isLeadStatusSelectable(s, rowHasRoute)
                                }
                                className="gap-2.5 rounded-md py-2"
                                onClick={() => void handleLeadStatusChange(lead, s)}
                              >
                                <span
                                  className={cn(
                                    "size-2 shrink-0 rounded-full ring-1 ring-black/8 dark:ring-white/10",
                                    LEAD_STATUS_MENU_DOT_CLASSES[s],
                                  )}
                                  aria-hidden
                                />
                                <span className="min-w-0 flex-1 text-left">{s}</span>
                                {lead.status === s ? (
                                  <span className="text-[10px] font-medium uppercase text-muted-foreground">
                                    atual
                                  </span>
                                ) : null}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <LeadTableSharedRouteLink
                          lead={lead}
                          rowHasRoute={rowHasRoute}
                          publicSlugByReportId={publicSlugByReportId}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="py-4 pl-3 pr-6 text-right align-middle">
                     <DropdownMenu>
                        <DropdownMenuTrigger
                          title="Mais opções"
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "icon" }),
                            "h-9 w-9 rounded-lg p-0 text-muted-foreground transition-all hover:bg-muted hover:text-foreground dark:hover:bg-white/10 dark:hover:text-white",
                          )}
                        >
                          <MoreHorizontal className="h-5 w-5" aria-hidden />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[168px]">
                          <DropdownMenuItem onClick={() => (window.location.href = `/dashboard/leads/${lead.id}`)}>
                            Ver Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openForm(lead)}>Editar Lead</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => openDeleteConfirm(lead)}>
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
        {!loading && filteredLeads.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 dark:border-white/5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-xs text-muted-foreground">
              Mostrando{" "}
              <span className="font-medium text-foreground/85">
                {pageSliceStart + 1}–{Math.min(pageSliceStart + pageSize, filteredLeads.length)}
              </span>{" "}
              de{" "}
              <span className="font-medium text-foreground/85">
                {filteredLeads.length}
              </span>
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Exibir</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(val) => {
                    const next = Number(val);
                    if (PAGE_SIZE_OPTIONS.includes(next as (typeof PAGE_SIZE_OPTIONS)[number])) {
                      setPageSize(next);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 w-[6.5rem]" aria-label="Quantidade de leads por página">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {pageCount > 1 ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="h-9 gap-1 rounded-xl border-border bg-background dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06] disabled:opacity-40"
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                    Anterior
                  </Button>
                  <span className="min-w-[5.5rem] text-center text-xs font-medium text-muted-foreground">
                    {safePage} / {pageCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safePage >= pageCount}
                    onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
                    className="h-9 gap-1 rounded-xl border-border bg-background dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06] disabled:opacity-40"
                  >
                    Próxima
                    <ChevronRight className="size-4" aria-hidden />
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] w-full items-center justify-center text-muted-foreground">
          <Loader2 className="size-8 shrink-0 animate-spin" aria-hidden />
        </div>
      }
    >
      <LeadsPageContent />
    </Suspense>
  );
}
