"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Lead, LeadStatus } from "@/types/lead";
import { getLeads, createLead, updateLead, deleteLead } from "@/lib/leads";
import { deleteReportsByLead } from "@/lib/reports";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MoreHorizontal, Plus, Loader2, Users } from "lucide-react";
import Link from "next/link";
// import { toast } from "sonner"; // If not available, we can use a simple alert or just implement without it

const STATUS_COLORS: Record<LeadStatus, string> = {
  "Novo": "bg-blue-500",
  "Em Contato": "bg-yellow-500",
  "Qualificado": "bg-green-500",
  "Convertido": "bg-purple-500",
  "Perdido": "bg-red-500",
};

export default function LeadsPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<LeadStatus>("Novo");

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const data = await getLeads(user.uid);
      setLeads(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const openForm = (lead?: Lead) => {
    if (lead) {
      setEditingLead(lead);
      setName(lead.name);
      setEmail(lead.email);
      setPhone(lead.phone);
      setCompany(lead.company);
      setStatus(lead.status);
    } else {
      setEditingLead(null);
      setName("");
      setEmail("");
      setPhone("");
      setCompany("");
      setStatus("Novo");
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
    setIsSaving(true);
    setSaveError(null);
    try {
      const payload = {
        name,
        email,
        phone,
        company,
        status,
      };
      if (editingLead) {
        await updateLead(editingLead.id, payload);
      } else {
        await createLead({
          userId: user.uid,
          ...payload,
        });
      }
      setIsDialogOpen(false);
      fetchLeads();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido ao salvar.";
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    if (!confirm("Excluir este lead e também a rota vinculada? Esta ação não pode ser desfeita.")) return;
    try {
      await deleteReportsByLead({ leadId: id, userId: user.uid });
      await deleteLead(id);
      fetchLeads();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white">Leads</h1>
          <p className="text-zinc-500 mt-1">Gerencie seus contatos e oportunidades de negócio.</p>
        </div>
        <Button onClick={() => openForm()} className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-6 shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] gap-2">
          <Plus size={20} /> Novo Lead
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto bg-zinc-950 border-white/10 text-zinc-100 rounded-2xl shadow-2xl p-0">
          <div className="p-6 border-b border-white/5">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white">{editingLead ? "Editar Lead" : "Novo Lead"}</DialogTitle>
            </DialogHeader>
          </div>
          <div className="space-y-5 p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">Nome completo</Label>
                <Input value={name} onChange={e => setName(e.target.value)} className="bg-white/5 border-white/10 rounded-xl h-11 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all" placeholder="Ex: João Silva" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">Empresa</Label>
                <Input value={company} onChange={e => setCompany(e.target.value)} className="bg-white/5 border-white/10 rounded-xl h-11 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all" placeholder="Ex: Tech Solutions" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">E-mail corporativo</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} className="bg-white/5 border-white/10 rounded-xl h-11 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all" placeholder="joao@empresa.com" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">Telefone / WhatsApp</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} className="bg-white/5 border-white/10 rounded-xl h-11 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all" placeholder="(11) 99999-9999" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">Status do Funil</Label>
              <Select
                value={status}
                onValueChange={(val) => {
                  if (val) setStatus(val as LeadStatus);
                }}
              >
                <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-11 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all">
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10 text-zinc-100 rounded-xl">
                  <SelectItem value="Novo" className="focus:bg-white/10 rounded-lg m-1">Novo</SelectItem>
                  <SelectItem value="Em Contato" className="focus:bg-white/10 rounded-lg m-1">Em Contato</SelectItem>
                  <SelectItem value="Qualificado" className="focus:bg-white/10 rounded-lg m-1">Qualificado</SelectItem>
                  <SelectItem value="Convertido" className="focus:bg-white/10 rounded-lg m-1">Convertido</SelectItem>
                  <SelectItem value="Perdido" className="focus:bg-white/10 rounded-lg m-1">Perdido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {saveError && (
            <div className="mx-6 mb-4 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              {saveError}
            </div>
          )}
          <div className="p-6 bg-white/[0.02] border-t border-white/5">
            <DialogFooter className="gap-3">
              <Button variant="ghost" onClick={() => setIsDialogOpen(false)} disabled={isSaving} className="rounded-xl hover:bg-white/5 text-zinc-400">Cancelar</Button>
              <Button onClick={handleSave} disabled={isSaving} className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-8 shadow-lg shadow-indigo-500/20">
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : "Salvar Lead"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="bg-white/[0.02] border-white/5 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="flex justify-center items-center py-24">
            <Loader2 className="animate-spin text-zinc-700" size={40} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent bg-white/[0.02]">
                <TableHead className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] py-5 px-6">Lead / Empresa</TableHead>
                <TableHead className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] py-5">Contato</TableHead>
                <TableHead className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] py-5">Status</TableHead>
                <TableHead className="w-[80px] py-5"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow className="border-b-0 hover:bg-transparent">
                  <TableCell colSpan={4} className="text-center py-24">
                    <div className="flex flex-col items-center gap-3">
                      <Users className="size-12 text-zinc-800" />
                      <p className="text-zinc-500 font-medium">Nenhum lead encontrado.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow key={lead.id} className="border-white/5 hover:bg-white/[0.02] transition-colors group">
                    <TableCell className="py-5 px-6">
                      <div className="flex flex-col">
                        <Link
                          href={`/dashboard/leads/${lead.id}`}
                          className="font-bold text-zinc-100 hover:text-indigo-400 transition-colors text-base"
                        >
                          {lead.name}
                        </Link>
                        <span className="text-xs text-zinc-500 font-medium mt-0.5">{lead.company}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-5">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm text-zinc-300 font-medium">{lead.email}</span>
                        <span className="text-xs text-zinc-500">{lead.phone || "Sem telefone"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-5">
                      <Badge className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border-none shadow-sm",
                        STATUS_COLORS[lead.status],
                        "bg-opacity-20 text-white ring-1 ring-inset ring-white/10"
                      )}>
                        <div className={cn("mr-1.5 h-1.5 w-1.5 rounded-full", STATUS_COLORS[lead.status].replace("bg-", "bg-"))} />
                        {lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-5 pr-6 text-right">
                     <DropdownMenu>
                        <DropdownMenuTrigger>
                          <Button variant="ghost" className="h-9 w-9 p-0 text-zinc-500 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                            <MoreHorizontal className="h-5 w-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-950 border-white/10 text-zinc-300 rounded-xl p-1.5 min-w-[160px] shadow-2xl">
                          <DropdownMenuItem
                            className="focus:bg-white/10 focus:text-white rounded-lg cursor-pointer py-2 px-3 gap-2"
                            onClick={() => window.location.href = `/dashboard/leads/${lead.id}`}
                          >
                            Ver Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem className="focus:bg-white/10 focus:text-white rounded-lg cursor-pointer py-2 px-3 gap-2" onClick={() => openForm(lead)}>
                            Editar Lead
                          </DropdownMenuItem>
                          <div className="h-px bg-white/5 my-1" />
                          <DropdownMenuItem className="text-red-400 focus:bg-red-500/10 focus:text-red-300 rounded-lg cursor-pointer py-2 px-3 gap-2" onClick={() => handleDelete(lead.id)}>
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
