import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: process.env.BILIMLENS_IN_PROCESS_TSC === "1" ? { useTypeScriptCli: false } : undefined,
  // A webpack fallback is useful in environments that prohibit Turbopack IPC.
  // Use the same Tailwind loader in both bundlers, with no extra dependencies.
  webpack(config) {
    config.module.rules.push({
      test: /globals\.css$/,
      enforce: "pre",
      use: ["@tailwindcss/turbopack"],
    });
    return config;
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
