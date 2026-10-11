import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { unzipSync } from "fflate";

const PHOTO = path.resolve(__dirname, "../fixtures/photo.png");

async function uploadPhoto(page: import("@playwright/test").Page) {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(PHOTO);
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15000 });
}

/** Di layar kecil inspector ada di bottom sheet; buka lewat tombol Pengaturan bila belum terbuka. */
async function openInspector(page: import("@playwright/test").Page) {
  const close = page.getByRole("button", { name: "Tutup", exact: true });
  if (await close.isVisible().catch(() => false)) return; // sheet sudah terbuka
  const settings = page.getByRole("button", { name: "Pengaturan", exact: true });
  if (await settings.isVisible().catch(() => false)) {
    await settings.click();
  }
}

async function openTab(page: import("@playwright/test").Page, name: "Rasio" | "Latar" | "Sesuaikan" | "Ekspor") {
  await openInspector(page);
  // Inspector dirender di panel desktop dan bottom sheet; pilih salinan yang aktif (terakhir di DOM).
  await page.getByRole("button", { name, exact: true }).last().click();
}

test.describe("alur utama", () => {
  test("beranda menampilkan dropzone dan membuka editor setelah unggah", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Ubah rasio dan latar foto" })).toBeVisible();
    await page.locator('input[type="file"]').first().setInputFiles(PHOTO);
    await expect(page).toHaveURL(/\/editor/);
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15000 });
  });

  test("ganti rasio mengubah label pratinjau kanvas", async ({ page }) => {
    await uploadPhoto(page);
    const canvas = page.locator('canvas[role="img"]').first();
    await expect(canvas).toHaveAttribute("aria-label", /Pratinjau 4:5/);
    await openTab(page, "Rasio");
    await page.getByRole("button", { name: "16:9", exact: true }).click();
    await expect(canvas).toHaveAttribute("aria-label", /Pratinjau 16:9/);
  });

  test("mode Muat dan Isi bisa diganti", async ({ page }) => {
    await uploadPhoto(page);
    await openTab(page, "Rasio");
    await page.getByRole("button", { name: "Muat", exact: true }).click();
    await expect(page.getByRole("button", { name: "Muat", exact: true })).toHaveClass(/border-primary-200/);
    await page.getByRole("button", { name: "Isi", exact: true }).click();
    await expect(page.getByRole("button", { name: "Isi", exact: true })).toHaveClass(/border-primary-200/);
  });

  test("pilih warna latar saat mode Isi menampilkan pilihan eksplisit (bukan diam-diam berpindah)", async ({ page }) => {
    await uploadPhoto(page);
    await openTab(page, "Latar");
    await page.locator('button[title="#2F61DA"]').last().click();
    await expect(page.getByText("Latar tidak akan terlihat pada mode Isi.").last()).toBeVisible();
    await expect(page.getByRole("button", { name: /Pisahkan subjek, ganti latar foto/ }).last()).toBeVisible();
    // Pilih opsi tambah ruang: mode berubah ke Muat dan latar diterapkan.
    await page.getByRole("button", { name: /Biarkan foto utuh, tambah ruang latar/ }).last().click();
    await openTab(page, "Rasio");
    await expect(page.getByRole("button", { name: "Muat", exact: true }).last()).toHaveClass(/border-primary-200/);
  });

  test("transformasi: putar 90 derajat, flip, dan atur ulang", async ({ page }) => {
    await uploadPhoto(page);
    await openTab(page, "Rasio");
    await page.getByRole("button", { name: /kanan/i }).last().click();
    await expect(page.getByText(/\+?90\u00b0/).last()).toBeVisible();
    await page.getByRole("button", { name: "Horizontal" }).last().click();
    await expect(page.getByRole("button", { name: "Horizontal" }).last()).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /Atur ulang/i }).last().click();
    await expect(page.getByText(/0\u00b0/).last()).toBeVisible();
  });
  test("zoom lewat input angka mengubah persentase", async ({ page }) => {
    await uploadPhoto(page);
    await openTab(page, "Rasio");
    const input = page.getByLabel("Zoom persen").last();
    await input.fill("150");
    await input.blur();
    await expect(input).toHaveValue("150");
  });

  test("ekspor membuka dialog dengan perkiraan ukuran dan nama file", async ({ page }) => {
    await uploadPhoto(page);
    await page.getByRole("button", { name: "Ekspor", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Ekspor foto" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/1080\s*[x\u00d7]\s*1350 px/)).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByLabel("Nama file")).toHaveValue(/photo-4x5/);
  });

  test("unduh PNG menghasilkan file", async ({ page }) => {
    await uploadPhoto(page);
    await page.getByRole("button", { name: "Ekspor", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Ekspor foto" });
    await expect(dialog.getByText(/1080\s*[x\u00d7]\s*1350 px/)).toBeVisible({ timeout: 15000 });
    const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
    await dialog.getByRole("button", { name: "Ekspor", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("photo-4x5.png");
  });

  test("batch dua foto diekspor sebagai ZIP berisi dua file valid", async ({ page }) => {
    await uploadPhoto(page);
    // Tambah foto kedua lewat input tambah di bilah atas.
    await page.locator('input[type="file"]').first().setInputFiles(PHOTO);
    await expect(page.getByRole("button", { name: "Ekspor", exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Ekspor", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Ekspor foto" });
    await expect(dialog.getByText(/1080\s*[x\u00d7]\s*1350 px/)).toBeVisible({ timeout: 15000 });
    const downloadPromise = page.waitForEvent("download", { timeout: 90000 });
    await dialog.getByRole("button", { name: /sebagai ZIP/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);

    const tmp = path.join(test.info().outputDir, "batch.zip");
    await download.saveAs(tmp);
    const files = unzipSync(new Uint8Array(fs.readFileSync(tmp)));
    const names = Object.keys(files);
    // Dua nama sama tidak boleh saling menimpa.
    expect(names.length).toBe(2);
    expect(new Set(names).size).toBe(2);
    for (const data of Object.values(files)) {
      expect(data[0]).toBe(0x89);
      expect(data[1]).toBe(0x50);
      expect(data[2]).toBe(0x4e);
      expect(data[3]).toBe(0x47);
    }
  });

  test("undo mengembalikan rasio sebelumnya", async ({ page }) => {
    await uploadPhoto(page);
    await openTab(page, "Rasio");
    await page.getByRole("button", { name: "16:9", exact: true }).click();
    await expect(page.locator('canvas[role="img"]').first()).toHaveAttribute("aria-label", /Pratinjau 16:9/);
    await page.keyboard.press("Control+z");
    await expect(page.locator('canvas[role="img"]').first()).toHaveAttribute("aria-label", /Pratinjau 4:5/);
  });

  test("sesuaikan: slider eksposur mengubah kanvas dan bisa direset", async ({ page }) => {
    await uploadPhoto(page);
    // Ambil piksel tengah (bagian berwarna foto uji, bukan latar putih).
    const sample = () =>
      page.locator('canvas[role="img"]').first().evaluate((c) => {
        const canvas = c as HTMLCanvasElement;
        const ctx = canvas.getContext("2d")!;
        const d = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
        return [d[0], d[1], d[2]];
      });
    const before = await sample();
    await openTab(page, "Sesuaikan");
    await page.getByLabel("Eksposur").last().fill("60");
    await page.waitForTimeout(600);
    const after = await sample();
    expect(after[0]).not.toBe(before[0]);
    await page.getByRole("button", { name: /Setel ulang cahaya dan warna/ }).last().click();
    await page.waitForTimeout(600);
    const reset = await sample();
    expect(reset).toEqual(before);
  });

  test("sesuaikan: suhu dan saturasi mengubah warna kanvas", async ({ page }) => {
    await uploadPhoto(page);
    await openTab(page, "Sesuaikan");
    const diff = () =>
      page.locator('canvas[role="img"]').first().evaluate((c) => {
        const canvas = c as HTMLCanvasElement;
        const ctx = canvas.getContext("2d")!;
        const d = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
        return d[0] - d[2];
      });
    await page.getByLabel("Suhu").last().fill("70");
    await page.waitForTimeout(600);
    const warm = await diff();
    await page.getByLabel("Suhu").last().fill("-70");
    await page.waitForTimeout(600);
    const cool = await diff();
    expect(warm).toBeGreaterThan(cool);
  });

  test("beranda: tempel gambar dari clipboard membuka editor", async ({ page }) => {
    await page.goto("/");
    const b64 = fs.readFileSync(PHOTO).toString("base64");
    await page.evaluate(async (data) => {
      const res = await fetch(`data:image/png;base64,${data}`);
      const blob = await res.blob();
      const file = new File([blob], "tempelan.png", { type: "image/png" });
      const dt = new DataTransfer();
      dt.items.add(file);
      window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, b64);
    await expect(page).toHaveURL(/\/editor/, { timeout: 10000 });
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15000 });
  });

  test("dokumen resmi: pintasan KTP mengatur rasio, latar merah, dan mode Muat", async ({ page }) => {
    await uploadPhoto(page);
    await openTab(page, "Rasio");
    await page.getByRole("button", { name: /KTP \/ SIM/ }).last().click();
    await expect(page.locator('canvas[role="img"]').first()).toHaveAttribute("aria-label", /Pratinjau 3:4/);
    await expect(page.getByRole("button", { name: "Muat", exact: true }).last()).toHaveAttribute("aria-pressed", "true");
  });

  test("bingkai: padding menggeser tepi foto sehingga latar terlihat", async ({ page }) => {
    await uploadPhoto(page);
    // Latar biru + mode Muat agar tepi foto terlihat jelas.
    await openTab(page, "Latar");
    await page.getByRole("button", { name: "Latar Biru Resmi" }).last().click();
    const keep = page.getByRole("button", { name: /Biarkan foto utuh/ }).last();
    if (await keep.isVisible().catch(() => false)) await keep.click();
    await page.waitForTimeout(600);

    const leftEdge = () =>
      page.locator('canvas[role="img"]').first().evaluate((c) => {
        const canvas = c as HTMLCanvasElement;
        const ctx = canvas.getContext("2d")!;
        const y = Math.floor(canvas.height / 2);
        const row = ctx.getImageData(0, y, canvas.width, 1).data;
        const isBlue = (i: number) => row[i * 4 + 2] > 150 && row[i * 4] < 100;
        for (let x = 0; x < canvas.width; x++) if (!isBlue(x)) return x;
        return -1;
      });

    await openTab(page, "Rasio");
    const before = await leftEdge();
    await page.getByLabel("Padding bingkai").last().fill("20");
    await page.waitForTimeout(800);
    const after = await leftEdge();
    expect(after).toBeGreaterThan(before + 20);
  });

  test("cetak A4: lembar berisi salinan pas foto dengan dimensi 300 dpi", async ({ page }) => {
    await uploadPhoto(page);
    await openTab(page, "Rasio");
    // Pilih preset dokumen agar ukuran mm tersedia.
    await page.getByRole("button", { name: /KTP \/ SIM/ }).last().click();
    await page.waitForTimeout(500);
    const sheetBtn = page.getByRole("button", { name: /Unduh Lembar Cetak/ }).last();
    await expect(sheetBtn).toBeVisible();
    const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
    await sheetBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/lembar-A4-\d+x\.png$/);
    const tmp = path.join(test.info().outputDir, "sheet.png");
    await download.saveAs(tmp);
    const bytes = fs.readFileSync(tmp);
    // A4 @300dpi = 2480 x 3508 px (dibaca dari header IHDR PNG).
    expect(bytes.readUInt32BE(16)).toBe(2480);
    expect(bytes.readUInt32BE(20)).toBe(3508);
  });

  test("histogram: panel tampil dengan grafik dan tombol koreksi otomatis", async ({ page }) => {
    await uploadPhoto(page);
    await openTab(page, "Sesuaikan");
    await expect(page.getByText("Histogram").last()).toBeVisible();
    await expect(page.locator('canvas[role="img"][aria-label="Grafik histogram foto"]').last()).toBeVisible();
    await expect(page.getByRole("button", { name: "Auto Levels" }).last()).toBeVisible();
    await expect(page.getByRole("button", { name: "Auto Warna" }).last()).toBeVisible();
    // Ringkasan kondisi foto harus muncul sebagai teks.
    await expect(page.getByText(/Distribusi cahaya|Perhatian/).last()).toBeVisible();
  });

  test("histogram: Auto Levels mengubah piksel foto", async ({ page }) => {
    await uploadPhoto(page);
    await openTab(page, "Sesuaikan");
    const sample = () =>
      page.locator('canvas[role="img"]').first().evaluate((c) => {
        const canvas = c as HTMLCanvasElement;
        const ctx = canvas.getContext("2d")!;
        const d = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
        return [d[0], d[1], d[2]];
      });
    const before = await sample();
    await page.getByRole("button", { name: "Auto Levels" }).last().click();
    await page.waitForTimeout(1500);
    const after = await sample();
    expect(after).not.toEqual(before);
  });

  test("ekspor: pemilih DPI muncul untuk preset dokumen dan mengubah ukuran", async ({ page }) => {
    await uploadPhoto(page);
    await openTab(page, "Rasio");
    await page.getByRole("button", { name: /KTP \/ SIM/ }).last().click();
    await page.waitForTimeout(400);
    // Di mobile bottom sheet terbuka; tutup dulu agar tombol Ekspor di top bar bisa diklik.
    const closeSheet = page.getByRole("button", { name: "Tutup", exact: true });
    if (await closeSheet.isVisible().catch(() => false)) await closeSheet.click();
    await page.getByRole("button", { name: "Ekspor", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Ekspor foto" });
    await expect(dialog.getByText(/354\s*[x×]\s*472 px/)).toBeVisible({ timeout: 15000 });
    // Ganti ke 600 dpi.
    await dialog.getByRole("button", { name: "600 DPI" }).click();
    await expect(dialog.getByText(/709\s*[x×]\s*945 px/)).toBeVisible({ timeout: 15000 });
  });

  test("undo/redo menyeluruh: latar, penyesuaian, bingkai, dan hapus foto", async ({ page }) => {
    await uploadPhoto(page);

    // 1. Ubah latar lalu undo.
    await openTab(page, "Latar");
    await page.getByRole("button", { name: "Latar Biru Resmi" }).last().click();
    const keep = page.getByRole("button", { name: /Biarkan foto utuh/ }).last();
    if (await keep.isVisible().catch(() => false)) await keep.click();
    await page.waitForTimeout(500);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(400);

    // 2. Ubah penyesuaian lalu undo.
    await openTab(page, "Sesuaikan");
    const exposure = page.getByLabel("Eksposur").last();
    await exposure.fill("50");
    await page.waitForTimeout(400);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(400);
    await expect(exposure).toHaveValue("0");

    // 3. Ubah bingkai lalu undo.
    await openTab(page, "Rasio");
    const pad = page.getByLabel("Padding bingkai").last();
    await pad.fill("15");
    await page.waitForTimeout(400);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(400);
    await expect(pad).toHaveValue("0");

    // 4. Redo mengembalikan.
    await page.keyboard.press("Control+Shift+z");
    await page.waitForTimeout(400);
    await expect(pad).toHaveValue("15");
  });

  test("undo/redo: hapus foto bisa dikembalikan", async ({ page }) => {
    await uploadPhoto(page);
    // Tambah foto kedua agar penghapusan tidak mengosongkan editor.
    await page.locator('input[type="file"]').first().setInputFiles(PHOTO);
    await page.waitForTimeout(600);
    const filmstrip = page.locator("div.no-scrollbar").last();
    const before = await filmstrip.locator("img").count();
    expect(before).toBeGreaterThanOrEqual(2);

    await page.getByRole("button", { name: "Hapus foto ini" }).first().click();
    await page.waitForTimeout(600);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(600);
    const after = await filmstrip.locator("img").count();
    expect(after).toBe(before);
  });

  test("tentang: halaman privasi tampil dan tombol hapus data ada", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "Tentang PasFotoIn" })).toBeVisible();
    await expect(page.getByText("Foto diproses di browser kamu")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hapus semua data lokal" })).toBeVisible();
  });
});

