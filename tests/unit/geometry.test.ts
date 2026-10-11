import { describe, expect, it } from "vitest";
import { baseScale, clampTransform, DEFAULT_TRANSFORM } from "../../src/lib/geometry";

describe("baseScale", () => {
  it("fill: skala menutup seluruh bingkai (sisi terpanjang)", () => {
    // Foto 1000x500 di bingkai 400x400: skala harus 400/500 = 0.8 agar menutup.
    expect(baseScale("fill", 1000, 500, 400, 400)).toBeCloseTo(0.8);
  });

  it("contain: skala memuat seluruh foto (sisi terpendek)", () => {
    // Foto 1000x500 di bingkai 400x400: skala harus 400/1000 = 0.4.
    expect(baseScale("contain", 1000, 500, 400, 400)).toBeCloseTo(0.4);
  });

  it("fill >= contain selalu", () => {
    const f = baseScale("fill", 640, 480, 300, 300);
    const c = baseScale("contain", 640, 480, 300, 300);
    expect(f).toBeGreaterThanOrEqual(c);
  });
});

describe("clampTransform (mode fill)", () => {
  const iw = 1000;
  const ih = 1000;

  it("foto persegi di bingkai persegi tanpa rotasi: x dan y harus 0", () => {
    const t = clampTransform({ ...DEFAULT_TRANSFORM, x: 0.5, y: -0.5 }, "fill", iw, ih, 400, 400);
    expect(Math.abs(t.x)).toBe(0);
    expect(Math.abs(t.y)).toBe(0);
  });

  it("foto lebar di bingkai persegi: hanya x yang boleh bergeser", () => {
    // Foto 2000x1000, bingkai 400x400: skala fill 0.4, lebar tampil 800 > 400 -> maxX = 0.5.
    const t = clampTransform({ ...DEFAULT_TRANSFORM, x: 0.9, y: 0.9 }, "fill", 2000, 1000, 400, 400);
    expect(t.x).toBeCloseTo(0.5);
    expect(t.y).toBe(0);
  });

  it("nilai di dalam batas tidak diubah", () => {
    const t = clampTransform({ ...DEFAULT_TRANSFORM, x: 0.25 }, "fill", 2000, 1000, 400, 400);
    expect(t.x).toBeCloseTo(0.25);
  });

  it("rotasi 90 derajat menukar batas horizontal dan vertikal", () => {
    // Foto 2000x1000 diputar 90: bounding box jadi 400x800 -> maxY = 0.5, maxX = 0.
    const t = clampTransform({ ...DEFAULT_TRANSFORM, x: 0.5, y: 0.9, rotation: 90 }, "fill", 2000, 1000, 400, 400);
    expect(t.x).toBeCloseTo(0);
    expect(t.y).toBeCloseTo(0.5);
  });

  it("mode contain tidak dibatasi", () => {
    const t = clampTransform({ ...DEFAULT_TRANSFORM, x: 3, y: -3 }, "contain", iw, ih, 400, 400);
    expect(t.x).toBe(3);
    expect(t.y).toBe(-3);
  });
});
