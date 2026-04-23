import { NextRequest, NextResponse } from "next/server";

import { computeAdminUsageMetricsByPlan } from "@/lib/admin-usage-metrics";
import { requireGeneralAdminApi } from "@/lib/require-general-admin-api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const gate = await requireGeneralAdminApi(request);
  if (!gate.ok) return gate.response;

  try {
    const body = await computeAdminUsageMetricsByPlan(gate.ctx.db);
    return NextResponse.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao obter métricas de uso por plano.";
    console.error("[admin/usage-metrics]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
