import { getFirestore } from "firebase-admin/firestore";
import type { App } from "firebase-admin/app";

const REFRESH_MARGIN_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias antes de expirar

export type MpTokenResult =
  | { ok: true; accessToken: string; userId: number }
  | { ok: false; error: string };

/**
 * Lê o access_token do MP para um usuário; se estiver perto de expirar,
 * faz refresh automático e atualiza Firestore.
 */
export async function getMpAccessToken(
  adminApp: App,
  uid: string,
): Promise<MpTokenResult> {
  const db = getFirestore(adminApp);
  const snap = await db.doc(`userSettings/${uid}`).get();
  const data = snap.data() as Record<string, unknown> | undefined;

  const accessToken = typeof data?.mpAccessToken === "string" ? data.mpAccessToken : "";
  const refreshToken = typeof data?.mpRefreshToken === "string" ? data.mpRefreshToken : "";
  const userId = typeof data?.mpUserId === "number" ? data.mpUserId : 0;
  const expiresAt = typeof data?.mpTokenExpiresAt === "number" ? data.mpTokenExpiresAt : 0;

  if (!accessToken || !userId) {
    return { ok: false, error: "Conta Mercado Pago não conectada." };
  }

  if (expiresAt > 0 && Date.now() > expiresAt - REFRESH_MARGIN_MS && refreshToken) {
    const refreshed = await refreshMpToken(adminApp, uid, refreshToken);
    if (refreshed.ok) return refreshed;
  }

  return { ok: true, accessToken, userId };
}

async function refreshMpToken(
  adminApp: App,
  uid: string,
  refreshToken: string,
): Promise<MpTokenResult> {
  const appId = process.env.MP_APP_ID?.trim();
  const clientSecret = process.env.MP_CLIENT_SECRET?.trim();
  if (!appId || !clientSecret) {
    return { ok: false, error: "MP_APP_ID / MP_CLIENT_SECRET não configurados." };
  }

  try {
    const res = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: appId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      console.error("[mp-refresh] Failed:", await res.text());
      return { ok: false, error: "Falha ao renovar token do Mercado Pago." };
    }

    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      user_id?: number;
      expires_in?: number;
    };

    if (!data.access_token || !data.user_id) {
      return { ok: false, error: "Resposta de refresh inválida do Mercado Pago." };
    }

    const db = getFirestore(adminApp);
    await db.doc(`userSettings/${uid}`).set(
      {
        mpAccessToken: data.access_token,
        mpRefreshToken: data.refresh_token ?? refreshToken,
        mpUserId: data.user_id,
        mpTokenExpiresAt: Date.now() + (data.expires_in ?? 15552000) * 1000,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    return { ok: true, accessToken: data.access_token, userId: data.user_id };
  } catch (e) {
    console.error("[mp-refresh] Error:", e);
    return { ok: false, error: "Erro ao renovar token do Mercado Pago." };
  }
}
