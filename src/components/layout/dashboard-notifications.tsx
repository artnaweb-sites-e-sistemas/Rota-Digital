"use client";

import { useEffect, useState } from "react";
import { Bell, X, Trash2 } from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Proposal } from "@/types/proposal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";

const DISMISSED_KEY = "rota_dismissed_notifications";

export function DashboardNotifications({ userId, mainCollapsed }: { userId: string; mainCollapsed: boolean }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_KEY);
      if (stored) setDismissedIds(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, "proposals"), where("userId", "==", userId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Proposal);
      setProposals(docs);
    });
    return () => unsubscribe();
  }, [userId]);

  const dismissNotification = (id: string) => {
    setDismissedIds((prev) => {
      const next = [...prev, id];
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      return next;
    });
  };

  const clearAllNotifications = (ids: string[]) => {
    setDismissedIds((prev) => {
      const next = Array.from(new Set([...prev, ...ids]));
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      return next;
    });
    setIsOpen(false);
  };

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const expiringProposals = proposals
    .map((p) => {
      if (!p.validUntilDate) return null;

      const end = new Date(p.validUntilDate);
      end.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      
      // Notificamos propostas que vencem amanhã (1), hoje (0) ou já estão vencidas (< 0)
      if (diffDays > 1) return null;

      const state = diffDays < 0 ? "expired" : "warning";
      const signature = `${p.id}_${p.validUntilDate}_${state}`;

      if (dismissedIds.includes(signature)) return null;

      return { ...p, diffDays, signature };
    })
    .filter(Boolean) as (Proposal & { diffDays: number; signature: string })[];

  expiringProposals.sort((a, b) => b.validUntilDate - a.validUntilDate); // Ordena decrescente: 1, 0, -1, -2... (mais recentes para vencer primeiro)

  const hasNotifications = expiringProposals.length > 0;

  const handleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(true);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className={cn(
          "absolute -top-1.5 -right-1.5 z-10 flex items-center justify-center rounded-full ring-2 ring-background transition-all",
          hasNotifications 
            ? "bg-brand text-brand-foreground shadow-[0_2px_4px_rgba(0,0,0,0.15)] hover:scale-110" 
            : "bg-muted text-muted-foreground border border-border/50 hover:bg-muted/80",
          mainCollapsed ? "size-5" : "size-6"
        )}
        title={hasNotifications ? `${expiringProposals.length} notificações` : "Sem notificações"}
      >
        <Bell className={mainCollapsed ? "size-3" : "size-3.5"} />
        {hasNotifications && (
          <span className="absolute -right-0.5 -top-0.5 flex size-2">
            <span className="relative inline-flex size-2 rounded-full bg-red-500 border border-white dark:border-zinc-900"></span>
          </span>
        )}
      </button>

      <NotificationsModal 
        isOpen={isOpen} 
        setIsOpen={setIsOpen} 
        expiringProposals={expiringProposals} 
        onDismiss={dismissNotification}
        onClearAll={() => clearAllNotifications(expiringProposals.map(p => p.signature))}
      />
    </>
  );
}

function NotificationsModal({ 
  isOpen, 
  setIsOpen, 
  expiringProposals, 
  onDismiss,
  onClearAll
}: { 
  isOpen: boolean; 
  setIsOpen: (o: boolean) => void; 
  expiringProposals: (Proposal & { diffDays: number; signature: string })[]; 
  onDismiss: (signature: string) => void;
  onClearAll: () => void;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-4 pr-6">
          <DialogTitle className="flex items-center gap-2">
            <Bell className="size-5 text-brand" />
            Notificações
          </DialogTitle>
          {expiringProposals.length > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
              onClick={onClearAll}
            >
              <Trash2 className="size-3.5 mr-1.5" />
              Limpar todas
            </Button>
          )}
        </DialogHeader>
        
        {expiringProposals.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma notificação no momento.
          </div>
        ) : (
          <div className="-mr-2 flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-3 pt-4 pb-2">
            {expiringProposals.map((proposal) => {
              const diffDays = proposal.diffDays;
              const isToday = diffDays === 0;
              const isExpired = diffDays < 0;

              let badgeText = "Vence em 1 dia";
              let badgeClasses = "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-200";
              
              if (isToday) {
                badgeText = "Vence Hoje";
                badgeClasses = "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-500/25 dark:bg-red-500/15 dark:text-red-200";
              } else if (isExpired) {
                badgeText = "Expirada";
                badgeClasses = "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-500/25 dark:bg-red-500/15 dark:text-red-200 opacity-80";
              }

              return (
                <div key={proposal.id} className="group relative flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3.5 shadow-sm transition-colors hover:bg-muted/50 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]">
                  <button
                    onClick={() => onDismiss(proposal.signature)}
                    className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-40 transition-opacity hover:bg-muted-foreground/20 hover:text-foreground hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    title="Excluir notificação"
                  >
                    <X className="size-3.5" />
                  </button>
                  
                  <div className="flex items-start justify-between gap-3 pr-6">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-semibold text-foreground leading-tight" title={proposal.title || `Proposta para ${proposal.lead.company}`}>
                        {proposal.title || `Proposta para ${proposal.lead.company}`}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" title={`Cliente: ${proposal.lead.name}`}>
                        {proposal.lead.name}
                      </p>
                    </div>
                    <span className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border",
                      badgeClasses
                    )}>
                      {badgeText}
                    </span>
                  </div>
                  <Button asChild variant="outline" size="sm" className="w-full text-xs h-8 bg-background/50 hover:bg-background" onClick={() => setIsOpen(false)}>
                    <Link href={`/dashboard/propostas/${proposal.id}`}>
                      Ver proposta
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
