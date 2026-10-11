/// <reference lib="webworker" />
/**
 * Worker inferensi pemisahan subjek (persisten).
 *
 * Semua pekerjaan berat (unduh model, ONNX, perapian matte) berjalan di thread
 * terpisah sehingga UI tetap responsif. Mendukung preload model agar proses
 * pertama kali terasa lebih cepat.
 */
import { refineMatteBlob, MATTE_OFF } from "../lib/matte";
import type { MatteOptions } from "../lib/matte";

type Quality = "fast" | "balanced" | "best";
type Refine = "off" | "light" | "strong";

type InMessage =
  | { type: "separate"; id: number; source: Blob; quality: Quality; refine: Refine }
  | { type: "preload"; quality: Quality };

const MODEL_BY_QUALITY: Record<Quality, "isnet_quint8" | "isnet_fp16" | "isnet"> = {
  fast: "isnet_quint8",
  balanced: "isnet_fp16",
  best: "isnet",
};

/**
 * Opsi perapian matte per tingkat.
 *
 * Prinsip: makin kuat model, makin ringan perapian yang dibutuhkan. Model yang
 * lebih baik menghasilkan mask yang lebih halus sehingga tidak perlu pembersihan
 * agresif — agresivitas berlebih justru menghapus detail seperti rambut tipis.
 */
/**
 * Opsi perapian matte.
 *
 * PRINSIP UTAMA: perapian hanya "bersihkan sisa bercak", BUKAN "potong tepi".
 * Semua nilai sengaja rendah agar detail dekat tepi objek (rambut, telinga,
 * kerah baju) tidak ikut terhapus. Makin kuat model, makin ringan perapian.
 */
function matteOptions(refine: Refine, quality: Quality): MatteOptions {
  if (refine === "off") return MATTE_OFF;

  const modelFactor = quality === "best" ? 0.5 : quality === "balanced" ? 0.75 : 1;
  const strong = refine === "strong";

  return {
    cleanIslands: Math.round((strong ? 22 : 15) * modelFactor),
    fillHoles: Math.round((strong ? 50 : 35) * modelFactor),
    // Erosi hanya untuk model cepat. Model seimbang & terbaik tidak dierosi.
    edgeShrink: strong && quality === "fast" ? 1 : 0,
    edgeFeather: strong ? 0.6 : 0.4,
    speckleClean: strong && quality !== "best" ? 1 : 0,
    alphaContrast: Math.round((strong ? 15 : 8) * modelFactor),
    guideRadius: strong ? 6 : 5,
    guideEps: strong ? 0.008 : 0.01,
    // Padatkan area tebal yang salah transparan (pakaian gelap).
    solidifyRadius: strong ? 10 : 8,
    solidifyStrength: strong ? 80 : 70,
  };
}

/** Muat library sekali; dipakai ulang untuk semua permintaan. */
let libPromise: Promise<typeof import("@imgly/background-removal")> | null = null;
function getLib() {
  if (!libPromise) libPromise = import("@imgly/background-removal");
  return libPromise;
}

const preloaded = new Set<Quality>();

async function preload(quality: Quality) {
  if (preloaded.has(quality)) return;
  try {
    const { preload: preloadLib } = await getLib();
    await preloadLib({ model: MODEL_BY_QUALITY[quality] });
    preloaded.add(quality);
  } catch {
    /* preload opsional; kegagalan tidak fatal */
  }
}

self.onmessage = async (e: MessageEvent<InMessage>) => {
  const msg = e.data;

  if (msg.type === "preload") {
    void preload(msg.quality);
    return;
  }

  const { id, source, quality, refine } = msg;
  try {
    const { removeBackground } = await getLib();
    const raw = await removeBackground(source, {
      model: MODEL_BY_QUALITY[quality],
      output: { format: "image/png", quality: 1 },
      progress: (key: string, cur: number, tot: number) => {
        self.postMessage({
          type: "progress",
          id,
          label: key.startsWith("fetch") ? "Mengunduh model…" : "Memproses foto…",
          pct: tot > 0 ? cur / tot : null,
        });
      },
    });

    let cutout = raw;
    if (refine !== "off") {
      self.postMessage({ type: "progress", id, label: "Merapikan tepi…", pct: null });
      cutout = await refineMatteBlob(raw, matteOptions(refine, quality));
    }

    self.postMessage({ type: "done", id, blob: cutout });
  } catch (err) {
    self.postMessage({ type: "error", id, message: err instanceof Error ? err.message : "Pemisahan gagal" });
  }
};
