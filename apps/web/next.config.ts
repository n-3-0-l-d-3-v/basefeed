import type { NextConfig } from "next";

const appSecurity = [
  // The dashboard frames client sites, but nothing may frame the dashboard (clickjacking).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@bn/shared", "@bn/anchor"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: appSecurity },
      {
        // The embed is loaded cross-origin as an ES module, so it needs CORS. Hashed chunks never change.
        source: "/widget/:file((?:app|chunk)-.*\\.js)",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // The widget's label font, loaded cross-origin by client sites in feedback mode.
        source: "/fonts/:file*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Stable URL that sites embed: short cache so releases roll out within minutes.
        source: "/widget/loader.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
