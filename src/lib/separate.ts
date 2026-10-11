/**
 * Pemisahan subjek di Web Worker dengan worker persisten dan preload model.
 *
 * Dua optimasi utama dibanding versi sebelumnya:
 * 1. Worker dibuat sekali lalu dipakai ulang. Membuat worker baru setiap kali
 *    memaksa modul (ONNX + library) dimuat ulang, yang menambah detik ke waktu respons.
 * 2. `preloadModel()` bisa dipanggil saat idle (mis. saat pengguna membuka tab Latar),
 *    sehingga unduhan dan inisialisasi model selesai sebelum tombol ditekan.
 */
import type { MatteOptions } from "./matte";

export type SeparateQuality = "fast" | "balanced" | "best";
export type SeparateRefine = "off" | "light" | "strong";
export type SeparateProgress = (label: string, pct: number | null) => void;

const MODEL_BY_QUALITY = {
  fast: "isnet_quint8",
  balanced: "isnet_fp16",
  best: "isnet",
} as const;

/**
 * Opsi perapian matte.
 *
 * PRINSIP UTAMA: perapian hanya "bersihkan sisa bercak", BUKAN "potong tepi".
 * Semua nilai sengaja rendah karena:
 * - Model sudah menghasilkan mask yang cukup baik
 * - Agresivitas berlebih menghapus detail di dekat tepi objek (rambut, telinga,
 *   kerah baju, aksesori)
 *
 * Makin kuat model, makin ringan perapian yang dibutuhkan.
 */
function matteOptions(refine: SeparateRefine, quality: SeparateQuality): MatteOptions {
  if (refine === "off") {
    return {
      cleanIslands: 0,
      fillHoles: 0,
      edgeShrink: 0,
      edgeFeather: 0,
      speckleClean: 0,
      alphaContrast: 0,
      guideRadius: 0,
      guideEps: 0,
      solidifyRadius: 0,
      solidifyStrength: 0,
    };
  }

  // Faktor dari model: model terbaik mengurangi intensitas perapian.
  const modelFactor = quality === "best" ? 0.5 : quality === "balanced" ? 0.75 : 1;
  const strong = refine === "strong";

  return {
    // Buang pulau: hanya bercak yang benar-benar terpisah jauh.
    cleanIslands: Math.round((strong ? 22 : 15) * modelFactor),
    fillHoles: Math.round((strong ? 50 : 35) * modelFactor),
    // Erosi: HANYA untuk model cepat. Model seimbang & terbaik tidak dierosi
    // sama sekali agar tepi objek tidak terkikis.
    edgeShrink: strong && quality === "fast" ? 1 : 0,
    // Feather sangat ringan: hanya menghaluskan transisi 1 px.
    edgeFeather: strong ? 0.6 : 0.4,
    // Median: hanya untuk bercak, dan tidak dipakai pada model terbaik.
    speckleClean: strong && quality !== "best" ? 1 : 0,
    // Kurva alfa: dijaga sangat rendah. Nilai tinggi memotong piksel samar
    // (yang justru berisi detail rambut tipis).
    alphaContrast: Math.round((strong ? 15 : 8) * modelFactor),
    // Guided filter: satu-satunya teknik yang MEMPERTAHANKAN detail, jadi tetap.
    guideRadius: strong ? 6 : 5,
    guideEps: strong ? 0.008 : 0.01,
    // Padatkan area tebal yang salah transparan (pakaian gelap).
    // Radius 8 px: cukup untuk menangkap area seluas itu, tapi tidak menyentuh
    // tepi tipis seperti rambut. Kekuatan dinaikkan pada mode kuat.
    solidifyRadius: strong ? 10 : 8,
    solidifyStrength: strong ? 80 : 70,
  };
}

// ---------- Worker persisten ----------

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void; onProgress?: SeparateProgress }>();

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./separate.worker.ts", import.meta.url));
  } catch {
    return null;
  }
  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data as
      | { type: "progress"; id: number; label: string; pct: number | null }
      | { type: "done"; id: number; blob: Blob }
      | { type: "error"; id: number; message: string };
    const entry = pending.get(msg.id);
    if (!entry) return;
    if (msg.type === "progress") {
      entry.onProgress?.(msg.label, msg.pct);
    } else if (msg.type === "done") {
      pending.delete(msg.id);
      entry.resolve(msg.blob);
    } else {
      pending.delete(msg.id);
      entry.reject(new Error(msg.message));
    }
  };
  worker.onerror = (err) => {
    // Worker rusak: buang supaya dibuat ulang pada permintaan berikutnya.
    for (const [, entry] of pending) entry.reject(new Error(err.message || "Worker gagal"));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function runInWorker(
  source: Blob,
  quality: SeparateQuality,
  refine: SeparateRefine,
  onProgress?: SeparateProgress,
): Promise<Blob> {
  const w = getWorker();
  if (!w) return Promise.reject(new Error("Worker tidak tersedia"));
  const id = ++seq;
  return new Promise<Blob>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    w.postMessage({ type: "separate", id, source, quality, refine });
  });
}

/** Fallback: thread utama (memblokir UI; dipakai hanya bila worker gagal). */
async function runOnMain(
  source: Blob,
  quality: SeparateQuality,
  refine: SeparateRefine,
  onProgress?: SeparateProgress,
): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");
  const { refineMatteBlob } = await import("./matte");
  const raw = await removeBackground(source, {
    model: MODEL_BY_QUALITY[quality],
    output: { format: "image/png", quality: 1 },
    progress: (key: string, cur: number, tot: number) => {
      onProgress?.(key.startsWith("fetch") ? "Mengunduh model…" : "Memproses foto…", tot > 0 ? cur / tot : null);
    },
  });
  if (refine === "off") return raw;
  onProgress?.("Merapikan tepi…", null);
  return refineMatteBlob(raw, matteOptions(refine, quality));
}

export async function separateSubject(
  source: Blob,
  quality: SeparateQuality,
  refine: SeparateRefine,
  onProgress?: SeparateProgress,
): Promise<Blob> {
  if (typeof Worker !== "undefined") {
    try {
      return await runInWorker(source, quality, refine, onProgress);
    } catch {
      /* jatuh ke thread utama */
    }
  }
  return runOnMain(source, quality, refine, onProgress);
}

/**
 * Unduh dan siapkan model di latar belakang tanpa memblokir apa pun.
 * Aman dipanggil berulang; worker mengabaikan permintaan preload kedua.
 */
export function preloadModel(quality: SeparateQuality = "balanced"): void {
  const w = getWorker();
  if (!w) return;
  w.postMessage({ type: "preload", quality });
}

/** Lepas worker (mis. saat semua foto ditutup) untuk membebaskan memori model. */
export function releaseWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}
