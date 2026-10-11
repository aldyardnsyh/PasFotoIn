import { describe, expect, it } from "vitest";
import {
  applyGains,
  applyLevels,
  buildLevelsLut,
  computeAutoLevels,
  computeAutoWhiteBalance,
  computeHistogram,
  describeHistogram,
  detectClipping,
  histogramPeak,
} from "../../src/lib/histogram";

function makeImage(pixels: number[][]): { data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a = 255], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  });
  return { data };
}

/** Isi gambar dengan satu nilai abu-abu. */
function flat(count: number, value: number, alpha = 255) {
  return makeImage(Array.from({ length: count }, () => [value, value, value, alpha]));
}

describe("computeHistogram", () => {
  it("menghitung piksel pada bin yang benar", () => {
    const img = makeImage([
      [0, 0, 0],
      [255, 255, 255],
      [128, 128, 128],
    ]);
    const h = computeHistogram(img);
    expect(h.total).toBe(3);
    expect(h.r[0]).toBe(1);
    expect(h.r[255]).toBe(1);
    expect(h.r[128]).toBe(1);
  });

  it("luminance memakai bobot Rec.709 (hijau paling dominan)", () => {
    const img = makeImage([[255, 0, 0], [0, 255, 0], [0, 0, 255]]);
    const h = computeHistogram(img);
    // Merah: 0.2126*255 = 54; hijau: 0.7152*255 = 182; biru: 0.0722*255 = 18.
    expect(h.lum[54]).toBe(1);
    expect(h.lum[182]).toBe(1);
    expect(h.lum[18]).toBe(1);
  });

  it("melewati piksel transparan", () => {
    const img = makeImage([
      [100, 100, 100, 0],
      [100, 100, 100, 255],
    ]);
    const h = computeHistogram(img);
    expect(h.total).toBe(1);
    expect(h.r[100]).toBe(1);
  });

  it("total nol untuk gambar kosong", () => {
    const h = computeHistogram(makeImage([]));
    expect(h.total).toBe(0);
  });
});

describe("histogramPeak", () => {
  it("menemukan nilai tertinggi", () => {
    const arr = new Uint32Array(256);
    arr[10] = 5;
    arr[200] = 42;
    expect(histogramPeak(arr)).toBe(42);
  });
});

describe("detectClipping", () => {
  it("mendeteksi clipping hitam", () => {
    const img = makeImage(Array.from({ length: 100 }, () => [0, 0, 0]));
    const clip = detectClipping(computeHistogram(img));
    expect(clip.lumBlackPct).toBeCloseTo(100, 0);
  });

  it("mendeteksi clipping putih", () => {
    const img = makeImage(Array.from({ length: 100 }, () => [255, 255, 255]));
    const clip = detectClipping(computeHistogram(img));
    expect(clip.lumWhitePct).toBeCloseTo(100, 0);
  });

  it("foto midtone tidak terdeteksi clipping", () => {
    const img = flat(100, 128);
    const clip = detectClipping(computeHistogram(img));
    expect(clip.lumBlackPct).toBe(0);
    expect(clip.lumWhitePct).toBe(0);
  });
});

describe("computeAutoLevels", () => {
  it("foto gelap: black point mendekati nilai dominan", () => {
    // Semua piksel di 40-60: auto levels harus merentangkan ke 0..255.
    const img = makeImage(Array.from({ length: 200 }, (_, i) => [40 + (i % 21), 40 + (i % 21), 40 + (i % 21)]));
    const levels = computeAutoLevels(computeHistogram(img));
    expect(levels.black).toBeGreaterThanOrEqual(38);
    expect(levels.black).toBeLessThanOrEqual(62);
    expect(levels.white).toBeGreaterThan(levels.black);
  });

  it("foto kontras penuh tidak berubah banyak", () => {
    const img = makeImage([
      [0, 0, 0],
      [255, 255, 255],
      [128, 128, 128],
      [64, 64, 64],
      [192, 192, 192],
    ]);
    const levels = computeAutoLevels(computeHistogram(img));
    expect(levels.black).toBeLessThanOrEqual(5);
    expect(levels.white).toBeGreaterThanOrEqual(250);
  });

  it("gamma berada di rentang wajar", () => {
    const img = flat(100, 100);
    const levels = computeAutoLevels(computeHistogram(img));
    expect(levels.gamma).toBeGreaterThanOrEqual(0.33);
    expect(levels.gamma).toBeLessThanOrEqual(3);
  });
});

