"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { getProposal } from "@/lib/proposals";
import type { Proposal } from "@/types/proposal";
import { Button } from "@/components/ui/button";
import { ProposalView } from "@/components/propostas/proposal-view";

export default function ProposalPage() {
  const { proposalId } = useParams<{ proposalId: string }>();
  const router = useRouter();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!proposalId) return;
      try {
        const data = await getProposal(proposalId);
        setProposal(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [proposalId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-muted-foreground">Proposta não encontrada.</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/propostas")}>
          Voltar
        </Button>
      </div>
    );
  }

  return <ProposalView proposal={proposal} variant="dashboard" onProposalChange={setProposal} />;
}
