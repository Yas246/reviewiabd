import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable prefetching for PWA offline support
  // This prevents Next.js from making prefetch requests that fail offline
  experimental: {
    optimizeCss: false,
  },
  // Retire les console.* du bundle de production (error/warn conservés)
  compiler: {
    removeConsole: {
      exclude: ["error", "warn"],
    },
  },
  // webR (R dans le navigateur) exige SharedArrayBuffer :
  // l'app doit être servie en mode "crossOriginIsolated".
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
