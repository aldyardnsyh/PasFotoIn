import { describe, expect, it } from "vitest";
import { safeFilename } from "../../src/lib/filename";

describe("safeFilename", () => {
  it("membiarkan nama normal apa adanya", () => {
    expect(safeFilename("foto-4x5")).toBe("foto-4x5");
    expect(safeFilename("Pas Foto 3x4")).toBe("Pas Foto 3x4");
  });

  it("membuang komponen path Unix (anti zip-slip)", () => {
    expect(safeFilename("../../.ssh/authorized_keys")).not.toContain("/");
    expect(safeFilename("../../etc/passwd")).not.toContain("..");
    expect(safeFilename("a/b/c")).toBe("a-b-c");
  });

  it("membuang komponen path Windows dan awalan drive", () => {
    expect(safeFilename("..\\..\\Windows\\evil.exe")).not.toContain("\\");
    expect(safeFilename("C:\\Windows\\evil")).not.toMatch(/^[A-Za-z]:/);
    expect(safeFilename("D:/data/secret")).not.toContain("/");
  });

  it("membuang karakter kontrol dan terlarang", () => {
    expect(safeFilename("na\u0000ma")).toBe("nama");
    expect(safeFilename('a<b>c:d"e|f?g*h')).toBe("abcdefgh");
  });

  it("tidak menyisakan nama yang hanya titik atau spasi", () => {
    expect(safeFilename("..")).toBe("foto");
    expect(safeFilename(".")).toBe("foto");
    expect(safeFilename("   ")).toBe("foto");
    expect(safeFilename("")).toBe("foto");
    expect(safeFilename("///")).toBe("foto");
  });

  it("memakai fallback yang bisa dikustom", () => {
    expect(safeFilename("..", "foto-2")).toBe("foto-2");
  });

  it("membatasi panjang nama", () => {
    expect(safeFilename("a".repeat(500)).length).toBeLessThanOrEqual(80);
  });

  it("tidak menghasilkan nama yang diawali atau diakhiri titik/hubung", () => {
    expect(safeFilename("..foto..")).toBe("foto");
    expect(safeFilename("-foto-")).toBe("foto");
  });

  it("hasil selalu aman dipakai sebagai satu komponen path", () => {
    const hostile = [
      "../../../root/.bashrc",
      "..\\..\\..\\boot.ini",
      "con",
      "NUL.txt",
      "foto\u202Egnp.exe",
      "a/../../b",
    ];
    for (const name of hostile) {
      const safe = safeFilename(name);
      expect(safe).not.toContain("/");
      expect(safe).not.toContain("\\");
      expect(safe.startsWith("..")).toBe(false);
      expect(safe.length).toBeGreaterThan(0);
    }
  });
});
