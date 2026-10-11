import type { Adjust } from "./geometry";

/** Bentuk minimal ImageData agar fungsi bisa diuji di Node dan jalan di worker. */
export type PixelData = { data: Uint8ClampedArray };

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Terapkan penyesuaian cahaya dan warna langsung ke piksel.
 * Urutan: levels -> eksposur -> kontras -> sorotan/bayangan -> suhu -> saturasi.
 * Semua lewat LUT per kanal kecuali saturasi, jadi cepat untuk gambar besar.
 */
export function adjustImageData(img: PixelData, a: Adjust): void {
  const px = img.data;
  const n = px.length;

  const gain = Math.pow(2, (a.exposure / 100) * 1.5);
  const c = (a.contrast / 100) * 128;
  const cf = (259 * (c + 255)) / (255 * (259 - c));
  const hi = (a.highlights / 100) * 0.6;
  const sh = (a.shadows / 100) * 0.6;
  const t = a.temperature / 100;
  const gains = [1 + 0.25 * t, 1 + 0.02 * t, 1 - 0.25 * t];

  // Levels diterapkan lebih dulu (seperti di Photoshop): rentangkan tonal range
  // sebelum penyesuaian lain agar hasilnya natural.
  const lvBlack = a.levelBlack ?? 0;
  const lvWhite = a.levelWhite ?? 255;
  const lvGamma = a.levelGamma ?? 1;
  const levelActive = lvBlack !== 0 || lvWhite !== 255 || lvGamma !== 1;
  const span = Math.max(1, lvWhite - lvBlack);
  const invGamma = 1 / Math.max(0.01, lvGamma);

  const luts: Uint8ClampedArray[] = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  for (let ch = 0; ch < 3; ch++) {
    const lut = luts[ch];
    const chGain = gains[ch];
    for (let i = 0; i < 256; i++) {
      let base = i / 255;
      if (levelActive) {
        let v = (i - lvBlack) / span;
        v = v < 0 ? 0 : v > 1 ? 1 : v;
        base = Math.pow(v, invGamma);
      }
      let v = base * gain;
      v = (v - 0.5) * cf + 0.5;
      if (v > 0.5) v = v + (v - 0.5) * hi;
      else v = v + (0.5 - v) * sh;
      v *= chGain;
      lut[i] = Math.round(clamp01(v) * 255);
    }
  }

  const sat = 1 + a.saturation / 100;
  const satActive = a.saturation !== 0;
  const lutR = luts[0];
  const lutG = luts[1];
  const lutB = luts[2];

  for (let p = 0; p < n; p += 4) {
    let r = lutR[px[p]];
    let g = lutG[px[p + 1]];
    let b = lutB[px[p + 2]];
    if (satActive) {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = lum + (r - lum) * sat;
      g = lum + (g - lum) * sat;
      b = lum + (b - lum) * sat;
    }
    px[p] = r;
    px[p + 1] = g;
    px[p + 2] = b;
  }
}

/**
 * Perkirakan suhu warna yang membuat foto netral (white balance otomatis).
 * Memakai asumsi gray-world: rata-rata piksel dianggap abu-abu netral.
 * Mengembalikan nilai slider suhu -100..100.
 */
export function estimateWhiteBalance(img: PixelData): number {
  const px = img.data;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let p = 0; p < px.length; p += 4) {
    if (px[p + 3] < 200) continue;
    r += px[p];
    g += px[p + 1];
    b += px[p + 2];
    count++;
  }
  if (count === 0) return 0;
  r /= count;
  g /= count;
  b /= count;
  const gray = (r + g + b) / 3;
  if (gray < 1) return 0;
  // Foto condong hangat (r > b) butuh suhu negatif agar netral.
  const t = ((b - r) / gray) * 1.4;
  return Math.max(-100, Math.min(100, Math.round(t * 100)));
}
