"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, FilePlus, FileText, Loader2, Repeat2, Search, Sparkles, UserPlus } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { createEmptyProposalPlan } from "@/lib/proposal-plan-factory";
import { normalizeInstallmentCount } from "@/lib/proposal-plan-installments";
import { clonePlansForNewProposal, normalizeRecurringPlansForSave } from "@/lib/proposal-plan-coerce";
import { createLead, getLeads } from "@/lib/leads";
import { getReportByLead } from "@/lib/reports";
import {
  resolveCompanyAboutNameForSave,
  resolveCompanyAboutSummaryForSave,
} from "@/lib/company-about-defaults";
import { getUserCompanyAboutSettings } from "@/lib/user-settings";
import { newProposalPublicSlug } from "@/lib/proposals";
import { ProposalPlanSectionEditor } from "@/components/propostas/proposal-plan-section-editor";
import { normalizePlanPaymentMethods, sortPaymentMethods } from "@/components/propostas/plan-payment-methods";
import type { Proposal, ProposalPaymentMethodId, ProposalPlan } from "@/types/proposal";
import type { UserCompanyAboutSettings } from "@/types/user-settings";
import { LEAD_STATUSES, type Lead, type LeadStatus } from "@/types/lead";
import type { RotaDigitalReport } from "@/types/report";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { isLeadStatusSelectable } from "@/lib/lead-status-rules";
import { PlanLimitModal, type PlanLimitModalState } from "@/components/limits/plan-limit-modal";
import { normalizedSubscriptionPlanKey } from "@/lib/plan-quotas";

