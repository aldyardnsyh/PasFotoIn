/** Ekstrak 5 warna dominan dengan median cut pada gambar kecil 64 px. */
export function extractPalette(bitmap: ImageBitmap, count = 5): string[] {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  // Bitmap bisa sudah dilepas bila foto diganti saat proses berjalan.
  // Kembalikan array kosong agar UI tidak crash; palet akan dihitung ulang.
  try {
    if (bitmap.width < 1 || bitmap.height < 1) return [];
    ctx.drawImage(bitmap, 0, 0, size, size);
  } catch {
    return [];
  }
  const data = ctx.getImageData(0, 0, size, size).data;
  const pixels: number[][] = [];
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] < 125) continue;
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (pixels.length === 0) return [];

  function medianCut(boxes: number[][][], depth: number): number[][][] {
    if (depth === 0 || boxes.length === 0) return boxes;
    const out: number[][][] = [];
    for (const box of boxes) {
      if (box.length <= 2) {
        out.push(box);
        continue;
      }
      const ranges = [0, 1, 2].map((c) => Math.max(...box.map((p) => p[c])) - Math.min(...box.map((p) => p[c])));
      const ch = ranges.indexOf(Math.max(...ranges));
      const sorted = [...box].sort((a, b) => a[ch] - b[ch]);
      const mid = Math.floor(sorted.length / 2);
      out.push(sorted.slice(0, mid), sorted.slice(mid));
    }
    return medianCut(out, depth - 1);
  }

  const depth = Math.ceil(Math.log2(count));
  const boxes = medianCut([pixels], depth)
    .map((box) => {
      const avg = [0, 0, 0];
      for (const p of box) {
        avg[0] += p[0];
        avg[1] += p[1];
        avg[2] += p[2];
      }
      return avg.map((v) => Math.round(v / box.length));
    })
    .slice(0, count);

  return boxes.map(([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
}
