// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
const API = process.env.API_URL ?? "http://localhost:4000";
export default {
  distDir: process.env.NEXT_DIST_DIR ?? ".next", // e2e memakai direktori terpisah agar tidak mengganggu server dev yang berjalan
  reactStrictMode: true,
  // Same-origin proxy: cookie sesi httpOnly tidak perlu CORS lintas-origin.
  poweredByHeader: false,
  // Header keamanan untuk semua halaman. CSP sengaja minimal (tanpa script-src) agar skrip inline Next tetap jalan:
  // yang ditutup adalah clickjacking (frame-ancestors), plugin (object-src), pembajakan <base>, dan form ke domain lain.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/:path*` }];
  },
};
