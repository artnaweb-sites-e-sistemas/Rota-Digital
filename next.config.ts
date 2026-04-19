import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  /** Playwright não entra no bundle do Turbopack; roda só em rotas Node com import dinâmico. */
  serverExternalPackages: ["playwright"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/**",
      },
    ],
    /**
     * Next 16 exige padrão explícito para `src` local com query (ex.: proxy de imagens).
     * Sem `search`: aceita qualquer query string nestes pathnames.
     */
    localPatterns: [
      { pathname: "/api/image-proxy" },
      { pathname: "/api/instagram-profile-snapshot" },
      { pathname: "/videos/landing/**" },
    ],
  },
};

export default nextConfig;
