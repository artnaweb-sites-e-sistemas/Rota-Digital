"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Lead, LeadStatus } from "@/types/lead";
import { getLeads, createLead, updateLead, deleteLead } from "@/lib/leads";
import { deleteReportsByLead } from "@/lib/reports";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Plus, Loader2 } from "lucide-react";
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Leads</h1>
        <Button onClick={() => openForm()} className="gap-2">
          <Plus size={16} /> Novo Lead
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>{editingLead ? "Editar Lead" : "Novo Lead"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="bg-zinc-800 border-zinc-700" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} className="bg-zinc-800 border-zinc-700" />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} className="bg-zinc-800 border-zinc-700" />
            </div>
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Input value={company} onChange={e => setCompany(e.target.value)} className="bg-zinc-800 border-zinc-700" />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(val) => {
                  if (val) setStatus(val as LeadStatus);
                }}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectItem value="Novo">Novo</SelectItem>
                  <SelectItem value="Em Contato">Em Contato</SelectItem>
                  <SelectItem value="Qualificado">Qualificado</SelectItem>
                  <SelectItem value="Convertido">Convertido</SelectItem>
                  <SelectItem value="Perdido">Perdido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {saveError && (
            <div className="mt-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md p-2">
              {saveError}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="animate-spin text-zinc-400" size={24} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead>Nome</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow className="border-b-0 hover:bg-transparent">
                  <TableCell colSpan={5} className="text-center py-10 text-zinc-500">
                    Nenhum lead encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow key={lead.id} className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/leads/${lead.id}`}
                        className="text-zinc-100 hover:text-indigo-400 transition-colors"
                      >
                        {lead.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-zinc-300">{lead.company}</TableCell>
                    <TableCell className="text-zinc-300">{lead.email}</TableCell>
                    <TableCell>
                      <Badge className={`${STATUS_COLORS[lead.status]} text-white border-none`}>
                        {lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                     <DropdownMenu>
                        <DropdownMenuTrigger>
                          <Button variant="ghost" className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-100">
                            <span className="sr-only">Abrir menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-zinc-100">
                          <DropdownMenuItem
                            className="focus:bg-zinc-800 cursor-pointer"
                            onClick={() => window.location.href = `/dashboard/leads/${lead.id}`}
                          >
                            Ver Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem className="focus:bg-zinc-800" onClick={() => openForm(lead)}>
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-400 focus:bg-zinc-800 focus:text-red-300" onClick={() => handleDelete(lead.id)}>
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
      </div>
    </div>
  );
}
