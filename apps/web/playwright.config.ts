// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { defineConfig } from "@playwright/test";
// Mengasumsikan API (:4000) dan web (:3000) sudah berjalan: lihat README.
export default defineConfig({ testDir: "./e2e", timeout: 90_000, workers: 1, use: { baseURL: process.env.WEB_URL ?? "http://localhost:3000", screenshot: "only-on-failure" }, reporter: "list" });
