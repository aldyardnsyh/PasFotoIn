import { Background, Project, baseScale, isDefaultAdjust } from "./geometry";
import type { Adjust } from "./geometry";

/** Konteks 2D di jendela atau di dalam worker (OffscreenCanvas). */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Sumber gambar yang bisa digambar: bitmap asli atau kanvas hasil penyesuaian. */
export type Drawable = ImageBitmap | HTMLCanvasElement | OffscreenCanvas;

/**
 * Terapkan penyesuaian cahaya/warna ke salinan bitmap.
 * Hasil di-cache per bitmap dan per nilai penyesuaian agar drag tetap mulus.
 */
const adjustCache = new WeakMap<ImageBitmap, Map<string, Drawable>>();
const ADJUST_CACHE_MAX = 6;

function adjustKey(a: Adjust, maxSide: number): string {
  return [a.exposure, a.contrast, a.saturation, a.temperature, a.highlights, a.shadows, maxSide].join(",");
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Siapkan sumber gambar dengan penyesuaian cahaya/warna.
 * `maxSide` membatasi sisi kerja: pratinjau boleh kecil, ekspor memakai ukuran asli.
 */
export async function prepareSource(bitmap: ImageBitmap, adjust: Adjust | undefined, maxSide = 2600): Promise<Drawable> {
  if (!adjust || isDefaultAdjust(adjust)) return bitmap;
  const key = adjustKey(adjust, maxSide);
  const perBitmap = adjustCache.get(bitmap);
  const hit = perBitmap?.get(key);
  if (hit) return hit;

  const s = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * s));
  const h = Math.max(1, Math.round(bitmap.height * s));
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d") as Ctx2D | null;
  if (!ctx) return bitmap;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const { adjustImageData } = await import("./adjust");
  adjustImageData(img, adjust);
  ctx.putImageData(img, 0, 0);

  let map = perBitmap;
  if (!map) {
    map = new Map();
    adjustCache.set(bitmap, map);
  }
  if (map.size >= ADJUST_CACHE_MAX) {
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }
  map.set(key, canvas);
  return canvas;
}

function drawBackground(ctx: Ctx2D, bg: Background, w: number, h: number, bitmap: ImageBitmap, bgBitmap: ImageBitmap | null) {
  switch (bg.kind) {
    case "solid":
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, w, h);
      break;
    case "gradient": {
      const rad = ((bg.angle - 90) * Math.PI) / 180;
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.hypot(w, h) / 2;
      const g = ctx.createLinearGradient(cx - r * Math.cos(rad), cy - r * Math.sin(rad), cx + r * Math.cos(rad), cy + r * Math.sin(rad));
      for (const s of bg.stops) g.addColorStop(s.at, s.color);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "blur": {
      const s = Math.max(w / bitmap.width, h / bitmap.height);
      const dw = bitmap.width * s;
      const dh = bitmap.height * s;
      ctx.save();
      ctx.filter = `blur(${bg.amount / 4}px) brightness(${1 + bg.brightness / 100})`;
      ctx.drawImage(bitmap, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.restore();
      break;
    }
    case "transparent":
      break;
    case "image": {
      if (!bgBitmap) {
        ctx.fillStyle = "#E1E4EA";
        ctx.fillRect(0, 0, w, h);
        break;
      }
      const s = Math.max(w / bgBitmap.width, h / bgBitmap.height);
      const dw = bgBitmap.width * s;
      const dh = bgBitmap.height * s;
      ctx.drawImage(bgBitmap, (w - dw) / 2, (h - dh) / 2, dw, dh);
      break;
    }
  }
}

export function render(
  ctx: Ctx2D,
  project: Pick<Project, "ratioW" | "ratioH" | "fit" | "transform" | "background" | "frame">,
  source: Drawable,
  targetW: number,
  targetH: number,
  bgBitmap: ImageBitmap | null = null,
) {
  ctx.save();
  ctx.clearRect(0, 0, targetW, targetH);

  // Bingkai dalam: padding mengurangi area foto, sudut membulat memotong tepinya.
  const frame = project.frame;
  const pad = frame?.padding ? (Math.min(targetW, targetH) * frame.padding) / 100 : 0;
  const innerW = Math.max(1, targetW - pad * 2);
  const innerH = Math.max(1, targetH - pad * 2);
  const radius = frame?.radius ? (Math.min(innerW, innerH) * frame.radius) / 100 : 0;

  drawBackground(ctx, project.background, targetW, targetH, source as ImageBitmap, bgBitmap);

  ctx.save();
  ctx.translate(pad, pad);
  if (radius > 0) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(0, 0, innerW, innerH, radius);
    else ctx.rect(0, 0, innerW, innerH);
    ctx.clip();
  }

  const sw = source.width;
  const sh = source.height;
  const bs = baseScale(project.fit, sw, sh, innerW, innerH);
  const s = bs * project.transform.scale;
  ctx.translate(innerW / 2 + project.transform.x * innerW, innerH / 2 + project.transform.y * innerH);
  ctx.rotate((project.transform.rotation * Math.PI) / 180);
  ctx.scale(project.transform.flipX ? -s : s, project.transform.flipY ? -s : s);
  ctx.drawImage(source as CanvasImageSource, -sw / 2, -sh / 2);
  ctx.restore();
  ctx.restore();
}

export async function renderToBlob(
  project: Project,
  source: Blob,
  bgBlob: Blob | null,
  targetW: number,
  targetH: number,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  const bgBitmap = bgBlob ? await createImageBitmap(bgBlob) : null;
  try {
    // Ekspor memakai penyesuaian pada resolusi penuh agar hasil tidak kehilangan detail.
    const drawable = await prepareSource(bitmap, project.adjust, Math.max(targetW, targetH));
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (project.background.kind === "transparent" && type === "image/jpeg") {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, targetW, targetH);
    }
    render(ctx, project, drawable, targetW, targetH, bgBitmap);
    return await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  } finally {
    bitmap.close();
    bgBitmap?.close();
  }
}
