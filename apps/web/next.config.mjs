// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
const API = process.env.API_URL ?? "http://localhost:4000";
export default {
  reactStrictMode: true,
  // Same-origin proxy: cookie sesi httpOnly tidak perlu CORS lintas-origin.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/:path*` }];
  },
};
