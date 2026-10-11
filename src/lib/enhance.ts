/**
 * Peningkatan ketajaman dan detail tanpa mengubah warna, kontras, atau isi foto.
 *
 * Masalah yang diselesaikan: setelah penggantian latar atau pemrosesan ulang,
 * foto sering kehilangan ketajaman karena resampling berulang. Pengguna ingin
 * "diperjelas" tanpa efek samping.
 *
 * Teknik yang dipakai:
 * 1. Unsharp mask (USM) - standar industri: kurangi versi blur dari aslinya,
 *    hasilnya tepi lebih tegas. Dilakukan pada kanal luminance saja agar warna
 *    tidak bergeser (mencegah color fringing).
 * 2. Clarity lokal, kontras midtone lokal untuk memberi kesan "detail".
 *    Berbeda dari kontras global: tidak mengubah titik hitam/putih.
 * 3. Denoise ringan sebelum sharpen, mencegah noise ikut dipertegas.
 *
 * Semua operasi bekerja pada typed arrays, aman untuk Web Worker.
 */

export type EnhanceOptions = {
  /** 0..100: kekuatan penajaman tepi (unsharp mask). 0 = mati. */
  sharpen: number;
  /** 0..100: kekuatan clarity (kontras lokal midtone). */
  clarity: number;
  /** 0..100: kekuatan denoise ringan sebelum penajaman. */
  denoise: number;
  /** Radius unsharp mask dalam piksel (0.5..3). Lebih besar = efek lebih lebar. */
  radius: number;
};

/**
 * Nilai default: sengaja LEMBUT.
 *
 * Prinsip: enhance hanya "touch up" - memperjelas detail yang sudah ada, bukan
 * mengubah tampilan foto. Nilai tinggi cenderung membuat area gelap makin gelap
 * dan tepi terlihat berlebihan, jadi default dibuat konservatif.
 */
export const DEFAULT_ENHANCE: EnhanceOptions = {
  sharpen: 30,
  clarity: 15,
  denoise: 20,
  radius: 1.2,
};

export const ENHANCE_OFF: EnhanceOptions = { sharpen: 0, clarity: 0, denoise: 0, radius: 1.2 };

/** Hitung luminance Rec.709 dari RGB (0..255). */
function lum(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Blur gaussian cepat (3 kali box blur) pada satu kanal float.
 * Pendekatan ini cukup akurat untuk unsharp mask dan jauh lebih cepat
 * daripada gaussian sejati pada radius kecil.
 */
function gaussianBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.max(1, Math.round(radius));
  let cur = src;
  for (let pass = 0; pass < 3; pass++) {
    const tmp = new Float32Array(cur.length);
    const out = new Float32Array(cur.length);
    const win = r * 2 + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += cur[row + Math.min(w - 1, Math.max(0, i))];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = sum / win;
        sum += cur[row + Math.min(w - 1, x + r + 1)] - cur[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += tmp[Math.min(h - 1, Math.max(0, i)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / win;
        sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    cur = out;
  }
  return cur;
}

/**
 * Denoise ringan: median 3x3 pada luminance bila selisihnya kecil.
 *
 * Hanya menyentuh piksel yang berbeda tipis dari tetangganya (noise), sehingga
 * detail nyata (tepinya tajam) tetap utuh. Perubahan diterapkan sebagai delta
 * (bukan rasio) agar nilai tidak pernah membalik atau menjadi negatif.
 */
function denoiseLight(rgb: Uint8ClampedArray, w: number, h: number, strength: number): void {
  if (strength <= 0) return;
  const n = w * h;
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    y[i] = lum(rgb[p], rgb[p + 1], rgb[p + 2]);
  }
  const outY = new Float32Array(y);
  const threshold = (strength / 100) * 18; // hanya noise < 18 level
  const buf = new Float32Array(9);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const p = yy * w + xx;
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ty = Math.min(h - 1, Math.max(0, yy + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const tx = Math.min(w - 1, Math.max(0, xx + dx));
          buf[k++] = y[ty * w + tx];
        }
      }
      const sorted = buf.slice().sort();
      const med = sorted[4];
      // Hanya ganti bila selisih kecil (noise), bukan tepi nyata.
      if (Math.abs(y[p] - med) < threshold) outY[p] = med;
    }
  }
  // Terapkan sebagai penambahan delta yang dibatasi, bukan rasio.
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    let d = outY[i] - y[i];
    if (d === 0) continue;
    // Denoise tidak boleh menggeser lebih dari 8 level.
    if (d > 8) d = 8;
    else if (d < -8) d = -8;
    rgb[p] = rgb[p] + d;
    rgb[p + 1] = rgb[p + 1] + d;
    rgb[p + 2] = rgb[p + 2] + d;
  }
}

