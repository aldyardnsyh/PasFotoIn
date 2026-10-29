/**
 * Ekspor lewat Web Worker agar UI tidak freeze, dengan fallback ke thread utama.
 *
 * Ekspor resolusi besar (mis. 3000×4000) memakan ratusan milidetik hingga beberapa
 * detik. Bila dijalankan di thread utama, halaman tampak "not responding".
 */
import { zipSync } from "fflate";
import type { Project } from "./geometry";
import { exportBlob } from "./export";
import { safeFilename } from "./filename";

export type BatchItem = { project: Project; source: Blob; bgBlob: Blob | null };

const MIME: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

type Job = {
  project: Project;
  source: Blob;
  bgBlob: Blob | null;
  w: number;
  h: number;
  type: string;
  quality?: number;
};

function toJob(it: BatchItem, w: number, h: number, format: "png" | "jpeg" | "webp", quality: number): Job {
  return {
    project: it.project,
    source: it.source,
    bgBlob: it.bgBlob,
    w,
    h,
    type: MIME[format],
    quality: format === "png" ? undefined : quality / 100,
  };
}

/**
 * Ekspor satu foto di worker. Mengembalikan null bila worker tidak tersedia
 * sehingga pemanggil bisa memakai jalur thread utama.
 */
export async function exportOneFast(
  project: Project,
  source: Blob,
  bgBlob: Blob | null,
  w: number,
  h: number,
  format: "png" | "jpeg" | "webp",
  quality: number,
): Promise<Blob | null> {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const worker = new Worker(new URL("./export.worker.ts", import.meta.url));
      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data as { type: "done"; blob: Blob } | { type: "error"; message: string };
        worker.terminate();
        if (msg.type === "done") resolve(msg.blob);
        else reject(new Error(msg.message));
      };
      worker.onerror = (err) => {
        worker.terminate();
        reject(new Error(err.message || "Worker gagal"));
      };
      worker.postMessage({ type: "single", job: toJob({ project, source, bgBlob }, w, h, format, quality) });
    });
  } catch {
    return null;
  }
}

/** Ekspor banyak foto sebagai ZIP. Worker bila tersedia, jika tidak di thread utama. */
export async function exportManyFast(
  items: BatchItem[],
  w: number,
  h: number,
  format: "png" | "jpeg" | "webp",
  quality: number,
  onProgress: (done: number, total: number) => void,
  shouldCancel: () => boolean,
): Promise<Blob | null> {
  if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined") {
    try {
      return await runInWorker(items, w, h, format, quality, onProgress, shouldCancel);
    } catch {
      /* jatuh ke thread utama */
    }
  }
  return runOnMain(items, w, h, format, quality, onProgress, shouldCancel);
}

function runInWorker(
  items: BatchItem[],
  w: number,
  h: number,
  format: "png" | "jpeg" | "webp",
  quality: number,
  onProgress: (done: number, total: number) => void,
  shouldCancel: () => boolean,
): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./export.worker.ts", import.meta.url));
    const ext = format === "jpeg" ? "jpg" : format;
    let cancelled = false;

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as
        | { type: "progress"; done: number; total: number }
        | { type: "done"; blob: Blob }
        | { type: "error"; message: string };
      if (msg.type === "progress") {
        onProgress(msg.done, msg.total);
        if (shouldCancel()) {
          cancelled = true;
          worker.terminate();
          resolve(null);
        }
      } else if (msg.type === "done") {
        worker.terminate();
        if (cancelled) {
          resolve(null);
          return;
        }
        resolve(msg.blob);
      } else {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message || "Worker gagal"));
    };
    worker.postMessage({
      type: "batch",
      ext,
      jobs: items.map((it) => toJob(it, w, h, format, quality)),
    });
  });
}

async function runOnMain(
  items: BatchItem[],
  w: number,
  h: number,
  format: "png" | "jpeg" | "webp",
  quality: number,
  onProgress: (done: number, total: number) => void,
  shouldCancel: () => boolean,
): Promise<Blob | null> {
  const files: Record<string, Uint8Array> = {};
  const ext = format === "jpeg" ? "jpg" : format;
  const used = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    if (shouldCancel()) return null;
    const it = items[i];
    const blob = await exportBlob(it.project, it.source, it.bgBlob, w, h, format, quality);
    if (blob) {
      // Sanitasi nama entri ZIP: cegah zip-slip dari nama foto pengguna.
      const base = safeFilename(`${it.project.name}-${it.project.ratioW}x${it.project.ratioH}`, `foto-${i + 1}`);
      let name = `${base}.${ext}`;
      let n = 2;
      while (used.has(name)) name = `${base}-${n++}.${ext}`;
      used.add(name);
      files[name] = new Uint8Array(await blob.arrayBuffer());
    }
    onProgress(i + 1, items.length);
  }
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped as BlobPart], { type: "application/zip" });
}
