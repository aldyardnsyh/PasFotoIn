import { describe, expect, it } from "vitest";
import { adjustImageData, estimateWhiteBalance } from "../../src/lib/adjust";
import { DEFAULT_ADJUST } from "../../src/lib/geometry";

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

describe("adjustImageData", () => {
  it("default tidak mengubah piksel", () => {
    const img = makeImage([[120, 80, 200]]);
    adjustImageData(img, { ...DEFAULT_ADJUST });
    expect([img.data[0], img.data[1], img.data[2]]).toEqual([120, 80, 200]);
  });

  it("eksposur positif mencerahkan", () => {
    const img = makeImage([[100, 100, 100]]);
    adjustImageData(img, { ...DEFAULT_ADJUST, exposure: 50 });
    expect(img.data[0]).toBeGreaterThan(100);
  });

  it("eksposur negatif menggelapkan", () => {
    const img = makeImage([[100, 100, 100]]);
    adjustImageData(img, { ...DEFAULT_ADJUST, exposure: -50 });
    expect(img.data[0]).toBeLessThan(100);
  });

  it("saturasi negatif menuju abu-abu", () => {
    const img = makeImage([[200, 50, 50]]);
    adjustImageData(img, { ...DEFAULT_ADJUST, saturation: -100 });
    const [r, g, b] = [img.data[0], img.data[1], img.data[2]];
    expect(Math.abs(r - g)).toBeLessThan(3);
    expect(Math.abs(g - b)).toBeLessThan(3);
  });

  it("saturasi positif memperkuat perbedaan kanal", () => {
    const img = makeImage([[180, 120, 120]]);
    const before = 180 - 120;
    adjustImageData(img, { ...DEFAULT_ADJUST, saturation: 60 });
    const after = img.data[0] - img.data[1];
    expect(after).toBeGreaterThan(before);
  });

  it("suhu positif menghangatkan (merah naik, biru turun)", () => {
    const img = makeImage([[128, 128, 128]]);
    adjustImageData(img, { ...DEFAULT_ADJUST, temperature: 60 });
    expect(img.data[0]).toBeGreaterThan(128);
    expect(img.data[2]).toBeLessThan(128);
  });

  it("suhu negatif mendinginkan", () => {
    const img = makeImage([[128, 128, 128]]);
    adjustImageData(img, { ...DEFAULT_ADJUST, temperature: -60 });
    expect(img.data[0]).toBeLessThan(128);
    expect(img.data[2]).toBeGreaterThan(128);
  });

  it("bayangan membuka area gelap", () => {
    const img = makeImage([[40, 40, 40]]);
    adjustImageData(img, { ...DEFAULT_ADJUST, shadows: 80 });
    expect(img.data[0]).toBeGreaterThan(40);
  });

  it("sorotan negatif menahan area terang", () => {
    const img = makeImage([[230, 230, 230]]);
    adjustImageData(img, { ...DEFAULT_ADJUST, highlights: -80 });
    expect(img.data[0]).toBeLessThan(230);
  });

  it("kanal alfa tidak tersentuh", () => {
    const img = makeImage([[100, 100, 100, 128]]);
    adjustImageData(img, { ...DEFAULT_ADJUST, exposure: 80 });
    expect(img.data[3]).toBe(128);
  });

  it("nilai tidak keluar dari rentang 0-255", () => {
    const img = makeImage([[250, 250, 250]]);
    adjustImageData(img, { ...DEFAULT_ADJUST, exposure: 100, saturation: 100, temperature: 100 });
    expect(img.data[0]).toBeLessThanOrEqual(255);
    expect(img.data[2]).toBeGreaterThanOrEqual(0);
  });
});

describe("estimateWhiteBalance", () => {
  it("foto netral menghasilkan sekitar nol", () => {
    const img = makeImage(Array.from({ length: 100 }, () => [128, 128, 128]));
    expect(Math.abs(estimateWhiteBalance(img))).toBeLessThanOrEqual(3);
  });

  it("foto kekuningan menghasilkan nilai negatif (didinginkan)", () => {
    const img = makeImage(Array.from({ length: 100 }, () => [200, 180, 120]));
    expect(estimateWhiteBalance(img)).toBeLessThan(-10);
  });

  it("foto kebiruan menghasilkan nilai positif (dihangatkan)", () => {
    const img = makeImage(Array.from({ length: 100 }, () => [120, 160, 210]));
    expect(estimateWhiteBalance(img)).toBeGreaterThan(10);
  });

  it("mengabaikan piksel transparan", () => {
    const img = makeImage([
      [200, 180, 120, 0],
      [128, 128, 128, 255],
    ]);
    expect(Math.abs(estimateWhiteBalance(img))).toBeLessThanOrEqual(5);
  });
});
