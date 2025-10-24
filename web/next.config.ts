import type { NextConfig } from "next";

// Only proxy specific backend API endpoints to Express.
// Keep Next.js internal routes like /api/auth handled by NextAuth.
const nextConfig: NextConfig = {
  async rewrites() {
    const target = process.env.EXPRESS_BASE_URL || "http://localhost:5001";

    const api = (path: string) => ({ source: path, destination: `${target}${path}` });

    return {
      // Apply after checking filesystem so /api/auth/* stays local
      afterFiles: [
        api("/api/agents"),
        api("/api/projects"),
        api("/api/projects-for-agents"),
        api("/api/projects-with-calls"),
        { source: "/api/call-details-paged/:path*", destination: `${target}/api/call-details-paged/:path*` },
        { source: "/api/call-details/:path*", destination: `${target}/api/call-details/:path*` },
        api("/api/call-outcomes"),
        api("/api/kpis"),
        api("/api/statistics"),
        api("/api/project-targets"),
        api("/api/cyprus-time"),
        api("/api/database-status"),
        api("/api/dialfire-status"),
        api("/api/campaign-mapping"),
        api("/api/dialfire-campaigns-test"),
        { source: "/api/transcribe/:path*", destination: `${target}/api/transcribe/:path*` },
        { source: "/api/campaign-categories/:path*", destination: `${target}/api/campaign-categories/:path*` },
        { source: "/api/outcome-status/:path*", destination: `${target}/api/outcome-status/:path*` },
        { source: "/api/debug/:path*", destination: `${target}/api/debug/:path*` },
        { source: "/healthz", destination: `${target}/healthz` },
      ],
      fallback: [],
      beforeFiles: [],
    };
  },
};

export default nextConfig;
