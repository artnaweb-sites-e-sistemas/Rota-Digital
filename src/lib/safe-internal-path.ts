/** Evita open redirects: só caminhos relativos na mesma origem. */
export function safeInternalPath(input: string | null | undefined): string | null {
  if (!input || typeof input !== "string") return null;
  const t = input.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return null;
  if (t.includes("://")) return null;
  return t;
}
