import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  /**
   * Header keamanan + cross-origin isolation.
   *
   * crossOriginIsolated mengaktifkan SharedArrayBuffer sehingga ONNX Runtime Web
   * bisa memakai multithreading WASM. Tanpa ini, inferensi berjalan single-thread
   * dan jauh lebih lambat. CSP ketat menjaga janji privasi: connect-src hanya
   * mengizinkan host model AI yang memang perlu diunduh sekali.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
