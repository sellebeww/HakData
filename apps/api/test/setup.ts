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
process.env.DISABLE_SCHEDULER = "1";
process.env.RABBIT_PREFIX = "hakdata_test";
process.env.UPLOAD_DIR = "/tmp/hakdata-test-evidence";
process.env.RATE_LIMIT = "100000";
