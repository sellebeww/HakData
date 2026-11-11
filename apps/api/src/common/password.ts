// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
// argon2id lewat node:crypto (Node >= 24.7), format PHC standar agar kompatibel bila nanti pindah ke paket `argon2`.
import * as crypto from "node:crypto";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import * as bcrypt from "bcryptjs";

// @types/node 22 belum mengenal crypto.argon2 (ada di runtime Node >= 24.7)
const argon2 = (crypto as unknown as { argon2?: never }).argon2;
if (typeof argon2 !== "function")
  throw new Error(`Hak Data butuh Node >= 24.7 (crypto.argon2); terpasang ${process.version}. Lihat .nvmrc.`);
const run = promisify(argon2) as (alg: "argon2id", p: Record<string, unknown>) => Promise<Buffer>;
// OWASP: m=19 MiB, t=2, p=1
const M = 19456,
  T = 2,
  P = 1,
  LEN = 32;
const b64 = (b: Buffer) => b.toString("base64").replace(/=+$/, "");

const derive = (pw: string, salt: Buffer, m = M, t = T, p = P) =>
  run("argon2id", { message: pw, nonce: salt, memory: m, passes: t, parallelism: p, tagLength: LEN });

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `$argon2id$v=19$m=${M},t=${T},p=${P}$${b64(salt)}$${b64(await derive(pw, salt))}`;
}

/** Hash untuk perbandingan palsu saat email tidak ada, agar waktu respons seragam. */
export const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));

export async function verifyPassword(pw: string, stored: string): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (stored.startsWith("$2")) return { ok: await bcrypt.compare(pw, stored), needsRehash: true }; // hash bcrypt lama (D-006)
  const m = stored.match(/^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/);
  if (!m) return { ok: false, needsRehash: false };
  const want = Buffer.from(m[5], "base64");
  const got = await derive(pw, Buffer.from(m[4], "base64"), +m[1], +m[2], +m[3]);
  return { ok: got.length === want.length && timingSafeEqual(got, want), needsRehash: +m[1] !== M || +m[2] !== T || +m[3] !== P };
}
