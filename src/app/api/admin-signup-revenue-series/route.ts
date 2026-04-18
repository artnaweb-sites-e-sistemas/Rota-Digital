import { NextRequest, NextResponse } from "next/server";

import { getAdminSignupRevenueSeries } from "@/lib/admin-signup-revenue-series";
import { parseAdminPlatformSeriesQuery } from "@/lib/admin-platform-series-query";
import { requireGeneralAdminApi } from "@/lib/require-general-admin-api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const gate = await requireGeneralAdminApi(request);
  if (!gate.ok) return gate.response;

  try {
    const q = parseAdminPlatformSeriesQuery(request.nextUrl.searchParams);
    const body = await getAdminSignupRevenueSeries(gate.ctx.auth, gate.ctx.db, q);
    return NextResponse.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao obter série de inscrições.";
    console.error("[admin-signup-revenue-series]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
