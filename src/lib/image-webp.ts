type ConvertToWebpOptions = {
  quality?: number;
  fallbackMimeType?: string;
};

/**
 * Tenta converter qualquer imagem para WebP.
 * Em caso de falha, devolve o buffer original sem quebrar o fluxo.
 */
export async function convertImageBufferToWebp(
  input: Buffer,
  options?: ConvertToWebpOptions
): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default;
    const quality = Math.max(1, Math.min(100, Number(options?.quality ?? 76)));
    const converted = await sharp(input).webp({ quality }).toBuffer();
    if (!converted?.length) {
      return { buffer: input, mimeType: options?.fallbackMimeType || "image/jpeg" };
    }
    return { buffer: converted, mimeType: "image/webp" };
  } catch {
    return { buffer: input, mimeType: options?.fallbackMimeType || "image/jpeg" };
  }
}