describe("buildLevelsLut + applyLevels", () => {
  it("LUT memetakan black ke 0 dan white ke 255", () => {
    const lut = buildLevelsLut(50, 200, 1);
    expect(lut[50]).toBe(0);
    expect(lut[200]).toBe(255);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
  });

  it("gamma > 1 menerangkan midtone", () => {
    const neutral = buildLevelsLut(0, 255, 1);
    const brighter = buildLevelsLut(0, 255, 2);
    expect(brighter[128]).toBeGreaterThan(neutral[128]);
  });

  it("gamma < 1 menggelapkan midtone", () => {
    const neutral = buildLevelsLut(0, 255, 1);
    const darker = buildLevelsLut(0, 255, 0.5);
    expect(darker[128]).toBeLessThan(neutral[128]);
  });

  it("applyLevels mengubah RGB tapi tidak alfa", () => {
    const img = makeImage([[100, 100, 100, 128]]);
    applyLevels(img, buildLevelsLut(100, 200, 1));
    expect(img.data[0]).toBe(0);
    expect(img.data[3]).toBe(128);
  });
});

describe("computeAutoWhiteBalance", () => {
  it("foto netral tidak perlu koreksi", () => {
    const img = flat(100, 128);
    const wb = computeAutoWhiteBalance(img);
    expect(wb.needed).toBe(false);
    expect(wb.gains[0]).toBeCloseTo(1, 1);
  });

  it("foto kekuningan: gain biru naik, merah turun", () => {
    const img = makeImage(Array.from({ length: 100 }, () => [200, 180, 120]));
    const wb = computeAutoWhiteBalance(img);
    expect(wb.needed).toBe(true);
    expect(wb.gains[2]).toBeGreaterThan(wb.gains[0]);
  });

  it("foto kebiruan: gain merah naik", () => {
    const img = makeImage(Array.from({ length: 100 }, () => [120, 160, 210]));
    const wb = computeAutoWhiteBalance(img);
    expect(wb.gains[0]).toBeGreaterThan(wb.gains[2]);
  });

  it("gain selalu dijepit dalam batas aman", () => {
    const img = makeImage(Array.from({ length: 100 }, () => [255, 10, 10]));
    const wb = computeAutoWhiteBalance(img);
    for (const g of wb.gains) {
      expect(g).toBeGreaterThanOrEqual(0.7);
      expect(g).toBeLessThanOrEqual(1.4);
    }
  });

  it("applyGains mengubah kanal sesuai gain", () => {
    const img = makeImage([[100, 100, 100]]);
    applyGains(img, [1.2, 1, 0.8]);
    expect(img.data[0]).toBeGreaterThan(100);
    expect(img.data[1]).toBe(100);
    expect(img.data[2]).toBeLessThan(100);
  });
});

describe("describeHistogram", () => {
  it("foto seimbang memberi pesan positif", () => {
    // Gradien penuh 0..255: distribusi merata, tidak ada penumpukan di ujung.
    const img = makeImage(Array.from({ length: 256 }, (_, i) => [i, i, i]));
    expect(describeHistogram(computeHistogram(img))).toContain("seimbang");
  });

  it("foto gelap berlebih menyebut area gelap terpotong", () => {
    const img = makeImage(Array.from({ length: 100 }, () => [0, 0, 0]));
    expect(describeHistogram(computeHistogram(img))).toContain("gelap");
  });

  it("foto terang berlebih menyebut area terang terpotong", () => {
    const img = makeImage(Array.from({ length: 100 }, () => [255, 255, 255]));
    expect(describeHistogram(computeHistogram(img))).toContain("terang");
  });

  it("foto kebiruan terdeteksi dingin", () => {
    const img = makeImage(Array.from({ length: 200 }, (_, i) => [100 + (i % 5), 120, 190]));
    expect(describeHistogram(computeHistogram(img))).toContain("dingin");
  });
});
