// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
// Happy path dari browser tanpa menyentuh API manual: wizard -> kirim email -> balasan simulasi -> dossier.
// Prasyarat: API dengan DEMO_MODE=true dan DEADLINE_TIME_SCALE=86400 (72 jam = 3 detik), seed terbaru (toko = membalas tepat waktu).
import { expect, test } from "@playwright/test";

test("wizard sampai dossier: pilih perusahaan -> hak -> surat -> kirim email -> balasan simulasi -> dossier", async ({ page }) => {
  await page.goto("/masuk");
  await page.waitForLoadState("networkidle"); // tunggu hidrasi agar submit ditangani React
  await page.getByLabel("Email").fill("user@hakdata.demo");
  await page.getByLabel("Kata sandi").fill("DemoPass!2026");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto("/perusahaan");
  await page.getByLabel("Cari perusahaan").fill("toko");
  await page.getByRole("link", { name: /DEMO · Toko Contoh/ }).click();
  await page.getByRole("link", { name: "Ajukan permintaan data" }).click();
  await page.getByRole("button", { name: /Akses & salinan data/ }).click();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByLabel("Nama lengkap").fill("Budi Santoso");
  await page.getByLabel("Email/nomor/username akun").fill("budi@example.com");
  await page.getByRole("button", { name: "Buat draf surat" }).click();
  await expect(page.getByLabel("Isi surat")).toHaveValue(/Pasal 32/);
  await page.getByRole("button", { name: /setujui/ }).click();
  await page.getByRole("button", { name: "Kirim lewat email sekarang" }).click();

  // detail permintaan: terkirim, tenggat dihitung
  await expect(page.getByText("Terkirim").first()).toBeVisible();
  await expect(page.getByText("Estimasi tenggat").first()).toBeVisible();

  // dossier: bukti kirim, lalu balasan simulasi (tick 1 dtk di server) muncul dengan selisih waktu
  await page.getByRole("link", { name: "Buka dossier" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Dossier");
  await expect(page.getByText(/Message-ID <.+@.+>/)).toBeVisible();
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Simulasi", { exact: true })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByText("Dalam estimasi tenggat")).toBeVisible();
  await expect(page.getByText(/Waktu sejak awal hitungan: 0j/)).toBeVisible();
  await expect(page.getByText(/\[SIMULASI\] Respons perusahaan dicatat/)).toBeVisible();

  // ekspor dapat diunduh
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Unduh ekspor" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^dossier-.+\.md$/);

  // tanpa PII di URL maupun penyimpanan peramban
  expect(page.url()).not.toMatch(/budi|santoso|hakdata\.demo/i);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toMatch(/budi|santoso|hakdata\.demo/i);

  // statistik publik dapat dibuka
  await page.goto("/statistik");
  await expect(page.getByRole("heading", { name: "Statistik publik" })).toBeVisible();
  await expect(page.getByRole("link", { name: /DEMO · Toko Contoh/ })).toBeVisible();
});
