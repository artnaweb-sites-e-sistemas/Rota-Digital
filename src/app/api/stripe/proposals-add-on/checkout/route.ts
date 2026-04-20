import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { PROPOSALS_ADD_ON_PACKS } from "@/lib/plan-quotas";

export const runtime = "nodejs";

/**
 * Cria sessão de checkout Stripe para pacote extra de propostas.
 * Ver `/api/stripe/lead-add-on/checkout` para o contrato (setupRequired + fallback mailto).
 */
export async function POST(req: NextRequest) {
  const adminApp = getFirebaseAdminApp();
  if (!adminApp) {
    return NextResponse.json({ error: "Servidor sem Firebase Admin." }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Token ausente." }, { status: 401 });
  }

  try {
    await getAuth(adminApp).verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { packId?: string };
  const packId = typeof body.packId === "string" ? body.packId.trim() : "";
  const pack = PROPOSALS_ADD_ON_PACKS.find((p) => p.id === packId);
  if (!pack) {
    return NextResponse.json({ error: "Pacote inválido." }, { status: 400 });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeSecret) {
    return NextResponse.json(
      {
        ok: false,
        setupRequired: true,
        packId: pack.id,
        label: pack.label,
        proposals: pack.proposals,
        price: pack.price,
        message:
          "Configure STRIPE_SECRET_KEY e integre stripe.checkout.sessions.create neste endpoint para creditar propostas extras.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      setupRequired: true,
      packId: pack.id,
      message:
        "Chave Stripe detetada; falta implementar a criação da sessão (SDK) e o webhook para creditar o saldo extra de propostas.",
    },
    { status: 501 },
  );
}
