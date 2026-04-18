import { NextRequest, NextResponse } from "next/server";

import {
  getPublicOriginFromRequest,
  rewriteFirebaseAuthActionUrlToAppPath,
} from "@/lib/firebase-auth-action-app-url";
import { requireGeneralAdminApi } from "@/lib/require-general-admin-api";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ uid: string }> };

/** Gera link OOB de redefinição (o admin pode copiar e enviar ao utilizador até existir envio automático por e-mail). */
export async function POST(_request: NextRequest, context: RouteContext) {
  const gate = await requireGeneralAdminApi(_request);
  if (!gate.ok) return gate.response;

  const { uid } = await context.params;
  if (!uid?.trim()) {
    return NextResponse.json({ error: "UID inválido." }, { status: 400 });
  }

  let user;
  try {
    user = await gate.ctx.auth.getUser(uid.trim());
  } catch {
    return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });
  }

  const email = user.email?.trim();
  if (!email) {
    return NextResponse.json({ error: "Esta conta não tem e-mail; não é possível gerar redefinição." }, { status: 400 });
  }

  try {
    const firebaseLink = await gate.ctx.auth.generatePasswordResetLink(email);
    const origin = getPublicOriginFromRequest(_request);
    const link =
      origin != null
        ? rewriteFirebaseAuthActionUrlToAppPath(firebaseLink, origin, "/redefinir-senha")
        : firebaseLink;
    return NextResponse.json({ link, email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Não foi possível gerar o link.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
