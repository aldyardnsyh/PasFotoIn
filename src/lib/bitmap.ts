/**
 * Helper decode gambar dengan versi pratinjau berukuran terbatas.
 *
 * Foto 12 MP (4000x3000) butuh ~48 MB RAM sebagai ImageBitmap dan lambat digambar
 * ulang setiap frame saat digeser. Dengan menahan versi pratinjau maksimal 2048 px
 * (16 MB), drag tetap mulus. Blob sumber tetap disimpan utuh, sehingga ekspor
 * selalu memakai resolusi penuh.
 */

/** Sisi terpanjang bitmap pratinjau yang disimpan di memori. */
export const PREVIEW_MAX_SIDE = 2048;

/**
 * Decode blob menjadi ImageBitmap, diperkecil bila melebihi `maxSide`.
 * Orientasi EXIF diterapkan saat decode.
 */
export async function decodePreview(blob: Blob, maxSide = PREVIEW_MAX_SIDE): Promise<ImageBitmap> {
  const full = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const longest = Math.max(full.width, full.height);
  if (longest <= maxSide) return full;

  const scale = maxSide / longest;
  const w = Math.max(1, Math.round(full.width * scale));
  const h = Math.max(1, Math.round(full.height * scale));

  const canvas =
    typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return full;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(full, 0, 0, w, h);
  full.close();

  if (canvas instanceof OffscreenCanvas) return canvas.transferToImageBitmap();
  return createImageBitmap(canvas);
}
