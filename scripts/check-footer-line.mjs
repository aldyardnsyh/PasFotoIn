/**
 * Cek footer pada beberapa lebar layar: desktop harus satu baris, dan tidak
 * boleh ada overflow horizontal di lebar mana pun.
 *
 * Jalankan lewat qa_app.py.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3210";
const TEKS = "Hak cipta (c) 2026 PogungSoftwareHouseTeam (PSHT). Seluruh hak dilindungi.";

const browser = await chromium.launch();
let gagal = 0;

for (const lebar of [1440, 1280, 1024, 768, 390]) {
  const ctx = await browser.newContext({ viewport: { width: lebar, height: 900 } });
  const page = await ctx.newPage();

  for (const [nama, url] of [
    ["beranda", "/"],
    ["tentang", "/about"],
  ]) {
    await page.goto(BASE + url, { waitUntil: "networkidle" });
    const h = await page.evaluate((teks) => {
      const el = Array.from(document.querySelectorAll("span, p")).find(
        (n) => (n.textContent ?? "").trim() === teks,
      );
      const doc = document.documentElement;
      if (!el) return { ada: false };
      const r = el.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
      return {
        ada: true,
        baris: Math.round(r.height / lh),
        overflow: doc.scrollWidth > doc.clientWidth,
        scrollW: doc.scrollWidth,
        clientW: doc.clientWidth,
      };
    }, TEKS);

    // Desktop (>=1024) wajib satu baris. Di bawah itu boleh terlipat.
    const wajibSatuBaris = lebar >= 1024;
    const ok = h.ada && !h.overflow && (!wajibSatuBaris || h.baris === 1);
    console.log(`${lebar}px ${nama}: ${JSON.stringify(h)} ok=${ok}`);
    if (!ok) gagal++;
  }
  await ctx.close();
}

await browser.close();
if (gagal > 0) {
  console.log(`FAIL: ${gagal} pemeriksaan footer gagal.`);
  process.exit(1);
}
console.log("PASS");
