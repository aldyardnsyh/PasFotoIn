/**
 * Tata letak lembar cetak A4 berisi banyak salinan pas foto.
 *
 * Berguna untuk kebutuhan resmi (KTP, ijazah, paspor) yang biasanya minta
 * beberapa lembar ukuran sama. Semua digambar di kanvas pada 300 dpi lalu
 * diekspor sebagai PNG/JPEG siap kirim ke lab foto.
 */
import type { Project } from "./geometry";
import { render } from "./render";
import type { Drawable } from "./render";

/** Ukuran A4 dalam milimeter (potret). */
export const A4_MM = { w: 210, h: 297 };

/** Margin cetak yang aman untuk printer rumahan (mm). */
const MARGIN_MM = 8;

/** Jarak antar foto (mm). */
const GAP_MM = 2;

export type SheetOptions = {
  /** Ukuran foto pada lembar, mm. */
  photoMm: [number, number];
  /** DPI keluaran. */
  dpi: number;
  /** Tambahkan garis potong tipis di sekeliling setiap foto. */
  cutMarks: boolean;
  /** Warna latar lembar. */
  sheetColor: string;
};

export const DEFAULT_SHEET: SheetOptions = {
  photoMm: [30, 40],
  dpi: 300,
  cutMarks: true,
  sheetColor: "#FFFFFF",
};

export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

/** Hitung berapa foto muat pada lembar A4 untuk ukuran tertentu. */
export function sheetCapacity(photoMm: [number, number], dpi = 300): { cols: number; rows: number; total: number; px: [number, number] } {
  const [pw, ph] = photoMm;
  const usableW = A4_MM.w - MARGIN_MM * 2;
  const usableH = A4_MM.h - MARGIN_MM * 2;
  const cols = Math.max(1, Math.floor((usableW + GAP_MM) / (pw + GAP_MM)));
  const rows = Math.max(1, Math.floor((usableH + GAP_MM) / (ph + GAP_MM)));
  return {
    cols,
    rows,
    total: cols * rows,
    px: [mmToPx(pw, dpi), mmToPx(ph, dpi)],
  };
}

/**
 * Render satu lembar A4 berisi `count` salinan foto (maksimum kapasitas).
 * `bitmap` adalah foto sumber (sudah dipotong sesuai rasio), `project` memberi
 * pengaturan transformasi dan latar.
 */
export function renderSheet(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  project: Project,
  bitmap: Drawable,
  opts: SheetOptions,
  count?: number,
): { total: number; cols: number; rows: number } {
  const { cols, rows, total, px } = sheetCapacity(opts.photoMm, opts.dpi);
  const [pw, ph] = px;
  const sheetW = mmToPx(A4_MM.w, opts.dpi);
  const sheetH = mmToPx(A4_MM.h, opts.dpi);
  const margin = mmToPx(MARGIN_MM, opts.dpi);
  const gap = mmToPx(GAP_MM, opts.dpi);

  // Latar lembar.
  ctx.fillStyle = opts.sheetColor;
  ctx.fillRect(0, 0, sheetW, sheetH);

  const use = Math.min(count ?? total, total);
  const perRow = cols;
  // Di dalam sel, padding bingkai tidak diterapkan lagi: padding sudah diwakili
  // oleh jarak antar sel pada lembar cetak.
  const cellProject = { ...project, frame: { padding: 0, radius: 0 } };
  for (let i = 0; i < use; i++) {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = margin + col * (pw + gap);
    const y = margin + row * (ph + gap);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, pw, ph);
    ctx.clip();
    ctx.translate(x, y);
    render(ctx, cellProject, bitmap, pw, ph, null);
    ctx.restore();

    if (opts.cutMarks) {
      ctx.save();
      ctx.strokeStyle = "rgba(15, 23, 42, 0.35)";
      ctx.lineWidth = Math.max(1, Math.round(opts.dpi / 300));
      ctx.setLineDash([mmToPx(1.5, opts.dpi), mmToPx(1.5, opts.dpi)]);
      ctx.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1);
      ctx.restore();
    }
  }

  return { total: use, cols, rows };
}

/** Render lembar A4 ke blob pada format tertentu. */
export async function renderSheetBlob(
  project: Project,
  source: Blob,
  opts: SheetOptions,
  format: "png" | "jpeg" | "webp",
  quality: number,
  count?: number,
): Promise<{ blob: Blob; total: number; cols: number; rows: number } | null> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const { prepareSource } = await import("./render");
    const maxSide = Math.max(mmToPx(opts.photoMm[0], opts.dpi), mmToPx(opts.photoMm[1], opts.dpi));
    const drawable = await prepareSource(bitmap, project.adjust, maxSide);
    const sheetW = mmToPx(A4_MM.w, opts.dpi);
    const sheetH = mmToPx(A4_MM.h, opts.dpi);
    const canvas = document.createElement("canvas");
    canvas.width = sheetW;
    canvas.height = sheetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const info = renderSheet(ctx, project, drawable, opts, count);

    const mime = format === "png" ? "image/png" : format === "jpeg" ? "image/jpeg" : "image/webp";
    const q = format === "png" ? undefined : quality / 100;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, q));
    if (!blob) return null;
    return { blob, ...info };
  } finally {
    bitmap.close();
  }
}
