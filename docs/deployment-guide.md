<!-- Copyright (c) 2026 Vassel Goleyu. All rights reserved. -->
# Deployment
Hanya local/dev yang tervalidasi. `docker compose up -d` menyiapkan Postgres dan RabbitMQ (**kredensial dev**). Aplikasi dijalankan lewat npm (lihat README). Health check: `GET /health`.
Produksi, belum dilakukan: Dockerfile aplikasi, TLS/reverse proxy (set `NODE_ENV=production` agar cookie secure dan introspeksi mati), rahasia dari secret manager, volume/penyimpanan objek terenkripsi untuk `UPLOAD_DIR`, backup terenkripsi, 1 instance API (penguncian login in-memory), monitoring error (belum ada Sentry/log terstruktur). Tidak ada deployment berbayar yang dilakukan.
