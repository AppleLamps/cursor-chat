import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@cursor/sdk"],
  turbopack: {
    root: path.resolve(".")
  }
};

export default nextConfig;