function futureDateIso(daysAhead: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

function isoToBrDate(value: string): string {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return "";
  return `${day}/${month}/${year}`;
}

function formatBrDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseBrDateInputToMillis(value: string): number | null {
  const [dayRaw, monthRaw, yearRaw] = value.split("/");
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  if (!day || !month || !year || yearRaw?.length !== 4) return null;
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed.getTime();
}

function parseDateInputToMillis(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return Date.now();
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
}

function diffDaysFromToday(targetMs: number): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.ceil((targetMs - now.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(1, diff);
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function optionalTrimmed(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function formatLeadLabel(lead: Pick<Lead, "name" | "company">): string {
  const name = lead.name.trim();
  const company = lead.company.trim();

  if (!name) return company;
  if (!company) return name;

  const normalizedName = normalizeSearchText(name);
  const normalizedCompany = normalizeSearchText(company);

  if (normalizedName === normalizedCompany) return name;
  if (normalizedName.includes(normalizedCompany)) return name;
  if (normalizedCompany.includes(normalizedName)) return company;

  return `${name} - ${company}`;
}

function newPlan(): ProposalPlan {
  return createEmptyProposalPlan();
}

function planHasContent(plan: ProposalPlan): boolean {
  return Boolean(
    plan.title.trim() ||
      plan.deliverables.trim() ||
      plan.price.trim() ||
      plan.promotionalPrice?.trim() ||
      plan.cashPrice?.trim() ||
      plan.paymentTerms.trim() ||
      (plan.paymentMethods?.length ?? 0) > 0,
  );
}

function leadImageFromRoute(report: RotaDigitalReport | null): string {
  return (
    report?.evidences?.instagramProfileImageUrl?.trim() ||
    report?.evidences?.instagramSnapshotUrl?.trim() ||
    report?.evidences?.logoImageUrl?.trim() ||
    ""
  );
}

export default function NewProposalPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [loadingContext, setLoadingContext] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitModalState, setLimitModalState] = useState<PlanLimitModalState | null>(null);

  const [leadId, setLeadId] = useState("");
  const [leadQuery, setLeadQuery] = useState("");
  const [leadSearchOpen, setLeadSearchOpen] = useState(false);
  const [leadComboUnlocked, setLeadComboUnlocked] = useState(false);
  const [isLeadDialogOpen, setIsLeadDialogOpen] = useState(false);
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadCompany, setNewLeadCompany] = useState("");
  const [newLeadEmail, setNewLeadEmail] = useState("");
  const [newLeadPhone, setNewLeadPhone] = useState("");
  const [newLeadWebsite, setNewLeadWebsite] = useState("");
  const [newLeadInstagram, setNewLeadInstagram] = useState("");
  const [newLeadStatus, setNewLeadStatus] = useState<LeadStatus>("Novo Lead");
  const [newLeadSaving, setNewLeadSaving] = useState(false);
  const [newLeadError, setNewLeadError] = useState<string | null>(null);
  const [linkedReport, setLinkedReport] = useState<RotaDigitalReport | null>(null);
  const [validUntilInput, setValidUntilInput] = useState(isoToBrDate(futureDateIso(7)));
  const [spotPlans, setSpotPlans] = useState<ProposalPlan[]>([newPlan()]);
  const [recurringPlans, setRecurringPlans] = useState<ProposalPlan[]>([newPlan()]);

  const [companyAboutSettings, setCompanyAboutSettings] = useState<UserCompanyAboutSettings | null>(null);
  const [stripeConnected, setStripeConnected] = useState(false);
  const plansSeededRef = useRef(false);

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === leadId) ?? null,
    [leads, leadId],
  );

  const leadSuggestions = useMemo(() => {
    const query = normalizeSearchText(leadQuery);
    if (!query) {
      return [...leads]
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 5);
    }
    return leads
      .filter((lead) => {
        const haystack = normalizeSearchText(
          `${lead.name} ${lead.company} ${lead.email} ${lead.phone || ""} ${lead.websiteUrl || ""} ${lead.instagramUrl || ""}`,
        );
        return haystack.includes(query);
      })
      .slice(0, 8);
  }, [leads, leadQuery]);

  useEffect(() => {
    const leadIdFromQuery = searchParams.get("leadId");
    if (leadIdFromQuery) setLeadId(leadIdFromQuery);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedLead) {
      if (!leadQuery.trim()) return;
      return;
    }
    setLeadQuery(formatLeadLabel(selectedLead));
  }, [selectedLead?.id]);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoadingLeads(true);
      try {
        const data = await getLeads(user.uid);
        setLeads(data);
      } catch (e) {
        console.error(e);
        setError("Não foi possível carregar os leads.");
      } finally {
        setLoadingLeads(false);
      }
    };
    void load();
  }, [user]);

  useEffect(() => {
    const loadContext = async () => {
      if (!user) return;
      setLoadingContext(true);
      try {
        const [companyAbout, report, settingsSnap] = await Promise.all([
          getUserCompanyAboutSettings(user.uid),
          leadId ? getReportByLead(leadId, user.uid) : Promise.resolve(null),
          getDoc(doc(db, "userSettings", user.uid)),
        ]);
        setCompanyAboutSettings(companyAbout);
        setLinkedReport(report);
        if (settingsSnap.exists()) {
          const data = settingsSnap.data() as Record<string, unknown>;
          setStripeConnected(typeof data.stripeConnectAccountId === "string" && data.stripeConnectAccountId.length > 0);
        }

        if (!plansSeededRef.current) {
          plansSeededRef.current = true;
          const spotTpl = companyAbout?.defaultSpotPlans ?? [];
          const recTpl = companyAbout?.defaultRecurringPlans ?? [];
          setSpotPlans(spotTpl.length > 0 ? clonePlansForNewProposal(spotTpl) : [newPlan()]);
          setRecurringPlans(
            recTpl.length > 0 ? normalizeRecurringPlansForSave(clonePlansForNewProposal(recTpl)) : [newPlan()],
          );
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingContext(false);
      }
    };
    void loadContext();
  }, [leadId, user]);

  const updatePlan = (
    kind: "spot" | "recurring",
    planId: string,
    field: keyof ProposalPlan,
    value: string,
  ) => {
    const setter = kind === "spot" ? setSpotPlans : setRecurringPlans;
    setter((prev) =>
      prev.map((plan) => (plan.id === planId ? { ...plan, [field]: value } : plan)),
    );
  };

  const updatePlanPaymentMethods = (
    kind: "spot" | "recurring",
    planId: string,
    methods: ProposalPaymentMethodId[],
  ) => {
    const setter = kind === "spot" ? setSpotPlans : setRecurringPlans;
    const next = sortPaymentMethods(methods);
    setter((prev) =>
      prev.map((plan) => (plan.id === planId ? { ...plan, paymentMethods: next } : plan)),
    );
  };

  const updatePlanInstallmentCount = (kind: "spot" | "recurring", planId: string, count: number) => {
    const setter = kind === "spot" ? setSpotPlans : setRecurringPlans;
    const n = normalizeInstallmentCount(count);
    setter((prev) =>
      prev.map((plan) =>
        plan.id === planId
          ? { ...plan, installmentCount: n, ...(n <= 1 ? { cashPrice: "" } : {}) }
          : plan,
      ),
    );
  };

  const addPlan = (kind: "spot" | "recurring") => {
    const setter = kind === "spot" ? setSpotPlans : setRecurringPlans;
    setter((prev) => [...prev, newPlan()]);
  };

  const removePlan = (kind: "spot" | "recurring", planId: string) => {
    const setter = kind === "spot" ? setSpotPlans : setRecurringPlans;
    setter((prev) => (prev.length <= 1 ? prev : prev.filter((plan) => plan.id !== planId)));
  };

  const openCreateLeadDialog = () => {
    setNewLeadName(leadQuery.trim());
    setNewLeadCompany("");
    setNewLeadEmail("");
    setNewLeadPhone("");
    setNewLeadWebsite("");
    setNewLeadInstagram("");
    setNewLeadStatus("Novo Lead");
    setNewLeadError(null);
    setIsLeadDialogOpen(true);
    setLeadSearchOpen(false);
  };

  const handleCreateLead = async () => {
    if (!user) return;
    if (!newLeadName.trim() || !newLeadCompany.trim()) {
      setNewLeadError("Nome e empresa são obrigatórios.");
      return;
    }
    if (!isLeadStatusSelectable(newLeadStatus, false)) {
      setNewLeadError("O status Rota Gerada só fica disponível depois de gerar o relatório.");
      return;
    }
    setNewLeadSaving(true);
    setNewLeadError(null);
    try {
      const newId = await createLead({
        userId: user.uid,
        name: newLeadName.trim(),
        company: newLeadCompany.trim(),
        email: newLeadEmail.trim(),
        phone: newLeadPhone.trim(),
        websiteUrl: newLeadWebsite.trim(),
        instagramUrl: newLeadInstagram.trim(),
        status: newLeadStatus,
      });
      const freshLeads = await getLeads(user.uid);
      setLeads(freshLeads);
      const created = freshLeads.find((lead) => lead.id === newId) ?? null;
      if (created) {
        setLeadId(created.id);
        setLeadQuery(formatLeadLabel(created));
      } else {
        setLeadId(newId);
      }
      setIsLeadDialogOpen(false);
    } catch (e) {
      console.error(e);
      setNewLeadError("Não foi possível salvar o lead agora.");
    } finally {
      setNewLeadSaving(false);
    }
  };

  const handleSave = async () => {
    if (!user || !selectedLead) {
      setError("Selecione um lead para continuar.");
      return;
    }

    const cleanSpotPlans = spotPlans.filter(planHasContent).map((p) => {
      const url = p.paymentUrl?.trim();
      return { ...p, paymentUrl: url && url.startsWith("https://") ? url : undefined };
    });
    const cleanRecurringPlans = recurringPlans.filter(planHasContent).map((p) => {
      const url = p.paymentUrl?.trim();
      return { ...p, paymentUrl: url && url.startsWith("https://") ? url : undefined };
    });
    if (!cleanSpotPlans.length && !cleanRecurringPlans.length) {
      setError("Preencha pelo menos um plano na proposta.");
      return;
    }

    const allPlans = [...cleanSpotPlans, ...cleanRecurringPlans];
    const invalidUrl = allPlans.find((p) => {
      const raw = spotPlans.concat(recurringPlans).find((o) => o.id === p.id)?.paymentUrl?.trim();
      return raw && !raw.startsWith("https://");
    });
    if (invalidUrl) {
      setError("Links de pagamento devem iniciar com https://");
      return;
    }

    const validUntilDate = parseBrDateInputToMillis(validUntilInput);
    if (!validUntilDate) {
      setError("Informe a validade no formato 22/04/2026.");
      return;
    }
    const validUntilDays = diffDaysFromToday(validUntilDate);
    const companyName = resolveCompanyAboutNameForSave(companyAboutSettings?.companyName);
    const companySummary = resolveCompanyAboutSummaryForSave(companyAboutSettings?.companySummary);

    const leadSnapshot = {
      name: selectedLead.name,
      company: selectedLead.company,
      email: selectedLead.email,
      ...(optionalTrimmed(selectedLead.phone) ? { phone: optionalTrimmed(selectedLead.phone) } : {}),
      ...(optionalTrimmed(selectedLead.websiteUrl)
        ? { websiteUrl: optionalTrimmed(selectedLead.websiteUrl) }
        : {}),
      ...(optionalTrimmed(selectedLead.instagramUrl)
        ? { instagramUrl: optionalTrimmed(selectedLead.instagramUrl) }
        : {}),
    };

    const agencySnapshot = {
      companyName,
      companySummary,
      ...(optionalTrimmed(companyAboutSettings?.primaryImageUrl)
        ? { primaryImageUrl: optionalTrimmed(companyAboutSettings?.primaryImageUrl) }
        : {}),
      ...(optionalTrimmed(companyAboutSettings?.secondaryImageUrl)
        ? { secondaryImageUrl: optionalTrimmed(companyAboutSettings?.secondaryImageUrl) }
        : {}),
      ...(optionalTrimmed(companyAboutSettings?.companyPhone)
        ? { companyPhone: optionalTrimmed(companyAboutSettings?.companyPhone) }
        : {}),
      ...(optionalTrimmed(companyAboutSettings?.whatsApp)
        ? { whatsApp: optionalTrimmed(companyAboutSettings?.whatsApp) }
        : {}),
      ...(optionalTrimmed(companyAboutSettings?.address)
        ? { address: optionalTrimmed(companyAboutSettings?.address) }
        : {}),
      ...(optionalTrimmed(companyAboutSettings?.websiteUrl)
        ? { websiteUrl: optionalTrimmed(companyAboutSettings?.websiteUrl) }
        : {}),
      ...(optionalTrimmed(companyAboutSettings?.instagramUrl)
        ? { instagramUrl: optionalTrimmed(companyAboutSettings?.instagramUrl) }
        : {}),
      ...(optionalTrimmed(companyAboutSettings?.youtubeUrl)
        ? { youtubeUrl: optionalTrimmed(companyAboutSettings?.youtubeUrl) }
        : {}),
      ...(optionalTrimmed(companyAboutSettings?.services)
        ? { services: optionalTrimmed(companyAboutSettings?.services) }
        : {}),
    };

    const evidences = {
      ...(optionalTrimmed(leadImageFromRoute(linkedReport))
        ? { leadImageUrl: optionalTrimmed(leadImageFromRoute(linkedReport)) }
        : {}),
      ...(optionalTrimmed(
        companyAboutSettings?.primaryImageUrl?.trim() ||
          companyAboutSettings?.secondaryImageUrl?.trim() ||
          "",
      )
        ? {
            agencyImageUrl: optionalTrimmed(
              companyAboutSettings?.primaryImageUrl?.trim() ||
                companyAboutSettings?.secondaryImageUrl?.trim() ||
                "",
            ),
          }
        : {}),
    };

    const proposalPayload: Omit<Proposal, "id"> = {
      leadId: selectedLead.id,
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      publicSlug: newProposalPublicSlug(),
      title: `Proposta para ${selectedLead.company}`,
      validUntilDays,
      validUntilDate,
      lead: leadSnapshot,
      spotPlans: cleanSpotPlans,
      recurringPlans: normalizeRecurringPlansForSave(cleanRecurringPlans),
      companyProfile: linkedReport
        ? {
            source: "route",
            routeReportId: linkedReport.id,
            companyProfile: linkedReport.companyProfile || "",
            executiveSummary: linkedReport.executiveSummary || "",
            strengths: linkedReport.strengths || [],
            weaknesses: linkedReport.weaknesses || [],
            opportunities: linkedReport.opportunities || [],
          }
        : {
            source: "empty",
            companyProfile: "",
            executiveSummary: "",
            strengths: [],
            weaknesses: [],
            opportunities: [],
          },
      agencySnapshot,
      ...(Object.keys(evidences).length ? { evidences } : {}),
    };

    setSaving(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/proposals-create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ proposal: proposalPayload }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        plan?: string;
        monthlyLimit?: number;
        usedThisMonth?: number;
        proposalId?: string;
      };
      if (response.status === 429 && payload.code === "PROPOSTAS_LIMIT_REACHED") {
        setLimitModalState({
          kind: "propostas",
          plan: normalizedSubscriptionPlanKey(payload.plan ?? "pro"),
          monthlyLimit: payload.monthlyLimit,
          usedThisMonth: payload.usedThisMonth,
        });
        return;
      }
      if (!response.ok || !payload.proposalId) {
        throw new Error(payload.error || "Não foi possível gerar a proposta agora.");
      }
      const proposalId = payload.proposalId;
      router.push(`/dashboard/propostas/${proposalId}`);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Não foi possível gerar a proposta agora.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <PlanLimitModal
        state={limitModalState}
        onClose={() => setLimitModalState(null)}
        getIdToken={user ? () => user.getIdToken() : undefined}
      />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Gerar Proposta
        </h1>
        <p className="max-w-3xl text-base text-muted-foreground">
          Monte a proposta comercial com planos pontuais e recorrentes. O perfil da empresa será puxado da rota existente do lead quando ela existir.
        </p>
      </div>

      <Card className="overflow-hidden border-border bg-card shadow-xl dark:border-white/5 dark:bg-white/[0.02]">
        <CardHeader className="border-b border-border pb-5 dark:border-white/5">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-md bg-brand/10 ring-1 ring-brand/20">
              <Sparkles className="size-4 text-brand" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-xl font-bold leading-tight text-foreground">Briefing da proposta</CardTitle>
              <CardDescription className="mt-1 text-sm leading-snug text-muted-foreground">
                Escolha o lead e confirme o contexto base da proposta.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.65fr)_15rem]">
            <div className="space-y-2">
              <Label htmlFor="proposal-new-lead-combobox">Lead</Label>
              <form className="contents" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="proposal-new-lead-combobox"
                    name="proposal_lead_search"
                    value={leadQuery}
                    readOnly={!leadComboUnlocked}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                    aria-autocomplete="list"
                    aria-expanded={leadSearchOpen}
                    aria-controls="proposal-new-lead-suggestions"
                    role="combobox"
                    onChange={(e) => {
                      setLeadQuery(e.target.value);
                      setLeadSearchOpen(true);
                      if (!e.target.value.trim()) setLeadId("");
                    }}
                    onFocus={() => {
                      setLeadComboUnlocked(true);
                      setLeadSearchOpen(true);
                    }}
                    onBlur={() => {
                      window.setTimeout(() => setLeadSearchOpen(false), 120);
                    }}
                    placeholder={loadingLeads ? "Carregando leads…" : "Digite o nome da empresa ou do lead"}
                    className="h-10 pl-9"
                  />
                  {leadSearchOpen ? (
                    <div
                      id="proposal-new-lead-suggestions"
                      className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-background shadow-lg"
                      role="listbox"
                    >
                      {leadSuggestions.length > 0 ? (
                        <div className="max-h-64 overflow-y-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          {leadSuggestions.map((lead) => (
                            <button
                              key={lead.id}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setLeadId(lead.id);
                                setLeadQuery(formatLeadLabel(lead));
                                setLeadSearchOpen(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-muted/60"
                            >
                              <span className="block font-medium">{lead.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {lead.company}
                                {lead.email ? ` · ${lead.email}` : ""}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          Nenhum lead encontrado para essa busca.
                        </p>
                      )}
                      <div className="border-t border-border/70 p-2">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={openCreateLeadDialog}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-muted/60"
                        >
                          <UserPlus className="size-4 text-brand" aria-hidden />
                          Adicionar novo lead
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </form>
            </div>

            <div className="space-y-2">
              <Label htmlFor="proposal-valid-until">Validade</Label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="proposal-valid-until"
                  type="text"
                  value={validUntilInput}
                  inputMode="numeric"
                  onChange={(e) => setValidUntilInput(formatBrDateInput(e.target.value))}
                  placeholder="22/04/2026"
                  className="h-10 pl-9"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-border bg-background/70 p-5 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Perfil da empresa
              </p>
              {loadingContext ? (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Carregando contexto…</p>
              ) : linkedReport?.companyProfile?.trim() ? (
                <>
                  <p className="mt-3 text-sm leading-relaxed text-foreground">
                    {linkedReport.companyProfile.trim()}
                  </p>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    Esse conteúdo foi encontrado na rota existente do lead e será usado como base inicial da proposta.
                  </p>
                </>
              ) : linkedReport ? (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Encontramos uma rota existente para este lead, mas ela não tem texto preenchido em perfil da empresa. O bloco ficará editável na proposta.
                </p>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Este lead ainda não tem rota gerada. O perfil da empresa ficará vazio no início, mas poderá ser editado manualmente na proposta.
                </p>
              )}
            </div>

            <div className="rounded-md border border-border bg-background/70 p-5 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Sobre a empresa
              </p>
              {companyAboutSettings?.companyName?.trim() || companyAboutSettings?.companySummary?.trim() ? (
                <>
                  {companyAboutSettings?.companyName?.trim() ? (
                    <p className="mt-3 text-sm font-semibold text-foreground">
                      {companyAboutSettings.companyName.trim()}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {companyAboutSettings?.companySummary?.trim() ||
                      "As informações institucionais da empresa serão usadas nesta proposta."}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Ainda não há um bloco institucional salvo. Você pode configurar isso em Configurações &gt; Sobre a Empresa.
                </p>
              )}
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ProposalPlanSectionEditor
        accent="spot"
        title="Execução pontual"
        description="Planos fechados por escopo, com entregáveis e investimento definidos."
        icon={FileText}
        plans={spotPlans}
        onChange={(planId, field, value) => updatePlan("spot", planId, field, value)}
        onInstallmentCountChange={(planId, count) => updatePlanInstallmentCount("spot", planId, count)}
        onPaymentMethodsChange={(planId, methods) => updatePlanPaymentMethods("spot", planId, methods)}
        onAdd={() => addPlan("spot")}
        onRemove={(planId) => removePlan("spot", planId)}
        stripeConnected={stripeConnected}
      />

      <ProposalPlanSectionEditor
        accent="emerald"
        title="Execução recorrente"
        description="Planos de acompanhamento contínuo com frequência e valor recorrente."
        icon={Repeat2}
        plans={recurringPlans}
        hideInstallments
        onChange={(planId, field, value) => updatePlan("recurring", planId, field, value)}
        onInstallmentCountChange={(planId, count) => updatePlanInstallmentCount("recurring", planId, count)}
        onPaymentMethodsChange={(planId, methods) => updatePlanPaymentMethods("recurring", planId, methods)}
        onAdd={() => addPlan("recurring")}
        onRemove={(planId) => removePlan("recurring", planId)}
        stripeConnected={stripeConnected}
      />

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard/propostas")}>
          Cancelar
        </Button>
        <Button type="button" variant="cta" size="lg" className="gap-2" onClick={() => void handleSave()} disabled={saving || !selectedLead}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FilePlus className="size-4" aria-hidden />}
          {saving ? "Gerando proposta…" : "Gerar proposta"}
        </Button>
      </div>

      <Dialog open={isLeadDialogOpen} onOpenChange={setIsLeadDialogOpen}>
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
                Novo lead
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed text-zinc-500 sm:text-sm">
                Cadastre rapidamente o lead para continuar a proposta sem sair desta tela.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-6 px-6 py-6 sm:px-8 sm:py-7">
            <section className="space-y-3.5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <div className="space-y-2">
                  <Label htmlFor="proposal-dialog-lead-name" className="text-xs font-medium text-zinc-500">
                    Nome completo <span className="text-red-400/90">*</span>
                  </Label>
                  <Input
                    id="proposal-dialog-lead-name"
                    value={newLeadName}
                    onChange={(e) => setNewLeadName(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="Ex.: João Silva"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="proposal-dialog-lead-company" className="text-xs font-medium text-zinc-500">
                    Empresa <span className="text-red-400/90">*</span>
                  </Label>
                  <Input
                    id="proposal-dialog-lead-company"
                    value={newLeadCompany}
                    onChange={(e) => setNewLeadCompany(e.target.value)}
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
                  <Label htmlFor="proposal-dialog-lead-email" className="text-xs font-medium text-zinc-500">
                    E-mail <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <Input
                    id="proposal-dialog-lead-email"
                    type="email"
                    value={newLeadEmail}
                    onChange={(e) => setNewLeadEmail(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="nome@empresa.com"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="proposal-dialog-lead-phone" className="text-xs font-medium text-zinc-500">
                    Telefone / WhatsApp <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <Input
                    id="proposal-dialog-lead-phone"
                    type="tel"
                    value={newLeadPhone}
                    onChange={(e) => setNewLeadPhone(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="(11) 99999-9999"
                    autoComplete="tel"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3.5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <div className="space-y-2">
                  <Label htmlFor="proposal-dialog-lead-website" className="text-xs font-medium text-zinc-500">
                    Site da empresa <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <Input
                    id="proposal-dialog-lead-website"
                    type="url"
                    value={newLeadWebsite}
                    onChange={(e) => setNewLeadWebsite(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="https://empresa.com.br"
                    autoComplete="url"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="proposal-dialog-lead-instagram" className="text-xs font-medium text-zinc-500">
                    Instagram <span className="font-normal text-zinc-600">(opcional)</span>
                  </Label>
                  <Input
                    id="proposal-dialog-lead-instagram"
                    value={newLeadInstagram}
                    onChange={(e) => setNewLeadInstagram(e.target.value)}
                    className="h-10 rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-brand/45 focus-visible:ring-2 focus-visible:ring-brand/20"
                    placeholder="https://instagram.com/empresa ou @empresa"
                    autoComplete="off"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3.5">
              <div className="space-y-2">
                <Label htmlFor="proposal-dialog-lead-status" className="text-xs font-medium text-zinc-500">
                  Status atual
                </Label>
                <Select
                  value={newLeadStatus}
                  onValueChange={(value) => {
                    if (value) setNewLeadStatus(value as LeadStatus);
                  }}
                >
                  <SelectTrigger
                    id="proposal-dialog-lead-status"
                    className="h-10 w-full rounded-md border-white/10 bg-white/[0.04] text-sm text-zinc-100 focus-visible:border-brand/45 dark:hover:bg-white/[0.06]"
                  >
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent sideOffset={8}>
                    {LEAD_STATUSES.map((status) => (
                      <SelectItem
                        key={status}
                        value={status}
                        disabled={!isLeadStatusSelectable(status, false)}
                      >
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            {newLeadError ? (
              <div
                role="alert"
                className="rounded-md border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-sm font-medium leading-relaxed text-red-300"
              >
                {newLeadError}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] bg-white/[0.02] px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-8 sm:py-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsLeadDialogOpen(false)}
              disabled={newLeadSaving}
              className="h-10 rounded-md text-zinc-400 hover:bg-white/5 hover:text-zinc-200 sm:min-w-[7rem]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="cta"
              size="lg"
              onClick={() => void handleCreateLead()}
              disabled={newLeadSaving}
              className="min-w-[10rem] gap-2"
            >
              {newLeadSaving ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
              {newLeadSaving ? "A guardar…" : "Salvar lead"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
