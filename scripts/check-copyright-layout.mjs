/**
 * Cek overflow horizontal pada halaman editor setelah baris hak cipta ditambahkan.
 *
 * Jalankan lewat qa_app.py.
 */
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PHOTO = path.join(ROOT, "tests", "fixtures", "photo.png");
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3210";

const browser = await chromium.launch();
let gagal = 0;

for (const [nama, viewport] of [
  ["mobile", { width: 390, height: 844 }],
  ["desktop", { width: 1440, height: 900 }],
]) {
  const ctx = await browser.newContext({ viewport, isMobile: nama === "mobile", hasTouch: nama === "mobile" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/editor", { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').first().waitFor({ state: "attached", timeout: 20000 });
  await page.locator('input[type="file"]').first().setInputFiles(PHOTO);
  await page.locator('canvas[role="img"]').first().waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(900);

  const cek = await page.evaluate(() => {
    const doc = document.documentElement;
    // Baris hak cipta bisa dirender sebagai <p> mandiri atau <span> sebaris
    // di dalam footer, jadi cari elemen mana pun yang teksnya persis.
    const hakCipta = Array.from(document.querySelectorAll("p, span")).find((n) =>
      (n.textContent ?? "").trim().startsWith("Hak cipta (c)"),
    );
    return {
      scrollW: doc.scrollWidth,
      clientW: doc.clientWidth,
      hakCiptaRects: hakCipta ? hakCipta.getClientRects().length : 0,
      hakCiptaWidth: hakCipta ? hakCipta.getBoundingClientRect().width : 0,
      hakCiptaTampil: hakCipta ? hakCipta.getClientRects().length > 0 : false,
    };
  });

  const overflow = cek.scrollW > cek.clientW;
  console.log(`${nama}: ${JSON.stringify(cek)} overflow=${overflow}`);
  if (overflow || !cek.hakCiptaTampil) gagal++;
  await ctx.close();
}

await browser.close();
if (gagal > 0) {
  console.log(`FAIL: ${gagal} masalah layout hak cipta.`);
  process.exit(1);
}
console.log("PASS");