/**
 * Terapkan penajaman dan clarity pada data piksel.
 *
 * PENTING, mengapa versi sebelumnya membuat foto gelap:
 * 1. Perubahan luminance diterapkan sebagai RASIO (rgb * next/cur). Bila hasil
 *    perhitungan turun ke nilai sangat kecil atau negatif, rasio menjadi ekstrem
 *    dan piksel berubah menjadi hitam.
 * 2. Clarity dihitung dari gambar yang SUDAH di-sharpen, sehingga efeknya
 *    menumpuk tanpa kendali di area gelap.
 * 3. Tidak ada batas aman pada perubahan nilai.
 *
 * Perbaikan:
 * - Perubahan diterapkan sebagai DELTA (penambahan), bukan rasio. Ini menjaga
 *   warna tetap stabil dan tidak pernah membalik nilai.
 * - Clarity dihitung dari luminance ASLI (bukan hasil sharpen), lalu hasilnya
 *   digabung dengan penajaman secara terbatas.
 * - Semua perubahan dijepit ke rentang aman, dan total pergeseran dibatasi
 *   agar foto tidak berubah drastis.
 */
export function enhanceImageData(data: ImageData, opts: EnhanceOptions): void {
  const { width: w, height: h } = data;
  const n = w * h;
  const rgb = data.data;

  if (opts.denoise > 0) denoiseLight(rgb, w, h, opts.denoise);

  const needsSharpen = opts.sharpen > 0;
  const needsClarity = opts.clarity > 0;
  if (!needsSharpen && !needsClarity) return;

  // Ambil luminance sebagai basis semua operasi.
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    y[i] = lum(rgb[p], rgb[p + 1], rgb[p + 2]);
  }

  // Akumulasi perubahan luminance dari semua teknik, lalu terapkan sekali.
  const delta = new Float32Array(n);

  // Unsharp mask: tepi lebih tegas. Dihitung dari luminance asli.
  if (needsSharpen) {
    const blurred = gaussianBlur(y, w, h, opts.radius);
    // Kekuatan diturunkan (1.4 -> 0.9) dan dibatasi agar tidak agresif.
    const amount = (opts.sharpen / 100) * 0.9;
    for (let i = 0; i < n; i++) {
      delta[i] += (y[i] - blurred[i]) * amount;
    }
  }

  // Clarity: kontras lokal midtone. Dihitung dari luminance ASLI (bukan hasil
  // sharpen) agar tidak menumpuk, lalu ditambahkan ke akumulasi.
  if (needsClarity) {
    const large = gaussianBlur(y, w, h, Math.max(3, opts.radius * 6));
    const amount = (opts.clarity / 100) * 0.45;
    for (let i = 0; i < n; i++) {
      const local = y[i] - large[i];
      // Bobot midtone: efek penuh di tengah, nol di ujung gelap/terang.
      // Ini yang mencegah area gelap makin gelap dan area terang pecah.
      const v = y[i] / 255;
      const midWeight = Math.max(0, 1 - Math.abs(v - 0.5) * 1.8);
      delta[i] += local * amount * midWeight;
    }
  }

  // Batas aman: perubahan maksimum 42 level (sekitar 16% dari rentang).
  // Ini menjamin foto tidak berubah drastis, hanya "touch up".
  const MAX_SHIFT = 42;

  // Terapkan sebagai penambahan ke ketiga kanal (bukan rasio), sehingga warna
  // tidak pernah membalik dan hue tetap terjaga.
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    let d = delta[i];
    if (d === 0) continue;
    if (d > MAX_SHIFT) d = MAX_SHIFT;
    else if (d < -MAX_SHIFT) d = -MAX_SHIFT;

    // Jangan pernah menurunkan piksel gelap lebih jauh (mencegah area gelap
    // menjadi hitam pekat) dan jangan menaikkan piksel terang (mencegah pecah).
    const cur = y[i];
    if (d < 0 && cur < 30) continue;
    if (d > 0 && cur > 225) continue;

    rgb[p] = rgb[p] + d;
    rgb[p + 1] = rgb[p + 1] + d;
    rgb[p + 2] = rgb[p + 2] + d;
  }
}

/** Terapkan peningkatan ke blob dan kembalikan PNG baru. Aman di Worker. */
export async function enhanceBlob(blob: Blob, opts: EnhanceOptions): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas =
      typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(bitmap.width, bitmap.height) : document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0);
    const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    enhanceImageData(img, opts);
    ctx.putImageData(img, 0, 0);
    if (canvas instanceof OffscreenCanvas) return await canvas.convertToBlob({ type: "image/png" });
    return await new Promise<Blob>((resolve) => (canvas as HTMLCanvasElement).toBlob((b) => resolve(b ?? blob), "image/png"));
  } finally {
    bitmap.close();
  }
}
