import { beforeEach, describe, expect, it } from "vitest";
import { useEditor } from "../../src/store/editor";
import { DEFAULT_TRANSFORM } from "../../src/lib/geometry";

/**
 * Tes sistem undo/redo.
 *
 * Desain: satu riwayat global berbasis snapshot immutable, sehingga SEMUA aksi
 * (pengaturan, pemrosesan gambar, hapus foto, rename) bisa dibatalkan.
 * Bitmap tidak dipakai di tes ini karena environment Node tidak punya ImageBitmap;
 * aksi yang butuh bitmap diuji lewat jalur yang tidak menyentuh bitmap.
 */

function reset() {
  useEditor.setState({
    images: [],
    activeId: null,
    past: [],
    future: [],
    lastLabel: null,
  });
}

/** Tambah entri gambar palsu tanpa bitmap, cukup untuk menguji riwayat pengaturan. */
function seedImage(id = "img-1") {
  useEditor.setState({
    images: [
      {
        id,
        name: "uji",
        blobId: `blob-${id}`,
        originalBlobId: null,
        bitmap: null,
        previewUrl: null,
        edit: {
          ratioW: 4,
          ratioH: 5,
          fit: "fill",
          transform: { ...DEFAULT_TRANSFORM },
          background: { kind: "solid", color: "#FFFFFF" },
          adjust: {
            exposure: 0,
            contrast: 0,
            saturation: 0,
            temperature: 0,
            highlights: 0,
            shadows: 0,
            levelBlack: 0,
            levelGamma: 1,
            levelWhite: 255,
          },
          frame: { padding: 0, radius: 0 },
        },
      },
    ],
    activeId: id,
    past: [],
    future: [],
  });
}

const s = () => useEditor.getState();
const edit = () => s().images[0].edit;

