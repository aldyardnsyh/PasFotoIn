import { describe, expect, it } from "vitest";
import { refineMatteData, DEFAULT_MATTE } from "../../src/lib/matte";

/** Buat ImageData tiruan tanpa DOM: latar alfa 0, subjek kotak di tengah alfa 255. */
function makeMatte(w: number, h: number, isFg: (x: number, y: number) => boolean): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const fg = isFg(x, y);
      data[p] = 200;
      data[p + 1] = 100;
      data[p + 2] = 50;
      data[p + 3] = fg ? 255 : 0;
    }
  }
  return { data, width: w, height: h, colorSpace: "srgb" } as ImageData;
}

function alphaAt(img: ImageData, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4 + 3];
}

describe("refineMatteData", () => {
  /**
   * Opsi tanpa guided filter, untuk menguji tahap lain secara terisolasi.
   * Guided filter sengaja dimatikan karena radiusnya (6-8 px) jauh lebih besar
   * dari skala gambar uji kecil dan akan menyebarkan pengaruh tepi ke seluruh
   * gambar, sehingga mengaburkan fitur yang sedang diuji.
   */
  const noGuide = { guideRadius: 0, guideEps: 0, solidifyRadius: 0, solidifyStrength: 0 };

  it("membuang pulau kecil yang terpisah dari subjek", () => {
    // Subjek besar 20x20 di tengah + bercak 2x2 terpisah.
    const img = makeMatte(60, 60, (x, y) => {
      const main = x >= 20 && x < 40 && y >= 20 && y < 40;
      const speck = x >= 50 && x < 52 && y >= 50 && y < 52;
      return main || speck;
    });
    const out = refineMatteData(img, { ...DEFAULT_MATTE, edgeShrink: 0, edgeFeather: 0, ...noGuide });
    expect(alphaAt(out, 25, 25)).toBeGreaterThan(200);
    expect(alphaAt(out, 50, 50)).toBe(0);
  });

  it("mengisi lubang kecil di dalam subjek", () => {
    // Kotak 30x30 dengan lubang 3x3 di tengah.
    const img = makeMatte(60, 60, (x, y) => {
      const box = x >= 15 && x < 45 && y >= 15 && y < 45;
      const hole = x >= 28 && x < 31 && y >= 28 && y < 31;
      return box && !hole;
    });
    const out = refineMatteData(img, { ...DEFAULT_MATTE, edgeShrink: 0, edgeFeather: 0, ...noGuide });
    expect(alphaAt(out, 29, 29)).toBe(255);
  });

  it("tidak mengisi area latar yang luas (bukan lubang)", () => {
    // Dua kotak terpisah: celah di antaranya adalah latar, bukan lubang.
    const img = makeMatte(80, 80, (x, y) => {
      const left = x >= 10 && x < 30 && y >= 10 && y < 70;
      const right = x >= 50 && x < 70 && y >= 10 && y < 70;
      return left || right;
    });
    const out = refineMatteData(img, { ...DEFAULT_MATTE, edgeShrink: 0, edgeFeather: 0, ...noGuide });
    expect(alphaAt(out, 40, 40)).toBe(0);
  });

  it("edgeShrink mengecilkan tepi beberapa piksel", () => {
    const img = makeMatte(60, 60, (x, y) => x >= 20 && x < 40 && y >= 20 && y < 40);
    const out = refineMatteData(img, { cleanIslands: 0, fillHoles: 0, edgeShrink: 3, edgeFeather: 0, speckleClean: 0, alphaContrast: 0, guideRadius: 0, guideEps: 0, solidifyRadius: 0, solidifyStrength: 0 });
    // Piksel di tepi lama harus hilang, bagian tengah tetap ada.
    expect(alphaAt(out, 20, 30)).toBe(0);
    expect(alphaAt(out, 30, 30)).toBe(255);
  });

  it("edgeFeather membuat tepi semi transparan", () => {
    const img = makeMatte(60, 60, (x, y) => x >= 20 && x < 40 && y >= 20 && y < 40);
    const out = refineMatteData(img, { cleanIslands: 0, fillHoles: 0, edgeShrink: 0, edgeFeather: 2, speckleClean: 0, alphaContrast: 0, guideRadius: 0, guideEps: 0, solidifyRadius: 0, solidifyStrength: 0 });
    const edge = alphaAt(out, 20, 30);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });

  it("speckleClean menghapus bercak 1 px yang menempel di tepi", () => {
    // Kotak besar + satu piksel menyimpang di luar tepi (bercak khas sisa latar).
    const img = makeMatte(60, 60, (x, y) => {
      const box = x >= 20 && x < 40 && y >= 20 && y < 40;
      const speck = x === 41 && y === 30;
      return box || speck;
    });
    const before = alphaAt(img, 41, 30);
    const out = refineMatteData(img, {
      cleanIslands: 0,
      fillHoles: 0,
      edgeShrink: 0,
      edgeFeather: 0,
      speckleClean: 1,
      alphaContrast: 0,
      guideRadius: 0,
      guideEps: 0,
      solidifyRadius: 0,
      solidifyStrength: 0,
    });
    expect(before).toBe(255);
    // Median 3x3 pada bercak tunggal akan menurunkannya drastis.
    expect(alphaAt(out, 41, 30)).toBeLessThan(128);
  });

  it("alphaContrast membuat piksel samar menjadi transparan penuh", () => {
    // Tepi dengan nilai alfa rendah (samar) yang menyebabkan garis tipis pixelated.
    const w = 40;
    const h = 40;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        data[p] = 180;
        data[p + 1] = 120;
        data[p + 2] = 90;
        // Kiri solid, kanan samar.
        data[p + 3] = x < 20 ? 255 : 60;
      }
    }
    const img = { data, width: w, height: h, colorSpace: "srgb" } as ImageData;
    const out = refineMatteData(img, {
      cleanIslands: 0,
      fillHoles: 0,
      edgeShrink: 0,
      edgeFeather: 0,
      speckleClean: 0,
      alphaContrast: 80,
      guideRadius: 0,
      guideEps: 0,
      solidifyRadius: 0,
      solidifyStrength: 0,
    });
    // Bagian solid tetap solid.
    expect(alphaAt(out, 5, 20)).toBeGreaterThan(240);
    // Bagian samar (alfa 60) harus turun jauh mendekati 0.
    expect(alphaAt(out, 35, 20)).toBeLessThan(60);
  });

  it("guided filter menyelaraskan alfa dengan tepi warna RGB", () => {
    // Skenario nyata: mask dari model kasar (blok 4 px), sementara tepi warna
    // asli berada di tengah blok. Guided filter harus menggeser alfa agar
    // mengikuti tepi warna, bukan tepi blok.
    const w = 40;
    const h = 40;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        // Warna: latar terang di kiri, subjek gelap mulai x = 22 (tepi asli).
        const dark = x >= 22;
        data[p] = dark ? 40 : 240;
        data[p + 1] = dark ? 40 : 240;
        data[p + 2] = dark ? 40 : 240;
        // Mask kasar: blok 8 px, tepi di x = 20 (2 px meleset dari tepi warna).
        data[p + 3] = x < 20 ? 0 : 255;
      }
    }
    const img = { data, width: w, height: h, colorSpace: "srgb" } as ImageData;
    const out = refineMatteData(img, {
      cleanIslands: 0,
      fillHoles: 0,
      edgeShrink: 0,
      edgeFeather: 0,
      speckleClean: 0,
      alphaContrast: 0,
      guideRadius: 6,
      guideEps: 0.001,
      solidifyRadius: 0,
      solidifyStrength: 0,
    });
    // Alfa di x = 21 (di antara tepi mask dan tepi warna) harus jadi peralihan
    // yang halus, bukan lompatan 0 -> 255 seperti mask asli.
    const a21 = alphaAt(out, 21, 20);
    expect(a21).toBeGreaterThan(0);
    expect(a21).toBeLessThan(255);
    // Bagian solid tetap jelas.
    expect(alphaAt(out, 5, 20)).toBeLessThan(40);
    expect(alphaAt(out, 35, 20)).toBeGreaterThan(215);
  });

  it("TIDAK menghapus helai rambut tipis (regresi)", () => {
    // Kasus yang dilaporkan: setelah pasca-proses, rambut tipis dan tepi telinga
    // ikut terhapus. Ini menguji bahwa setelan Kuat sekalipun tidak menghapus
    // struktur tipis yang menempel pada subjek.
    const w = 80;
    const h = 80;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        // Kepala: kotak solid di kiri.
        const head = x >= 10 && x < 40 && y >= 20 && y < 60;
        // Rambut: tiga helai tipis 1 px yang menonjol ke kanan dari kepala.
        const hair = (y === 30 || y === 40 || y === 50) && x >= 40 && x < 70;
        const fg = head || hair;
        data[p] = fg ? 60 : 235;
        data[p + 1] = fg ? 50 : 235;
        data[p + 2] = fg ? 45 : 235;
        data[p + 3] = fg ? 255 : 0;
      }
    }
    const img = { data, width: w, height: h, colorSpace: "srgb" } as ImageData;

    // Setelan paling agresif yang tersedia di UI ("Kuat" + model "Cepat").
    // Nilai ini mencerminkan matteOptions() di src/lib/separate.ts.
    const out = refineMatteData(img, {
      cleanIslands: 22,
      fillHoles: 50,
      edgeShrink: 1,
      edgeFeather: 0.6,
      speckleClean: 1,
      alphaContrast: 15,
      guideRadius: 6,
      guideEps: 0.008,
      solidifyRadius: 0,
      solidifyStrength: 0,
    });

    // Helai rambut di x = 55 (jauh dari kepala) harus MASIH terlihat.
    const hairAlpha = alphaAt(out, 55, 30);
    expect(hairAlpha, "helai rambut tidak boleh terhapus").toBeGreaterThan(150);
    // Kepala tetap solid.
    expect(alphaAt(out, 25, 40)).toBeGreaterThan(200);
  });

  it("model terbaik memakai perapian lebih ringan daripada model cepat", () => {
    // Prinsip: model isnet penuh sudah halus, jadi perapian harus lebih ringan.
    // Diuji lewat perbandingan langsung intensitas yang dihasilkan.
    const w = 60;
    const h = 60;
    const makeImg = () => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const p = (y * w + x) * 4;
          const head = x >= 15 && x < 45 && y >= 15 && y < 45;
          const hair = y === 30 && x >= 45 && x < 58;
          const fg = head || hair;
          data[p] = fg ? 60 : 235;
          data[p + 1] = fg ? 50 : 235;
          data[p + 2] = fg ? 45 : 235;
          data[p + 3] = fg ? 255 : 0;
        }
      }
      return { data, width: w, height: h, colorSpace: "srgb" } as ImageData;
    };

    // Perapian untuk model "Cepat" (faktor 1.0).
    const fastOut = refineMatteData(makeImg(), {
      cleanIslands: 22,
      fillHoles: 50,
      edgeShrink: 1,
      edgeFeather: 0.6,
      speckleClean: 1,
      alphaContrast: 15,
      guideRadius: 6,
      guideEps: 0.008,
      solidifyRadius: 0,
      solidifyStrength: 0,
    });
    // Perapian untuk model "Terbaik" (faktor 0.5, lebih ringan).
    const bestOut = refineMatteData(makeImg(), {
      cleanIslands: 11,
      fillHoles: 25,
      edgeShrink: 0,
      edgeFeather: 0.6,
      speckleClean: 0,
      alphaContrast: 8,
      guideRadius: 6,
      guideEps: 0.008,
      solidifyRadius: 0,
      solidifyStrength: 0,
    });

    const hairFast = alphaAt(fastOut, 50, 30);
    const hairBest = alphaAt(bestOut, 50, 30);
    // Model terbaik harus mempertahankan rambut lebih baik (atau sama).
    expect(hairBest, "model terbaik harus mempertahankan detail lebih baik").toBeGreaterThanOrEqual(hairFast);
  });

  it("matte tanpa subjek tetap kosong", () => {
    const img = makeMatte(40, 40, () => false);
    const out = refineMatteData(img, DEFAULT_MATTE);
    let sum = 0;
    for (let i = 3; i < out.data.length; i += 4) sum += out.data[i];
    expect(sum).toBe(0);
  });

  it("subjek penuh tidak berubah alfa di tengah", () => {
    const img = makeMatte(40, 40, () => true);
    const out = refineMatteData(img, { ...DEFAULT_MATTE, edgeShrink: 1 });
    expect(alphaAt(out, 20, 20)).toBe(255);
  });

  it("memadatkan pakaian gelap yang salah semi-transparan (kasus jas hitam)", () => {
    // Skenario yang dilaporkan: model memberi alpha sebagian (~200) pada area
    // LUAS jas hitam karena warnanya mirip latar. Latar baru lalu menembus pakaian.
    const w = 100;
    const h = 100;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        // Tubuh: area besar di tengah (x 25-75, y 25-100).
        const body = x >= 25 && x < 75 && y >= 25 && y < 100;
        // Rambut tipis: 2 helai 1 px di atas kepala.
        const hair = (x === 48 || x === 52) && y >= 10 && y < 25;
        const fg = body || hair;
        data[p] = fg ? 30 : 200;
        data[p + 1] = fg ? 28 : 200;
        data[p + 2] = fg ? 26 : 200;
        // Area tubuh diberi alpha SEBAGIAN (205) — inilah masalahnya.
        // Rambut diberi alpha normal (255).
        if (body) data[p + 3] = 205;
        else if (hair) data[p + 3] = 255;
        else data[p + 3] = 0;
      }
    }
    const img = { data, width: w, height: h, colorSpace: "srgb" } as ImageData;

    const out = refineMatteData(img, {
      cleanIslands: 0,
      fillHoles: 0,
      edgeShrink: 0,
      edgeFeather: 0,
      speckleClean: 0,
      alphaContrast: 0,
      guideRadius: 0,
      guideEps: 0,
      solidifyRadius: 8,
      solidifyStrength: 80,
    });

    // Area tubuh yang luas harus dipadatkan mendekati penuh.
    const bodyAlpha = alphaAt(out, 50, 60);
    expect(bodyAlpha, "jas hitam harus dipadatkan").toBeGreaterThan(240);

    // Rambut tipis TIDAK boleh ikut dipadatkan paksa (tetap nilai aslinya).
    const hairAlpha = alphaAt(out, 48, 15);
    expect(hairAlpha, "rambut tipis tidak boleh diubah").toBeLessThan(255);
  });

  it("solidify tidak menyentuh tepi tipis di sekitar subjek", () => {
    // Tepi rambut semi-transparan yang tipis harus dibiarkan apa adanya.
    const w = 60;
    const h = 60;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        const solid = x < 30;
        data[p] = solid ? 60 : 220;
        data[p + 1] = solid ? 60 : 220;
        data[p + 2] = solid ? 60 : 220;
        // Tepi: hanya 1 kolom semi-transparan (tipis).
        if (x === 30) data[p + 3] = 128;
        else data[p + 3] = solid ? 255 : 0;
      }
    }
    const img = { data, width: w, height: h, colorSpace: "srgb" } as ImageData;
    const out = refineMatteData(img, {
      cleanIslands: 0,
      fillHoles: 0,
      edgeShrink: 0,
      edgeFeather: 0,
      speckleClean: 0,
      alphaContrast: 0,
      guideRadius: 0,
      guideEps: 0,
      solidifyRadius: 8,
      solidifyStrength: 80,
    });
    // Tepi tipis tetap semi-transparan (tidak dipadatkan).
    const edgeAlpha = alphaAt(out, 30, 30);
    expect(edgeAlpha).toBeGreaterThan(60);
    expect(edgeAlpha).toBeLessThan(200);
  });

  it("solidify mati saat radius 0", () => {
    const w = 40;
    const h = 40;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = 30;
      data[i * 4 + 1] = 30;
      data[i * 4 + 2] = 30;
      data[i * 4 + 3] = 200;
    }
    const img = { data, width: w, height: h, colorSpace: "srgb" } as ImageData;
    const out = refineMatteData(img, {
      cleanIslands: 0,
      fillHoles: 0,
      edgeShrink: 0,
      edgeFeather: 0,
      speckleClean: 0,
      alphaContrast: 0,
      guideRadius: 0,
      guideEps: 0,
      solidifyRadius: 0,
      solidifyStrength: 80,
    });
    expect(alphaAt(out, 20, 20)).toBe(200);
  });

  it("setelan produksi: jas padat DAN rambut utuh sekaligus", () => {
    // Tes integrasi memakai nilai persis dari matteOptions() untuk
    // "Kuat" + model "Terbaik" — skenario yang paling sering dipakai.
    const w = 120;
    const h = 120;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        // Kepala (solid, alpha penuh) di bagian atas.
        const head = x >= 35 && x < 85 && y >= 20 && y < 55;
        // Jas: area besar di bawah kepala, alpha SEBAGIAN (masalah nyata).
        const suit = x >= 25 && x < 95 && y >= 55 && y < 115;
        // Rambut: 4 helai tipis 1 px menonjol ke atas dari kepala.
        const hair = (x === 45 || x === 55 || x === 65 || x === 75) && y >= 8 && y < 20;
        const fg = head || suit || hair;
        // Warna: kepala & rambut lebih terang dari jas.
        if (hair) {
          data[p] = 90;
          data[p + 1] = 80;
          data[p + 2] = 70;
        } else if (head) {
          data[p] = 180;
          data[p + 1] = 150;
          data[p + 2] = 130;
        } else if (suit) {
          data[p] = 32;
          data[p + 1] = 30;
          data[p + 2] = 28;
        } else {
          data[p] = 200;
          data[p + 1] = 200;
          data[p + 2] = 200;
        }
        if (suit) data[p + 3] = 200;
        else if (fg) data[p + 3] = 255;
        else data[p + 3] = 0;
      }
    }
    const img = { data, width: w, height: h, colorSpace: "srgb" } as ImageData;

    // Nilai persis "Kuat" + "Terbaik" dari matteOptions().
    const out = refineMatteData(img, {
      cleanIslands: 11,
      fillHoles: 25,
      edgeShrink: 0,
      edgeFeather: 0.6,
      speckleClean: 0,
      alphaContrast: 8,
      guideRadius: 6,
      guideEps: 0.008,
      solidifyRadius: 10,
      solidifyStrength: 80,
    });

    // 1. Jas harus dipadatkan (tidak lagi semi-transparan).
    const suitAlpha = alphaAt(out, 60, 90);
    expect(suitAlpha, "jas harus dipadatkan").toBeGreaterThan(240);

    // 2. Rambut tipis harus tetap ada.
    for (const hx of [45, 55, 65, 75]) {
      const hairAlpha = alphaAt(out, hx, 14);
      expect(hairAlpha, `rambut di x=${hx} harus tetap ada`).toBeGreaterThan(150);
    }

    // 3. Kepala tetap solid.
    expect(alphaAt(out, 60, 35)).toBeGreaterThan(240);
  });
});
