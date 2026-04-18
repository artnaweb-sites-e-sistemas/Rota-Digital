import { NextRequest, NextResponse } from "next/server";

import { fetchAdminUserDetail } from "@/lib/admin-users-metrics";
import { requireGeneralAdminApi } from "@/lib/require-general-admin-api";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ uid: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const gate = await requireGeneralAdminApi(request);
  if (!gate.ok) return gate.response;

  const { uid } = await context.params;
  if (!uid?.trim()) {
    return NextResponse.json({ error: "UID inválido." }, { status: 400 });
  }

  const detail = await fetchAdminUserDetail(gate.ctx.db, gate.ctx.auth, uid.trim());
  if (!detail) {
    return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });
  }
  return NextResponse.json(detail);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const gate = await requireGeneralAdminApi(request);
  if (!gate.ok) return gate.response;

  const { uid } = await context.params;
  if (!uid?.trim()) {
    return NextResponse.json({ error: "UID inválido." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || !("disabled" in body)) {
    return NextResponse.json({ error: "Envie `{ \"disabled\": boolean }`." }, { status: 400 });
  }

  const disabled = (body as { disabled: unknown }).disabled;
  if (typeof disabled !== "boolean") {
    return NextResponse.json({ error: "`disabled` deve ser boolean." }, { status: 400 });
  }

  try {
    await gate.ctx.auth.updateUser(uid.trim(), { disabled });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao atualizar conta.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const detail = await fetchAdminUserDetail(gate.ctx.db, gate.ctx.auth, uid.trim());
  if (!detail) {
    return NextResponse.json({ error: "Utilizador não encontrado após atualização." }, { status: 404 });
  }
  return NextResponse.json(detail);
}