describe("undo/redo global", () => {
  beforeEach(reset);

  it("awalnya tidak ada riwayat", () => {
    seedImage();
    expect(s().past.length).toBe(0);
    expect(s().future.length).toBe(0);
  });

  it("perubahan rasio bisa di-undo dan di-redo", () => {
    seedImage();
    s().setRatio(16, 9);
    expect(edit().ratioW).toBe(16);
    expect(s().past.length).toBe(1);

    s().undo();
    expect(edit().ratioW).toBe(4);
    expect(edit().ratioH).toBe(5);
    expect(s().future.length).toBe(1);

    s().redo();
    expect(edit().ratioW).toBe(16);
    expect(s().past.length).toBe(1);
  });

  it("perubahan latar bisa di-undo", () => {
    seedImage();
    s().setBackground({ kind: "solid", color: "#D32F2F" });
    expect(edit().background).toEqual({ kind: "solid", color: "#D32F2F" });
    s().undo();
    expect(edit().background).toEqual({ kind: "solid", color: "#FFFFFF" });
  });

  it("perubahan penyesuaian bisa di-undo", () => {
    seedImage();
    s().setAdjust({ exposure: 40 });
    expect(edit().adjust.exposure).toBe(40);
    s().undo();
    expect(edit().adjust.exposure).toBe(0);
  });

  it("perubahan bingkai bisa di-undo", () => {
    seedImage();
    s().setFrame({ padding: 10, radius: 5 });
    expect(edit().frame).toEqual({ padding: 10, radius: 5 });
    s().undo();
    expect(edit().frame).toEqual({ padding: 0, radius: 0 });
  });

  it("perubahan levels (histogram) bisa di-undo", () => {
    seedImage();
    s().setAdjust({ levelBlack: 20, levelGamma: 1.4, levelWhite: 230 });
    expect(edit().adjust.levelBlack).toBe(20);
    s().undo();
    expect(edit().adjust.levelBlack).toBe(0);
    expect(edit().adjust.levelGamma).toBe(1);
    expect(edit().adjust.levelWhite).toBe(255);
  });

  it("transformasi bisa di-undo", () => {
    seedImage();
    s().setTransform({ scale: 1.5, rotation: 30 });
    expect(edit().transform.scale).toBe(1.5);
    s().undo();
    expect(edit().transform.scale).toBe(1);
    expect(edit().transform.rotation).toBe(0);
  });

  it("rename bisa di-undo", () => {
    seedImage();
    s().renameImage("img-1", "Nama Baru");
    expect(s().images[0].name).toBe("Nama Baru");
    s().undo();
    expect(s().images[0].name).toBe("uji");
  });

  it("hapus foto bisa di-undo", () => {
    seedImage();
    const removed = s().removeImage("img-1");
    expect(removed).not.toBeNull();
    expect(s().images.length).toBe(0);
    s().undo();
    expect(s().images.length).toBe(1);
    expect(s().images[0].id).toBe("img-1");
  });

  it("ubah mode Isi/Muat bisa di-undo", () => {
    seedImage();
    s().setFit("contain");
    expect(edit().fit).toBe("contain");
    s().undo();
    expect(edit().fit).toBe("fill");
  });

  it("atur ulang transformasi bisa di-undo", () => {
    seedImage();
    s().setTransform({ scale: 2, rotation: 15 });
    s().reset();
    expect(edit().transform.scale).toBe(1);
    s().undo();
    expect(edit().transform.scale).toBe(2);
    expect(edit().transform.rotation).toBe(15);
  });

  it("perubahan baru menghapus riwayat redo", () => {
    seedImage();
    s().setRatio(16, 9);
    s().undo();
    expect(s().future.length).toBe(1);
    s().setRatio(1, 1);
    expect(s().future.length).toBe(0);
  });

  it("menyimpan label langkah untuk tooltip", () => {
    seedImage();
    s().pushHistoryNow("Pisahkan subjek");
    expect(s().lastLabel).toBe("Pisahkan subjek");
  });

  it("undo berulang mengembalikan ke keadaan awal", () => {
    seedImage();
    s().setRatio(16, 9);
    s().setFit("contain");
    s().setBackground({ kind: "solid", color: "#0B57D0" });
    expect(s().past.length).toBe(3);

    s().undo();
    s().undo();
    s().undo();
    expect(edit().ratioW).toBe(4);
    expect(edit().fit).toBe("fill");
    expect(edit().background).toEqual({ kind: "solid", color: "#FFFFFF" });
    expect(s().past.length).toBe(0);
  });

  it("undo pada riwayat kosong tidak error", () => {
    seedImage();
    s().undo();
    expect(edit().ratioW).toBe(4);
  });

  it("redo pada riwayat kosong tidak error", () => {
    seedImage();
    s().redo();
    expect(edit().ratioW).toBe(4);
  });

  it("slider drag: satu gerakan menghasilkan satu langkah", () => {
    seedImage();
    // Simulasi drag: pushHistoryNow sekali, lalu banyak update tanpa commit.
    s().pushHistoryNow("Ubah eksposur");
    s().setAdjust({ exposure: 10 }, false);
    s().setAdjust({ exposure: 20 }, false);
    s().setAdjust({ exposure: 30 }, false);
    expect(s().past.length).toBe(1);
    expect(edit().adjust.exposure).toBe(30);

    s().undo();
    expect(edit().adjust.exposure).toBe(0);
  });

  it("samakan semua foto bisa di-undo", () => {
    useEditor.setState({
      images: [
        {
          id: "a",
          name: "a",
          blobId: "blob-a",
          originalBlobId: null,
          bitmap: null,
          previewUrl: null,
          edit: {
            ratioW: 3,
            ratioH: 4,
            fit: "contain",
            transform: { ...DEFAULT_TRANSFORM, scale: 1.4 },
            background: { kind: "solid", color: "#D32F2F" },
            adjust: {
              exposure: 0,
              contrast: 0,
              saturation: 0,
              temperature: 0,
              highlights: 0,
              shadows: 0,
              levelBlack: 0,
              levelGamma: 1,
              levelWhite: 255,
            },
            frame: { padding: 0, radius: 0 },
          },
        },
        {
          id: "b",
          name: "b",
          blobId: "blob-b",
          originalBlobId: null,
          bitmap: null,
          previewUrl: null,
          edit: {
            ratioW: 1,
            ratioH: 1,
            fit: "fill",
            transform: { ...DEFAULT_TRANSFORM },
            background: { kind: "solid", color: "#FFFFFF" },
            adjust: {
              exposure: 0,
              contrast: 0,
              saturation: 0,
              temperature: 0,
              highlights: 0,
              shadows: 0,
              levelBlack: 0,
              levelGamma: 1,
              levelWhite: 255,
            },
            frame: { padding: 0, radius: 0 },
          },
        },
      ],
      activeId: "a",
      past: [],
      future: [],
    });

    s().applyToAll();
    expect(s().images[1].edit.ratioW).toBe(3);
    expect(s().images[1].edit.background).toEqual({ kind: "solid", color: "#D32F2F" });

    s().undo();
    expect(s().images[1].edit.ratioW).toBe(1);
    expect(s().images[1].edit.background).toEqual({ kind: "solid", color: "#FFFFFF" });
  });

  it("riwayat dibatasi agar memori tidak tumbuh tanpa batas", () => {
    seedImage();
    for (let i = 0; i < 80; i++) {
      s().setAdjust({ exposure: i % 100 }, true);
    }
    expect(s().past.length).toBeLessThanOrEqual(60);
  });

  it("presetId tersimpan dan bisa di-undo (2x3 vs 4x6 sama-sama 2:3)", () => {
    seedImage();
    // Kasus nyata: 2x3 cm, 4x6 cm, dan 6x9 cm semuanya rasio 2:3.
    // Tanpa presetId, ketiganya akan tampak terpilih sekaligus.
    s().setRatio(2, 3, "pasfoto-2x3");
    expect(s().images[0].edit.presetId).toBe("pasfoto-2x3");
    expect(s().images[0].edit.ratioW).toBe(2);

    s().setRatio(2, 3, "pasfoto-4x6");
    expect(s().images[0].edit.presetId).toBe("pasfoto-4x6");

    s().undo();
    expect(s().images[0].edit.presetId).toBe("pasfoto-2x3");

    s().redo();
    expect(s().images[0].edit.presetId).toBe("pasfoto-4x6");
  });

  it("setRatio tanpa presetId mengosongkan pilihan preset", () => {
    seedImage();
    s().setRatio(2, 3, "pasfoto-4x6");
    s().setRatio(5, 7);
    expect(s().images[0].edit.presetId).toBeNull();
  });
});
