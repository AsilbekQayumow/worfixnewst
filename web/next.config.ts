import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lint runs in the editor/CI; the production build only type-checks.
  eslint: { ignoreDuringBuilds: true },
  images: { unoptimized: true },
  webpack(config, { isServer }) {
    // Cloudflare Workers forbid runtime code generation, which the Node build of Firestore (gRPC/protobufjs)
    // does when it loads. Server-side rendering never talks to Firestore, so it gets the browser build there.
    if (isServer && process.env.WORFIX_TARGET === "cloudflare") {
      config.resolve.alias = { ...config.resolve.alias, "@firebase/firestore$": path.join(path.dirname(require.resolve("@firebase/firestore/package.json")), "dist/index.esm.js") };
    }
    return config;
  },
  // Same security headers on every host (Netlify: netlify.toml; Cloudflare static files: public/_headers).
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "geolocation=(self), camera=(self)" },
      ],
    }];
  },
};

export default nextConfig;
