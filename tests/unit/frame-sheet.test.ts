import { describe, expect, it } from "vitest";
import { DEFAULT_FRAME, isDefaultFrame, clampTransform, DEFAULT_TRANSFORM } from "../../src/lib/geometry";
import { FORMAL_BACKGROUNDS, FORMAL_DOCUMENT_PRESETS, PRINT_DPI, RATIO_PRESETS } from "../../src/lib/presets";

describe("bingkai (padding & sudut)", () => {
  it("default tidak aktif", () => {
    expect(isDefaultFrame(DEFAULT_FRAME)).toBe(true);
    expect(isDefaultFrame(undefined)).toBe(true);
  });

  it("terdeteksi aktif saat padding atau radius diisi", () => {
    expect(isDefaultFrame({ padding: 5, radius: 0 })).toBe(false);
    expect(isDefaultFrame({ padding: 0, radius: 3 })).toBe(false);
  });
});

describe("clampTransform dengan padding", () => {
  const iw = 1000;
  const ih = 1000;

  it("padding 0 sama dengan perilaku lama", () => {
    const a = clampTransform({ ...DEFAULT_TRANSFORM, x: 0.5, y: 0.5 }, "fill", iw, ih, 400, 400, 0);
    const b = clampTransform({ ...DEFAULT_TRANSFORM, x: 0.5, y: 0.5 }, "fill", iw, ih, 400, 400);
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
  });

  it("padding memperbesar ruang gerak karena area efektif mengecil", () => {
    // Foto lebar di bingkai persegi: tanpa padding maxX = 0.5; dengan padding lebih besar.
    const noPad = clampTransform({ ...DEFAULT_TRANSFORM, x: 9 }, "fill", 2000, 1000, 400, 400, 0);
    const withPad = clampTransform({ ...DEFAULT_TRANSFORM, x: 9 }, "fill", 2000, 1000, 400, 400, 0.1);
    expect(withPad.x).toBeGreaterThanOrEqual(noPad.x);
  });

  it("mode contain tetap tidak dibatasi walau ada padding", () => {
    const t = clampTransform({ ...DEFAULT_TRANSFORM, x: 3 }, "contain", iw, ih, 400, 400, 0.1);
    expect(t.x).toBe(3);
  });
});

describe("preset dokumen resmi", () => {
  it("semua preset dokumen punya ukuran mm", () => {
    const docs = RATIO_PRESETS.filter((p) => p.group === "Dokumen");
    expect(docs.length).toBeGreaterThanOrEqual(4);
    for (const d of docs) {
      expect(d.mm).toBeDefined();
      expect(d.px).toBeDefined();
    }
  });

  it("semua preset internasional punya ukuran mm", () => {
    const intl = RATIO_PRESETS.filter((p) => p.group === "Internasional");
    expect(intl.length).toBeGreaterThanOrEqual(4);
    for (const d of intl) {
      expect(d.mm).toBeDefined();
      expect(d.px).toBeDefined();
      expect(d.note).toBeDefined();
    }
  });

  it("piksel sesuai konversi mm pada 300 dpi (toleransi 2 px)", () => {
    for (const p of RATIO_PRESETS.filter((x) => x.mm && x.px)) {
      const [mw, mh] = p.mm!;
      const [px, py] = p.px!;
      const expectW = (mw / 25.4) * PRINT_DPI;
      const expectH = (mh / 25.4) * PRINT_DPI;
      expect(Math.abs(px - expectW), `${p.id} lebar`).toBeLessThanOrEqual(2);
      expect(Math.abs(py - expectH), `${p.id} tinggi`).toBeLessThanOrEqual(2);
    }
  });

  it("pas foto 3x4 = 30x40 mm = 354x472 px", () => {
    const p = RATIO_PRESETS.find((x) => x.id === "pasfoto-3x4");
    expect(p?.mm).toEqual([30, 40]);
    expect(p?.px).toEqual([354, 472]);
  });

  it("paspor ICAO 35x45 mm terdaftar dengan label yang jelas", () => {
    const p = RATIO_PRESETS.find((x) => x.id === "icao-35x45");
    expect(p?.mm).toEqual([35, 45]);
    expect(p?.label).toContain("Paspor");
    expect(p?.group).toBe("Internasional");
  });

  it("preset AS memakai 51x51 mm sesuai aturan Departemen Luar Negeri AS", () => {
    const p = RATIO_PRESETS.find((x) => x.id === "us-51x51");
    expect(p?.mm).toEqual([51, 51]);
  });
});

describe("pintasan dokumen resmi", () => {
  it("setiap pintasan menunjuk preset yang benar-benar ada", () => {
    for (const d of FORMAL_DOCUMENT_PRESETS) {
      const target = RATIO_PRESETS.find((p) => p.id === d.presetId);
      expect(target, `preset ${d.presetId} harus ada`).toBeDefined();
    }
  });

  it("setiap pintasan punya warna latar resmi", () => {
    for (const d of FORMAL_DOCUMENT_PRESETS) {
      expect(d.color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe("warna latar resmi Indonesia", () => {
  it("memuat merah dan biru resmi", () => {
    const colors = FORMAL_BACKGROUNDS.map((f) => f.color);
    expect(colors).toContain("#D32F2F");
    expect(colors).toContain("#0B57D0");
  });

  it("setiap warna punya label dan hint", () => {
    for (const f of FORMAL_BACKGROUNDS) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.hint.length).toBeGreaterThan(0);
    }
  });
});
