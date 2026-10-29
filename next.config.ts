import type { NextConfig } from "next";

/**
 * Content-Security-Policy.
 *
 * Host yang diizinkan hanya yang benar-benar dipakai aplikasi:
 * - `staticimgly.com` untuk unduhan model segmentasi (sekali, lalu di-cache peramban)
 * - `cdn.jsdelivr.net` untuk berkas WASM ONNX Runtime yang di-resolve library
 *
 * `script-src` memakai 'unsafe-inline' karena Next.js menyisipkan skrip hidrasi
 * inline. Nonce berbasis middleware belum dipakai agar output tetap statis.
 * 'unsafe-eval' hanya di mode development: React memakainya untuk pesan error,
 * dan Turbopack memakai eval untuk HMR. Di produksi eval dilarang.
 *
 * PENTING: 'wasm-unsafe-eval' wajib ada karena pemisahan subjek memakai
 * WebAssembly (ONNX Runtime). Tanpa directive ini, WebAssembly.compile()
 * diblokir CSP dan fitur hapus latar tidak akan pernah jalan. Directive ini
 * hanya mengizinkan kompilasi WASM, bukan eval JavaScript biasa.
 *
 * `worker-src 'self' blob:` diperlukan untuk Web Worker (pemisahan subjek, ekspor).
 * `img-src` mengizinkan `blob:` dan `data:` karena seluruh pratinjau foto dibuat
 * di peramban dari blob lokal.
 */
function contentSecurityPolicy(isDev: boolean): string {
  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'"
    : "'self' 'unsafe-inline' 'wasm-unsafe-eval'";
  const connectSrc = isDev
    ? "'self' https://staticimgly.com https://cdn.jsdelivr.net ws: wss:"
    : "'self' https://staticimgly.com https://cdn.jsdelivr.net";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  // Jangan bocorkan teknologi yang dipakai lewat header X-Powered-By.
  poweredByHeader: false,
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
   * mengizinkan host model AI yang memang perlu diunduh sekali, sehingga foto
   * tidak mungkin dikirim ke server mana pun.
   */
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy(isDev) },
          // Cegah halaman di-embed di iframe pihak lain (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Matikan fitur peramban yang tidak dipakai agar tidak jadi permukaan serang.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), midi=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          // Kunci sumber daya lintas origin ke origin sendiri.
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
