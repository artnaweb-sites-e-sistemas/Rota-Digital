import { NextRequest, NextResponse } from "next/server";

import { requireGeneralAdminApi } from "@/lib/require-general-admin-api";
import type { StoredStripeInvoice } from "@/types/stripe-invoice";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ uid: string }> };

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/** Últimas faturas Stripe de um utilizador (para admin). Ordenadas por `createdAtMs` DESC. */
export async function GET(request: NextRequest, context: RouteContext) {
  const gate = await requireGeneralAdminApi(request);
  if (!gate.ok) return gate.response;

  const { uid } = await context.params;
  if (!uid?.trim()) {
    return NextResponse.json({ error: "UID inválido." }, { status: 400 });
  }

  const searchParams = request.nextUrl.searchParams;
  let limit = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
  limit = Math.min(Math.floor(limit), MAX_LIMIT);

  try {
    const snap = await gate.ctx.db
      .collection("stripeInvoices")
      .where("uid", "==", uid.trim())
      .orderBy("createdAtMs", "desc")
      .limit(limit)
      .get();

    const invoices: StoredStripeInvoice[] = [];
    snap.forEach((doc) => {
      const data = doc.data() as StoredStripeInvoice;
      if (data) invoices.push(data);
    });
    return NextResponse.json({ invoices });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar faturas Stripe.";
    console.error("[admin-users invoices]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
