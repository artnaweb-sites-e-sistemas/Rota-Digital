import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { LEAD_CAPTURE_ADD_ON_PACKS } from "@/lib/lead-capture-config";

export const runtime = "nodejs";

/**
 * Cria sessão de checkout Stripe para pacote extra de leads.
 * Quando `STRIPE_SECRET_KEY` e a integração estiverem definidos, substitua o corpo por:
 * `const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);`
 * `await stripe.checkout.sessions.create({ ... metadata: { uid, packId } })`
 * e devolva `{ url: session.url }`.
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
  const pack = LEAD_CAPTURE_ADD_ON_PACKS.find((p) => p.id === packId);
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
        leads: pack.leads,
        price: pack.price,
        message:
          "Configure STRIPE_SECRET_KEY no ambiente do servidor e integre stripe.checkout.sessions.create neste endpoint.",
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
        "Chave Stripe detetada; falta implementar a criação da sessão (SDK) e o webhook para creditar leadCaptureMonthlyLimit ou pacotes pagos.",
    },
    { status: 501 },
  );
}
