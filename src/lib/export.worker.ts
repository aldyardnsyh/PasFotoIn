/// <reference lib="webworker" />
/**
 * Worker ekspor: render satu atau banyak foto tanpa memblokir UI.
 * Dipakai untuk ekspor resolusi besar dan batch ZIP.
 */
import { zipSync } from "fflate";
import { prepareSource, render } from "../lib/render";
import type { Project } from "../lib/geometry";

type Job = {
  project: Project;
  source: Blob;
  bgBlob: Blob | null;
  w: number;
  h: number;
  type: string;
  quality?: number;
};

type InMessage =
  | { type: "single"; job: Job }
  | { type: "batch"; jobs: Job[]; ext: string };

/** Nama file unik agar tidak saling menimpa di ZIP. */
function uniqueName(base: string, ext: string, used: Set<string>): string {
  let name = `${base}.${ext}`;
  let n = 2;
  while (used.has(name)) name = `${base}-${n++}.${ext}`;
  used.add(name);
  return name;
}

async function renderJob(job: Job): Promise<Blob> {
  const bitmap = await createImageBitmap(job.source, { imageOrientation: "from-image" });
  const bgBitmap = job.bgBlob ? await createImageBitmap(job.bgBlob) : null;
  try {
    const canvas = new OffscreenCanvas(job.w, job.h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("OffscreenCanvas tidak tersedia");
    if (job.project.background.kind === "transparent" && job.type === "image/jpeg") {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, job.w, job.h);
    }
    const drawable = await prepareSource(bitmap, job.project.adjust, Math.max(job.w, job.h));
    render(ctx, job.project, drawable, job.w, job.h, bgBitmap);
    return await canvas.convertToBlob({ type: job.type, quality: job.quality });
  } finally {
    bitmap.close();
    bgBitmap?.close();
  }
}

self.onmessage = async (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  try {
    if (msg.type === "single") {
      const blob = await renderJob(msg.job);
      self.postMessage({ type: "done", blob });
      return;
    }

    const files: Record<string, Uint8Array> = {};
    const used = new Set<string>();
    for (let i = 0; i < msg.jobs.length; i++) {
      const job = msg.jobs[i];
      const blob = await renderJob(job);
      const base = `${job.project.name}-${job.project.ratioW}x${job.project.ratioH}`;
      files[uniqueName(base, msg.ext, used)] = new Uint8Array(await blob.arrayBuffer());
      self.postMessage({ type: "progress", done: i + 1, total: msg.jobs.length });
    }
    const zipped = zipSync(files, { level: 6 });
    self.postMessage({ type: "done", blob: new Blob([zipped as BlobPart], { type: "application/zip" }) });
  } catch (err) {
    self.postMessage({ type: "error", message: err instanceof Error ? err.message : "Ekspor gagal" });
  }
};
