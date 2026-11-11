// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
// Sekali per `pnpm test:int`: DB uji dibuat ulang dari migrasi lalu di-seed, sehingga hasil test tidak bergantung pada isi DB dev
// dan CI (yang tidak pernah menjalankan seed) memakai data yang sama dengan lokal.
import { execSync } from "child_process";
import * as path from "path";
import "./setup"; // menghitung DATABASE_URL uji saat modul dimuat

export default function globalSetup() {
  const run = (cmd: string) => {
    try {
      execSync(cmd, { cwd: path.join(__dirname, ".."), env: process.env, stdio: "pipe" });
    } catch (e) {
      const err = e as { stdout?: Buffer; stderr?: Buffer };
      throw new Error(`${cmd} gagal:\n${err.stdout ?? ""}${err.stderr ?? ""}`);
    }
  };
  run("pnpm exec prisma migrate reset --force --skip-generate --skip-seed");
  run("pnpm exec ts-node prisma/seed.ts");
}
