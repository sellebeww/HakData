// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { promises as fs, createReadStream } from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { config } from "./config";

/** File bukti disimpan di luar direktori publik dengan nama acak; akses hanya lewat endpoint terotorisasi. */
export async function saveFile(buf: Buffer) {
  await fs.mkdir(config.uploadDir, { recursive: true });
  const key = randomUUID();
  await fs.writeFile(path.join(config.uploadDir, key), buf, { mode: 0o600 });
  return key;
}
export const fileStream = (key: string) => createReadStream(path.join(config.uploadDir, path.basename(key)));
export const removeFile = (key: string) => fs.rm(path.join(config.uploadDir, path.basename(key)), { force: true });
