import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    const apiBase = process.env.API_BASE_URL ?? "http://localhost:8000";
    return [
      {
        source: "/v1/:path*",
        destination: `${apiBase}/v1/:path*`,
      },
      {
        source: "/health",
        destination: `${apiBase}/health`,
      },
    ];
  },
};

export default nextConfig;
