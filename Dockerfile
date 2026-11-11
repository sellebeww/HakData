# Copyright (c) 2026 Vassel Goleyu. All rights reserved.
# Satu image untuk api, web, dan migrate (docker-compose.yml memilih perintahnya). Dibangun sekali, di-cache per lapisan.
FROM node:24-alpine

# openssl: engine Prisma di Alpine (musl). Corepack memasang pnpm sesuai "packageManager" di package.json.
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app

# Registry dapat diganti saat build (mis. mirror) tanpa mengurangi keamanan: --frozen-lockfile memverifikasi
# hash sha512 setiap tarball terhadap pnpm-lock.yaml, jadi isi paket tidak bisa berbeda dari yang terkunci.
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV COREPACK_NPM_REGISTRY=$NPM_REGISTRY HUSKY=0 NEXT_TELEMETRY_DISABLED=1

# Manifest dulu: lapisan install hanya dibangun ulang bila dependensi berubah.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm config set registry "$NPM_REGISTRY" && pnpm install --frozen-lockfile

COPY . .
# Rewrite /api -> API dievaluasi Next saat build, jadi alamat API di jaringan compose ditanam di sini.
ENV API_URL=http://api:4000
RUN pnpm --filter @hakdata/api exec prisma generate && pnpm build

# Jalankan sebagai pengguna non-root; hanya direktori yang ditulis saat runtime yang dimiliki `node`.
RUN mkdir -p /data/evidence apps/web/.next/cache && chown -R node:node /data apps/web/.next/cache
USER node
EXPOSE 3000 4000
