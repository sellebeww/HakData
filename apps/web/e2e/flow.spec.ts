// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const SHOTS = "e2e/screens";
mkdirSync(SHOTS, { recursive: true });

test("alur lengkap pengguna: daftar → cari → surat → kirim → bukti → respons → selesai", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("datamu dipakai");
  await page.screenshot({ path: `${SHOTS}/01-landing.png`, fullPage: true });

  // TEST 1: akun
  await page.getByRole("link", { name: "Mulai gratis" }).click();
  await page.getByLabel("Nama").fill("Budi Santoso");
  await page.getByLabel("Email").fill(`e2e${Date.now()}@test.dev`);
  await page.getByLabel("Kata sandi").fill("RahasiaBanget!2026");
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page.getByRole("heading", { name: /Halo, Budi/ })).toBeVisible();

  // TEST 2-3: cari + detail
  await page.goto("/perusahaan");
  await page.getByLabel("Cari perusahaan").fill("toko");
  await expect(page.getByText("1 perusahaan")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-direktori.png` });
  await page.getByRole("link", { name: /DEMO · Toko Contoh/ }).click();
  await expect(page.getByText("Terverifikasi").first()).toBeVisible();
  await expect(page.getByText(/rasio respons tercatat/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/03-perusahaan.png`, fullPage: true });

  // TEST 4-7: hak, isian, surat, tinjau
  await page.getByRole("link", { name: "Ajukan permintaan data" }).click();
  await page.getByRole("button", { name: /Akses & salinan data/ }).click();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByRole("button", { name: "Buat draf surat" }).click();
  await expect(page.getByText(/Kolom wajib belum diisi/)).toBeVisible(); // validasi
  await page.getByLabel("Nama lengkap").fill("Budi Santoso");
  await page.getByLabel("Email/nomor/username akun").fill("budi@example.com");
  await page.getByRole("button", { name: "Buat draf surat" }).click();
  await expect(page.getByLabel("Isi surat")).toHaveValue(/Pasal 32/);
  await page.screenshot({ path: `${SHOTS}/04-surat.png`, fullPage: true });
  await page.getByRole("button", { name: /setujui/ }).click();
  await expect(page.getByText("Siap dikirim").first()).toBeVisible();

  // TEST 8-10: catat pengiriman 80 jam lalu → tenggat terlewati
  const past = new Date(Date.now() - 80 * 3600e3);
  const loc = new Date(past.getTime() - past.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await page.getByLabel("Waktu dikirim").fill(loc);
  await page.getByRole("button", { name: "Catat pengiriman" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ya, lanjutkan" }).click();
  await expect(page.getByText("Estimasi tenggat terlewati")).toBeVisible();
  await expect(page.getByText(/UU 27\/2022 Pasal 32/).first()).toBeVisible();
  await expect(page.getByText(/merupakan estimasi berdasarkan aturan yang tercatat/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/05-detail.png`, fullPage: true });

  // TEST 11: bukti
  await page.getByRole("tab", { name: "Dossier" }).click();
  writeFileSync("/tmp/bukti.png", PNG);
  await page.getByLabel("Pilih berkas bukti").setInputFiles("/tmp/bukti.png");
  await page.getByRole("button", { name: "Unggah" }).click();
  await expect(page.getByRole("link", { name: "bukti.png" })).toBeVisible();
  await expect(page.getByText("Bukti diunggah: bukti.png")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/06-dossier.png`, fullPage: true });

  // TEST 12-13: reminder (via scheduler backend) + respons
  await page.getByRole("tab", { name: "Respons" }).click();
  await page.getByLabel("Catatan").fill("Balasan otomatis diterima");
  await page.getByRole("button", { name: "Simpan respons" }).click();
  await expect(page.locator("li strong", { hasText: "Diterima/diakui" })).toBeVisible();

  // TEST 14: selesai
  await page.getByRole("tab", { name: "Ringkasan" }).click();
  await page.getByRole("button", { name: "Tandai selesai" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ya, lanjutkan" }).click();
  await expect(page.getByText("Selesai").first()).toBeVisible();

  // notifikasi dari scheduler (aktif di server dev)
  await page.goto("/app/notifikasi");
  await expect(page.getByText("Permintaan berhasil dicatat")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/07-notifikasi.png` });
  expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
});

test("mobile: landing & direktori tidak overflow horizontal", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await ctx.newPage();
  for (const path of ["/", "/perusahaan", "/hak", "/masuk"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, path).toBeLessThanOrEqual(1);
  }
  await page.goto("/");
  await page.screenshot({ path: `${SHOTS}/08-mobile.png`, fullPage: true });
  await ctx.close();
});

test("kontrol akses: halaman app & admin mengarahkan tamu ke masuk", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/masuk/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/masuk/);
});

test("moderator melihat antrean tetapi tidak aturan/audit", async ({ page }) => {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill("moderator@hakdata.demo");
  await page.getByLabel("Kata sandi").fill("DemoPass!2026");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Panel moderator" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Audit log" })).toHaveCount(0);
});

test("admin menerbitkan aturan dan melihat audit log", async ({ page }) => {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill("admin@hakdata.demo");
  await page.getByLabel("Kata sandi").fill("DemoPass!2026");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Aturan hukum" }).click();
  await expect(page.getByText("Semua versi")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/09-admin-aturan.png`, fullPage: true });
  await page.getByRole("tab", { name: "Audit log" }).click();
  await expect(page.getByText("Audit log (hanya baca)")).toBeVisible();
});
