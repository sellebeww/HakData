// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { existsSync, readFileSync } from "fs";
import * as path from "path";
// .env root (dev); di CI variabel sudah ada di environment.
const envFile = path.join(__dirname, "../../../.env");
if (existsSync(envFile))
  for (const l of readFileSync(envFile, "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
// DB uji terpisah (<nama>_test; TEST_DATABASE_URL untuk menimpa): test tidak mengotori data dev/demo, dan selalu mulai dari seed bersih
// (test/global-setup.ts). Penanda mencegah sufiks ditambahkan dua kali saat setup dimuat ulang per berkas.
if (process.env.HD_TEST_DB !== "1") {
  const u = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!);
  if (!process.env.TEST_DATABASE_URL && !u.pathname.endsWith("_test")) u.pathname += "_test";
  process.env.DATABASE_URL = u.toString();
  process.env.HD_TEST_DB = "1";
}
process.env.DISABLE_SCHEDULER = "1";
process.env.RABBIT_PREFIX = "hakdata_test";
process.env.UPLOAD_DIR = "/tmp/hakdata-test-evidence";
process.env.RATE_LIMIT = "100000";
process.env.AUTH_RATE_LIMIT = "100000";
