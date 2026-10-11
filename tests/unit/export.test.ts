import { describe, expect, it } from "vitest";
import { MAX_SIDE, targetSize } from "../../src/lib/export";

describe("targetSize", () => {
  it("mode preset memakai piksel preset", () => {
    const r = targetSize(4, 5, [1080, 1350], "preset", 100, 100);
    expect(r).toEqual({ w: 1080, h: 1350 });
  });

  it("mode preset tanpa px memakai 1080 di sisi lebar", () => {
    const r = targetSize(1, 1, null, "preset", 100, 100);
    expect(r).toEqual({ w: 1080, h: 1080 });
  });

  it("skala 2x melipatgandakan basis preset", () => {
    const r = targetSize(4, 5, [1080, 1350], "2x", 100, 100);
    expect(r).toEqual({ w: 2160, h: 2700 });
  });

  it("skala 3x pada rasio tanpa preset menjaga rasio", () => {
    const r = targetSize(16, 9, null, "3x", 100, 100);
    expect(r).toEqual({ w: 3240, h: 1823 });
  });

  it("piksel kustom dipakai apa adanya", () => {
    const r = targetSize(4, 5, [1080, 1350], "custom", 800, 1000);
    expect(r).toEqual({ w: 800, h: 1000 });
  });

  it("menolak sisi di atas batas canvas", () => {
    const r = targetSize(1, 1, null, "custom", MAX_SIDE + 1, 500);
    expect("error" in r).toBe(true);
  });

  it("menolak ukuran tidak valid", () => {
    const r = targetSize(1, 1, null, "custom", 0, 500);
    expect("error" in r).toBe(true);
  });

  it("menerima tepat di batas", () => {
    const r = targetSize(1, 1, null, "custom", MAX_SIDE, MAX_SIDE);
    expect(r).toEqual({ w: MAX_SIDE, h: MAX_SIDE });
  });
});
