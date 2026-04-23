import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";
import { syncLeadPlacesCachesForRequestAdmin } from "@/lib/lead-places-enrichment";
import { getUserPlanAdmin } from "@/lib/plan-limits-admin";
import { PLAN_FEATURES } from "@/lib/plan-limits";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const adminApp = getFirebaseAdminApp();
    if (!adminApp) {
      return NextResponse.json(
        { error: "Servidor sem Firebase Admin (`FIREBASE_SERVICE_ACCOUNT_JSON`)." },
        { status: 503 },
      );
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Chave Google Places não configurada (`GOOGLE_PLACES_API_KEY`)." },
        { status: 503 },
      );
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Token ausente. Faça login novamente." }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await getAuth(adminApp).verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    const includeCompetitors = body.includeCompetitors === true;
    if (!leadId) {
      return NextResponse.json({ error: "leadId é obrigatório." }, { status: 400 });
    }

    const plan = await getUserPlanAdmin(uid);
    const features = PLAN_FEATURES[plan];
    const isMasterAdmin = plan === "master";
    if (!features.gmbAnalysis) {
      return NextResponse.json({ error: "Função não disponível no seu plano." }, { status: 403 });
    }
    if (includeCompetitors && !features.competitorAnalysis) {
      return NextResponse.json({ error: "Comparativo de concorrentes não disponível no seu plano." }, { status: 403 });
    }

    const db = getFirestore(adminApp);
    const leadRef = db.collection("leads").doc(leadId);
    const snap = await leadRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
    }
    const leadData = snap.data() as Record<string, unknown>;
    const leadOwnerId = String(leadData.userId ?? "");
    if (!isMasterAdmin && leadOwnerId !== uid) {
      return NextResponse.json({ error: "Sem permissão para este lead." }, { status: 403 });
    }
    if (isMasterAdmin && !leadOwnerId) {
      return NextResponse.json({ error: "Lead sem proprietário associado." }, { status: 400 });
    }

    const merged = await syncLeadPlacesCachesForRequestAdmin({
      db,
      apiKey,
      /** Master testa buscas em leads de clientes: cache e regras internas usam o dono do lead. */
      uid: isMasterAdmin ? leadOwnerId : uid,
      leadId,
      includeCompetitors,
      // Este endpoint é só para sincronização manual (“Testar busca”): ignorar TTL de 7 dias.
      forceRefreshCompetitors: includeCompetitors,
    });

    return NextResponse.json({
      ok: true,
      gmb: {
        gmbFetchedAt: merged.gmbFetchedAt ?? null,
        gmbRating: merged.gmbRating ?? null,
        gmbReviewCount: merged.gmbReviewCount ?? null,
        gmbHasListing: merged.gmbHasListing ?? null,
        gmbPhotoCount: merged.gmbPhotoCount ?? null,
        gmbBusinessStatus: merged.gmbBusinessStatus ?? null,
        gmbOpenNow: merged.gmbOpenNow ?? null,
        gmbGoogleMapsUri: merged.gmbGoogleMapsUri ?? null,
        gmbPlaceId: merged.gmbPlaceId ?? null,
        gmbFormattedAddress: merged.gmbFormattedAddress ?? null,
        gmbCity: merged.gmbCity ?? null,
        gmbSubLocality: merged.gmbSubLocality ?? null,
        gmbListingWebsiteUrl: merged.gmbListingWebsiteUrl ?? null,
        gmbListingInstagramUrl: merged.gmbListingInstagramUrl ?? null,
      },
      competitors: merged.competitors ?? [],
      competitorsFetchedAt: merged.competitorsFetchedAt ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao sincronizar Places.";
    console.error("[lead-places-analysis]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
