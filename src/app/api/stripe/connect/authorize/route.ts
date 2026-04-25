import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-app";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const adminApp = getFirebaseAdminApp();
  if (!adminApp) {
    return NextResponse.json(
      { error: "Servidor sem Firebase Admin." },
      { status: 503 },
    );
  }

  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID?.trim();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (!clientId || !baseUrl) {
    return NextResponse.json(
      { error: "STRIPE_CONNECT_CLIENT_ID ou NEXT_PUBLIC_BASE_URL não configurados." },
      { status: 503 },
    );
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

  const redirectUri = `${baseUrl}/api/stripe/connect/callback`;
  const url = new URL("https://connect.stripe.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", "read_write");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", token);

  return NextResponse.json({ url: url.toString() });
}
