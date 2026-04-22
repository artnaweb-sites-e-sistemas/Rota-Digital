import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";

import { requireGeneralAdminApi } from "@/lib/require-general-admin-api";
import type { AdminUserSubscriptionStatus } from "@/types/admin-user-list";

export const runtime = "nodejs";

export type AdminPaymentAlertEntry = {
  uid: string;
  email: string | null;
  displayName: string | null;
  subscriptionStatus: AdminUserSubscriptionStatus | null;
  autoSuspended: boolean;
  autoSuspendedReason: string | null;
  autoSuspendedAtMs: number | null;
  lastPaymentFailureAtMs: number | null;
  lastPaymentFailureMessage: string | null;
  disabled: boolean;
};

export type AdminPaymentAlertsResponse = {
  pastDue: AdminPaymentAlertEntry[];
  autoSuspended: AdminPaymentAlertEntry[];
};

const MAX_RESULTS = 50;

/**
 * Consulta `userSettings` por documentos em risco de pagamento:
 *   • `subscriptionStatus == "past_due"` (Stripe ainda a tentar cobrar)
 *   • `autoSuspended == true` (já suspenso automaticamente)
 *
 * Faz depois enrich mínimo com Firebase Auth (email/displayName).
 */
export async function GET(req: NextRequest) {
  const gate = await requireGeneralAdminApi(req);
  if (!gate.ok) return gate.response;

  const { db, adminApp } = gate.ctx;
  const auth = getAuth(adminApp);

  try {
    const pastDueSnap = await db
      .collection("userSettings")
      .where("subscriptionStatus", "==", "past_due")
      .limit(MAX_RESULTS)
      .get();
    const suspendedSnap = await db
      .collection("userSettings")
      .where("autoSuspended", "==", true)
      .limit(MAX_RESULTS)
      .get();

    const toEntry = async (
      doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
    ): Promise<AdminPaymentAlertEntry | null> => {
      const uid = doc.id;
      const data = doc.data();
      let email: string | null = null;
      let displayName: string | null = null;
      let disabled = false;
      try {
        const u = await auth.getUser(uid);
        email = u.email ?? null;
        displayName = u.displayName ?? null;
        disabled = u.disabled === true;
      } catch {
        return null;
      }
      const rawStatus = typeof data.subscriptionStatus === "string" ? data.subscriptionStatus : null;
      return {
        uid,
        email,
        displayName,
        subscriptionStatus: rawStatus as AdminUserSubscriptionStatus | null,
        autoSuspended: data.autoSuspended === true,
        autoSuspendedReason:
          typeof data.autoSuspendedReason === "string" ? data.autoSuspendedReason : null,
        autoSuspendedAtMs:
          typeof data.autoSuspendedAtMs === "number" ? data.autoSuspendedAtMs : null,
        lastPaymentFailureAtMs:
          typeof data.lastPaymentFailureAtMs === "number" ? data.lastPaymentFailureAtMs : null,
        lastPaymentFailureMessage:
          typeof data.lastPaymentFailureMessage === "string" ? data.lastPaymentFailureMessage : null,
        disabled,
      };
    };

    const pastDueEntries = (await Promise.all(pastDueSnap.docs.map(toEntry))).filter(
      (e): e is AdminPaymentAlertEntry => e != null && !e.autoSuspended,
    );
    const suspendedEntries = (await Promise.all(suspendedSnap.docs.map(toEntry))).filter(
      (e): e is AdminPaymentAlertEntry => e != null,
    );

    pastDueEntries.sort((a, b) => (b.lastPaymentFailureAtMs ?? 0) - (a.lastPaymentFailureAtMs ?? 0));
    suspendedEntries.sort((a, b) => (b.autoSuspendedAtMs ?? 0) - (a.autoSuspendedAtMs ?? 0));

    const body: AdminPaymentAlertsResponse = {
      pastDue: pastDueEntries,
      autoSuspended: suspendedEntries,
    };
    return NextResponse.json(body);
  } catch (e) {
    console.error("[admin-users payment-alerts]", e);
    const msg = e instanceof Error ? e.message : "Erro ao carregar alertas.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
