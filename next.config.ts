import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  /** Playwright não entra no bundle do Turbopack; roda só em rotas Node com import dinâmico. */
  serverExternalPackages: ["playwright"],
};

export default nextConfig;
