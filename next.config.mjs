import path from "node:path";

// The Content-Security-Policy is set per request in proxy.ts (it carries a nonce).

const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@cursor/sdk"],
  turbopack: {
    root: path.resolve(".")
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
