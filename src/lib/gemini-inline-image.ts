/**
 * Parte de imagem inline para `generateContent` do Gemini (API v1).
 * Usado em `generate-route` e `reanalyze-route`.
 */
export type GeminiInlineImagePart = {
  inlineData: {
    mimeType: string;
    data: string;
  };
};

/**
 * Descarrega uma imagem por URL HTTP(S) e devolve base64 para o Gemini.
 * URLs relativas (ex.: `/api/...`) devem ser absolutizadas pelo chamador.
 */
export async function downloadImageAsInlinePart(
  imageUrl?: string,
  timeoutMsOverride?: number,
): Promise<GeminiInlineImagePart | undefined> {
  if (!imageUrl) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ctrl = new AbortController();
    const isInstagramSnapshot = imageUrl.includes("/api/instagram-profile-snapshot");
    const isInternalApi = imageUrl.includes("/api/");
    const timeoutMs =
      typeof timeoutMsOverride === "number"
        ? timeoutMsOverride
        : isInstagramSnapshot
          ? 110000
          : isInternalApi
            ? 18000
            : 10000;
    timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(imageUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (RotaDigitalBot/1.0)",
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!contentType.startsWith("image/")) return undefined;
    const bytes = await res.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 4 * 1024 * 1024) return undefined;
    const base64 = Buffer.from(bytes).toString("base64");
    if (!base64) return undefined;
    return {
      inlineData: {
        mimeType: contentType || "image/jpeg",
        data: base64,
      },
    };
  } catch {
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
