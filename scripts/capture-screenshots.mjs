/**
 * Ambil screenshot halaman dan fitur PasFotoIn untuk dokumentasi README.
 *
 * Jalankan lewat qa_app.py supaya server produksi hidup, skrip selesai, lalu
 * server dimatikan otomatis:
 *
 *   python "C:\Users\aldya\.agents\skills\browser-qa-py\qa_app.py" `
 *     --app-cmd "npm run start -- -p 3210" `
 *     --workdir "<repo>" `
 *     --url "http://127.0.0.1:3210/" `
 *     --cmd "node scripts/capture-screenshots.mjs"
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "screenshots");
const PHOTO = path.join(ROOT, "tests", "fixtures", "photo.png");
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3210";

fs.mkdirSync(OUT, { recursive: true });

/** Tunggu kanvas siap supaya screenshot tidak menangkap layar kosong. */
async function waitCanvas(page) {
  await page.locator('canvas[role="img"]').first().waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(1200);
}

async function openTab(page, name) {
  const close = page.getByRole("button", { name: "Tutup", exact: true });
  if (await close.isVisible().catch(() => false)) await close.click();
  await page.getByRole("button", { name, exact: true }).last().click();
  await page.waitForTimeout(700);
}

async function shot(page, name, opts = {}) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, ...opts });
  console.log(`SAVED ${path.relative(ROOT, file)}`);
}

const browser = await chromium.launch();

try {
  // ---------- Desktop ----------
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // Beranda
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "01-beranda");
  await shot(page, "02-beranda-lengkap", { fullPage: true });

  // Editor: unggah fixture
  await page.locator('input[type="file"]').first().setInputFiles(PHOTO);
  await page.waitForURL(/\/editor/, { timeout: 20000 });
  await waitCanvas(page);
  await shot(page, "03-editor-rasio");

  // Tab Rasio -> pilih preset KTP/SIM (rasio 3x4, latar merah resmi, mode Muat)
  await openTab(page, "Rasio");
  await page.getByRole("button", { name: /KTP \/ SIM/ }).last().click();
  await page.waitForTimeout(1200);
  await shot(page, "04-editor-preset-dokumen-kpt");

  // Tab Latar
  await openTab(page, "Latar");
  await shot(page, "05-editor-latar");

  // Tab Sesuaikan (histogram + slider)
  await openTab(page, "Sesuaikan");
  await shot(page, "06-editor-sesuaikan");

  // Tab Ekspor
  await openTab(page, "Ekspor");
  await shot(page, "07-editor-ekspor");

  // Dialog ekspor
  await page.getByRole("button", { name: "Ekspor", exact: true }).first().click();
  await page.getByRole("dialog", { name: "Ekspor foto" }).waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(2500);
  await shot(page, "08-dialog-ekspor");
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);

  // Halaman tentang
  await page.goto(`${BASE}/about`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "09-tentang", { fullPage: true });

  await ctx.close();

  // ---------- Mobile ----------
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const mp = await mctx.newPage();
  await mp.goto(BASE, { waitUntil: "networkidle" });
  await mp.waitForTimeout(800);
  await shot(mp, "10-beranda-mobile");

  await mp.locator('input[type="file"]').first().setInputFiles(PHOTO);
  await mp.waitForURL(/\/editor/, { timeout: 20000 });
  await waitCanvas(mp);
  await shot(mp, "11-editor-mobile");

  const settings = mp.getByRole("button", { name: "Pengaturan", exact: true });
  if (await settings.isVisible().catch(() => false)) {
    await settings.click();
    await mp.waitForTimeout(700);
    await shot(mp, "12-editor-mobile-bottomsheet");
  }

  await mctx.close();
  console.log("DONE");
} finally {
  await browser.close();
}
