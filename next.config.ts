import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable prefetching for PWA offline support
  // This prevents Next.js from making prefetch requests that fail offline
  experimental: {
    optimizeCss: false,
  },
};

export default nextConfig;
