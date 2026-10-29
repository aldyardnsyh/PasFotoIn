/**
 * Verifikasi baris hak cipta muncul di setiap halaman dan di tag meta.
 *
 * Jalankan lewat qa_app.py supaya server produksi hidup, skrip selesai, lalu
 * server dimatikan otomatis:
 *
 *   python "C:\Users\aldya\.agents\skills\browser-qa-py\qa_app.py" `
 *     --app-cmd "npm run start -- -p 3210" `
 *     --workdir "<repo>" `
 *     --url "http://127.0.0.1:3210/" `
 *     --cmd "node scripts/check-copyright.mjs"
 */
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PHOTO = path.join(ROOT, "tests", "fixtures", "photo.png");
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3210";
const TEKS = "Hak cipta (c) 2026 PogungSoftwareHouseTeam (PSHT). Seluruh hak dilindungi.";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let gagal = 0;

for (const [nama, url] of [
  ["beranda", "/"],
  ["tentang", "/about"],
]) {
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  const jumlah = await page.getByText(TEKS, { exact: false }).count();
  const tampil = jumlah > 0 ? await page.getByText(TEKS, { exact: false }).first().isVisible() : false;
  console.log(`${nama}: found=${jumlah} visible=${tampil}`);
  if (!tampil) gagal++;
}

// Editor butuh foto agar baris hak cipta di bawah filmstrip tampil.
await page.goto(BASE + "/editor", { waitUntil: "networkidle" });
await page.locator('input[type="file"]').first().waitFor({ state: "attached", timeout: 20000 });
await page.locator('input[type="file"]').first().setInputFiles(PHOTO);
await page.locator('canvas[role="img"]').first().waitFor({ state: "visible", timeout: 20000 });
await page.waitForTimeout(800);
const jumlahEditor = await page.getByText(TEKS, { exact: false }).count();
const tampilEditor =
  jumlahEditor > 0 ? await page.getByText(TEKS, { exact: false }).first().isVisible() : false;
console.log(`editor: found=${jumlahEditor} visible=${tampilEditor}`);
if (!tampilEditor) gagal++;

// Tag meta harus memuat teks yang sama persis.
await page.goto(BASE + "/", { waitUntil: "networkidle" });
const meta = await page.evaluate(() => {
  const ambil = (nama) =>
    Array.from(document.querySelectorAll(`meta[name="${nama}"]`)).map((m) => m.getAttribute("content"));
  return {
    copyright: ambil("copyright"),
    author: ambil("author"),
  };
});
console.log("META:", JSON.stringify(meta));
const metaOk =
  meta.copyright.includes(TEKS) && meta.author.includes("PogungSoftwareHouseTeam (PSHT)");
if (!metaOk) gagal++;

// Tidak boleh ada variasi tahun atau penyebutan pemilik yang berbeda.
const isi = await page.evaluate(() => document.body.innerText);
const variasi = isi.match(/Hak cipta[^\n]*/g) ?? [];
const unik = [...new Set(variasi)];
console.log("VARIASI:", JSON.stringify(unik));
if (unik.length !== 1 || unik[0].trim() !== TEKS) gagal++;

await browser.close();
if (gagal > 0) {
  console.log(`FAIL: ${gagal} pemeriksaan hak cipta gagal.`);
  process.exit(1);
}
console.log("PASS");
