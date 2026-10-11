import { describe, expect, it } from "vitest";
import { A4_MM, mmToPx, sheetCapacity } from "../../src/lib/sheet";

describe("konversi milimeter", () => {
  it("300 dpi: 25.4 mm = 300 px", () => {
    expect(mmToPx(25.4, 300)).toBe(300);
  });

  it("150 dpi: 25.4 mm = 150 px", () => {
    expect(mmToPx(25.4, 150)).toBe(150);
  });

  it("ukuran pas foto 3x4 cm pada 300 dpi", () => {
    expect(mmToPx(30, 300)).toBe(354);
    expect(mmToPx(40, 300)).toBe(472);
  });

  it("ukuran pas foto 4x6 cm pada 300 dpi", () => {
    expect(mmToPx(40, 300)).toBe(472);
    expect(mmToPx(60, 300)).toBe(709);
  });
});

describe("tata letak lembar A4", () => {
  it("A4 adalah 210x297 mm", () => {
    expect(A4_MM).toEqual({ w: 210, h: 297 });
  });

  it("pas foto 3x4 cm muat beberapa baris dan kolom", () => {
    const cap = sheetCapacity([30, 40]);
    expect(cap.cols).toBeGreaterThanOrEqual(5);
    expect(cap.rows).toBeGreaterThanOrEqual(6);
    expect(cap.total).toBe(cap.cols * cap.rows);
  });

  it("pas foto 4x6 cm menghasilkan lebih sedikit salinan dari 3x4", () => {
    const small = sheetCapacity([30, 40]);
    const large = sheetCapacity([40, 60]);
    expect(large.total).toBeLessThan(small.total);
  });

  it("piksel sel sesuai ukuran mm pada 300 dpi", () => {
    const cap = sheetCapacity([30, 40]);
    expect(cap.px).toEqual([354, 472]);
  });

  it("tidak pernah menghasilkan nol baris/kolom", () => {
    // Ukuran sangat besar: minimal 1x1 agar tidak crash.
    const cap = sheetCapacity([200, 290]);
    expect(cap.cols).toBeGreaterThanOrEqual(1);
    expect(cap.rows).toBeGreaterThanOrEqual(1);
  });

  it("kapasitas 3x4 cukup untuk kebutuhan cetak umum", () => {
    // Satu lembar A4 biasanya diminta berisi minimal 8-12 pas foto.
    expect(sheetCapacity([30, 40]).total).toBeGreaterThanOrEqual(12);
  });
});
