import { describe, expect, it } from "vitest";
import { hexToRgb, isValidHex, rgbToHex } from "../../src/lib/color";

describe("konversi warna", () => {
  it("hex ke rgb", () => {
    expect(hexToRgb("#2F61DA")).toEqual({ r: 47, g: 97, b: 218 });
  });

  it("menerima tanpa tanda pagar dan huruf kecil", () => {
    expect(hexToRgb("ffffff")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("menolak nilai tidak valid", () => {
    expect(hexToRgb("#FFF")).toBeNull();
    expect(hexToRgb("merah")).toBeNull();
  });

  it("rgb ke hex selalu huruf besar dan enam digit", () => {
    expect(rgbToHex({ r: 47, g: 97, b: 218 })).toBe("#2F61DA");
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
  });

  it("membulatkan dan menjepit nilai di luar rentang", () => {
    expect(rgbToHex({ r: 300, g: -5, b: 127.6 })).toBe("#FF0080");
  });

  it("validasi hex", () => {
    expect(isValidHex("#ABCDEF")).toBe(true);
    expect(isValidHex("#abc")).toBe(false);
    expect(isValidHex("zabcde")).toBe(false);
  });
});
