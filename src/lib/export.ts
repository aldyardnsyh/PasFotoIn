import type { Project } from "./geometry";
import { prepareSource, renderToBlob, render } from "./render";
import { safeFilename } from "./filename";

export const MAX_SIDE = 8192;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function targetSize(
  ratioW: number,
  ratioH: number,
  presetPx: [number, number] | null,
  mode: "preset" | "1x" | "2x" | "3x" | "custom",
  customW: number,
  customH: number,
): { w: number; h: number } | { error: string } {
  let w: number;
  let h: number;
  if (mode === "custom") {
    w = Math.round(customW);
    h = Math.round(customH);
  } else if (mode === "preset") {
    const base = presetPx ?? [1080, Math.round((1080 * ratioH) / ratioW)];
    w = base[0];
    h = base[1];
  } else {
    const mult = Number(mode[0]);
    const baseW = presetPx ? presetPx[0] : 1080;
    w = Math.round(baseW * mult);
    h = Math.round((w * ratioH) / ratioW);
  }
  if (w <= 0 || h <= 0) return { error: "Ukuran tidak valid." };
  if (Math.max(w, h) > MAX_SIDE) {
    return { error: `Sisi terpanjang maksimum ${MAX_SIDE} px. Kecilkan ukuran atau pilih skala lebih rendah.` };
  }
  return { w, h };
}

const MIME: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

export async function exportBlob(
  project: Project,
  source: Blob,
  bgBlob: Blob | null,
  w: number,
  h: number,
  format: "png" | "jpeg" | "webp",
  quality: number,
): Promise<Blob | null> {
  return renderToBlob(project, source, bgBlob, w, h, MIME[format], format === "png" ? undefined : quality / 100);
}

/** Perkiraan ukuran file: render kecil lalu skala jumlah pikselnya. */
export async function estimateBytes(
  project: Project,
  source: Blob,
  bgBlob: Blob | null,
  w: number,
  h: number,
  format: "png" | "jpeg" | "webp",
  quality: number,
): Promise<number> {
  const sw = 320;
  const sh = Math.max(1, Math.round((sw * h) / w));
  const blob = await exportBlob(project, source, bgBlob, sw, sh, format, quality);
  if (!blob) return 0;
  return Math.round(blob.size * ((w * h) / (sw * sh)));
}

export type ExportPreview = { dataUrl: string; estimate: number };

/**
 * Pratinjau dan perkiraan ukuran dalam SATU kali decode + render.
 *
 * Versi lama memanggil estimateBytes() dan previewDataUrl() terpisah sehingga
 * gambar di-decode dua kali dan dirender dua kali setiap perubahan slider.
 * Dengan menggabungkannya, dialog ekspor terasa jauh lebih cepat.
 */
export async function previewAndEstimate(
  project: Project,
  source: Blob,
  bgBlob: Blob | null,
  w: number,
  h: number,
  format: "png" | "jpeg" | "webp",
  quality: number,
  maxW = 480,
): Promise<ExportPreview | null> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  const bgBitmap = bgBlob ? await createImageBitmap(bgBlob) : null;
  try {
    const drawable = await prepareSource(bitmap, project.adjust);
    const q = format === "png" ? undefined : quality / 100;

    // Pratinjau untuk ditampilkan.
    const pw = maxW;
    const ph = Math.max(1, Math.round((maxW * project.ratioH) / project.ratioW));
    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = pw;
    previewCanvas.height = ph;
    const pctx = previewCanvas.getContext("2d");
    if (!pctx) return null;
    if (project.background.kind === "transparent" && format === "jpeg") {
      pctx.fillStyle = "#FFFFFF";
      pctx.fillRect(0, 0, pw, ph);
    }
    render(pctx, project, drawable, pw, ph, bgBitmap);
    const dataUrl = previewCanvas.toDataURL(MIME[format], q);

    // Perkiraan ukuran: render kecil lalu skalakan jumlah piksel.
    const sw = 320;
    const sh = Math.max(1, Math.round((sw * h) / w));
    const estCanvas = document.createElement("canvas");
    estCanvas.width = sw;
    estCanvas.height = sh;
    const ectx = estCanvas.getContext("2d");
    if (!ectx) return { dataUrl, estimate: 0 };
    if (project.background.kind === "transparent" && format === "jpeg") {
      ectx.fillStyle = "#FFFFFF";
      ectx.fillRect(0, 0, sw, sh);
    }
    render(ectx, project, drawable, sw, sh, bgBitmap);
    const estBlob = await new Promise<Blob | null>((resolve) => estCanvas.toBlob(resolve, MIME[format], q));
    const estimate = estBlob ? Math.round(estBlob.size * ((w * h) / (sw * sh))) : 0;

    return { dataUrl, estimate };
  } finally {
    bitmap.close();
    bgBitmap?.close();
  }
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // Sanitasi di titik terakhir: apa pun yang lolos dari pemanggil tidak akan
  // pernah menjadi path traversal saat disimpan peramban.
  a.download = safeFilename(filename, "unduhan");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Pratinjau kecil untuk dialog ekspor. */
export async function previewDataUrl(
  project: Project,
  source: Blob,
  bgBlob: Blob | null,
  format: "png" | "jpeg" | "webp",
  quality: number,
  maxW = 480,
): Promise<string | null> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  const bgBitmap = bgBlob ? await createImageBitmap(bgBlob) : null;
  const w = maxW;
  const h = Math.max(1, Math.round((maxW * project.ratioH) / project.ratioW));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (project.background.kind === "transparent" && format === "jpeg") {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
  }
  const drawable = await prepareSource(bitmap, project.adjust);
  render(ctx, project, drawable, w, h, bgBitmap);
  bitmap.close();
  bgBitmap?.close();
  return canvas.toDataURL(MIME[format], format === "png" ? undefined : quality / 100);
}
