import { describe, expect, it } from "vitest";
import { DEFAULT_ENHANCE, ENHANCE_OFF, enhanceImageData } from "../../src/lib/enhance";

/** Buat ImageData tiruan dengan pola kotak: kiri gelap, kanan terang. */
function makeEdgeImage(w = 40, h = 40): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const v = x < w / 2 ? 80 : 180;
      data[p] = v;
      data[p + 1] = v;
      data[p + 2] = v;
      data[p + 3] = 255;
    }
  }
  return { data, width: w, height: h, colorSpace: "srgb" } as ImageData;
}

/** Buat gambar berwarna (untuk memverifikasi hue tidak bergeser). */
function makeColorImage(w = 30, h = 30): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const t = x / w;
      data[p] = 200;
      data[p + 1] = 100 + t * 60;
      data[p + 2] = 60 + t * 40;
      data[p + 3] = 255;
    }
  }
  return { data, width: w, height: h, colorSpace: "srgb" } as ImageData;
}

const pixelAt = (img: ImageData, x: number, y: number) => {
  const p = (y * img.width + x) * 4;
  return [img.data[p], img.data[p + 1], img.data[p + 2], img.data[p + 3]];
};

describe("enhanceImageData", () => {
  it("ENHANCE_OFF tidak mengubah apa pun", () => {
    const img = makeEdgeImage();
    const before = Array.from(img.data);
    enhanceImageData(img, ENHANCE_OFF);
    expect(Array.from(img.data)).toEqual(before);
  });

  it("penajaman meningkatkan kontras di sekitar tepi", () => {
    const img = makeEdgeImage();
    const w = img.width;
    const beforeDark = pixelAt(img, w / 2 - 1, 20)[0];
    const beforeLight = pixelAt(img, w / 2, 20)[0];
    enhanceImageData(img, { ...DEFAULT_ENHANCE, clarity: 0, denoise: 0, sharpen: 80 });
    const afterDark = pixelAt(img, w / 2 - 1, 20)[0];
    const afterLight = pixelAt(img, w / 2, 20)[0];
    // Sisi gelap makin gelap, sisi terang makin terang (efek unsharp mask).
    expect(afterDark).toBeLessThan(beforeDark);
    expect(afterLight).toBeGreaterThan(beforeLight);
  });

  it("tidak menggeser hue warna", () => {
    const img = makeColorImage();
    // Dengan pendekatan delta, selisih antar kanal harus TETAP sama.
    // Itu yang menjamin hue tidak bergeser.
    const before = pixelAt(img, 15, 15);
    const diffBefore = [before[1] - before[0], before[2] - before[0]];
    enhanceImageData(img, DEFAULT_ENHANCE);
    const after = pixelAt(img, 15, 15);
    const diffAfter = [after[1] - after[0], after[2] - after[0]];
    // Selisih antar kanal harus identik (toleransi 2 karena pembulatan).
    expect(Math.abs(diffAfter[0] - diffBefore[0])).toBeLessThanOrEqual(2);
    expect(Math.abs(diffAfter[1] - diffBefore[1])).toBeLessThanOrEqual(2);
  });

  it("tidak mengubah alfa", () => {
    const img = makeEdgeImage();
    enhanceImageData(img, DEFAULT_ENHANCE);
    for (let i = 3; i < img.data.length; i += 4) {
      expect(img.data[i]).toBe(255);
    }
  });

  it("area rata tidak berubah banyak", () => {
    // Gambar satu warna seragam: penajaman tidak boleh menimbulkan artefak.
    const w = 30;
    const h = 30;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = 128;
      data[i * 4 + 1] = 128;
      data[i * 4 + 2] = 128;
      data[i * 4 + 3] = 255;
    }
    const img = { data, width: w, height: h, colorSpace: "srgb" } as ImageData;
    enhanceImageData(img, DEFAULT_ENHANCE);
    const center = pixelAt(img, 15, 15);
    expect(Math.abs(center[0] - 128)).toBeLessThan(6);
  });

  it("nilai tidak keluar dari rentang 0-255", () => {
    const img = makeEdgeImage();
    enhanceImageData(img, { sharpen: 100, clarity: 100, denoise: 100, radius: 3 });
    for (let i = 0; i < img.data.length; i++) {
      expect(img.data[i]).toBeGreaterThanOrEqual(0);
      expect(img.data[i]).toBeLessThanOrEqual(255);
    }
  });

  it("denoise mengurangi variasi noise kecil", () => {
    const w = 20;
    const h = 20;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        // Basis 128 dengan noise acak kecil.
        const v = 128 + ((x * 7 + y * 13) % 5) - 2;
        data[p] = v;
        data[p + 1] = v;
        data[p + 2] = v;
        data[p + 3] = 255;
      }
    }
    const img = { data, width: w, height: h, colorSpace: "srgb" } as ImageData;

    // Hitung variasi sebelum dan sesudah.
    const variance = (d: Uint8ClampedArray) => {
      let sum = 0;
      let sum2 = 0;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        sum += d[i];
        sum2 += d[i] * d[i];
        n++;
      }
      return sum2 / n - (sum / n) ** 2;
    };
    const before = variance(img.data);
    enhanceImageData(img, { sharpen: 0, clarity: 0, denoise: 80, radius: 1.2 });
    const after = variance(img.data);
    expect(after).toBeLessThan(before);
  });

  it("TIDAK menggelapkan foto (regresi)", () => {
    // Kasus yang dilaporkan: enhance membuat foto jadi gelap. Ini menguji bahwa
    // kecerahan rata-rata tidak turun signifikan pada setelan rekomendasi.
    const w = 60;
    const h = 60;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        // Foto realistis: gradien dengan area gelap dan terang.
        const v = 40 + (x / w) * 160;
        data[p] = v;
        data[p + 1] = v * 0.9;
        data[p + 2] = v * 0.8;
        data[p + 3] = 255;
      }
    }
    const img = { data, width: w, height: h, colorSpace: "srgb" } as ImageData;

    const avgLum = (d: Uint8ClampedArray) => {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        n++;
      }
      return sum / n;
    };

    const before = avgLum(img.data);
    // Setelan rekomendasi (preset "Halus" / standar).
    enhanceImageData(img, { sharpen: 30, clarity: 15, denoise: 20, radius: 1.2 });
    const after = avgLum(img.data);

    // Kecerahan tidak boleh turun lebih dari 2 level rata-rata.
    expect(after, "foto tidak boleh menjadi lebih gelap").toBeGreaterThan(before - 2);
  });

  it("area gelap tidak menjadi lebih gelap (regresi)", () => {
    // Area gelap paling rentan menjadi hitam pekat saat clarity terlalu kuat.
    const w = 40;
    const h = 40;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        // Separuh kiri gelap (30), separuh kanan terang (200).
        const v = x < w / 2 ? 30 : 200;
        data[p] = v;
        data[p + 1] = v;
        data[p + 2] = v;
        data[p + 3] = 255;
      }
    }
    const img = { data, width: w, height: h, colorSpace: "srgb" } as ImageData;
    const darkBefore = img.data[(20 * w + 5) * 4];

    // Setelan paling agresif.
    enhanceImageData(img, { sharpen: 100, clarity: 100, denoise: 0, radius: 1.2 });
    const darkAfter = img.data[(20 * w + 5) * 4];

    // Area gelap tidak boleh turun lebih dari 15 level.
    expect(darkAfter, "area gelap tidak boleh menjadi hitam").toBeGreaterThan(darkBefore - 15);
    expect(darkAfter).toBeGreaterThan(10);
  });

  it("perubahan dibatasi agar foto tidak berubah drastis", () => {
    // Total pergeseran maksimum dibatasi 42 level.
    const w = 30;
    const h = 30;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = 128;
      data[i * 4 + 1] = 128;
      data[i * 4 + 2] = 128;
      data[i * 4 + 3] = 255;
    }
    const img = { data, width: w, height: h, colorSpace: "srgb" } as ImageData;
    enhanceImageData(img, { sharpen: 100, clarity: 100, denoise: 0, radius: 3 });
    // Area rata: nilai harus tetap dekat dengan 128.
    for (let i = 0; i < img.data.length; i += 4) {
      expect(Math.abs(img.data[i] - 128)).toBeLessThanOrEqual(45);
    }
  });
});
