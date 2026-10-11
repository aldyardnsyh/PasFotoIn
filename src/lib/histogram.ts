/**
 * Analisis histogram dan koreksi tonal otomatis.
 *
 * Dasar teori (diverifikasi dari referensi Photoshop/GIMP/OpenCV):
 * - Citra 8-bit punya 256 tingkat kecerahan: 0 = hitam murni, 255 = putih murni.
 * - Histogram = jumlah piksel per tingkat. Membaca histogram membantu menentukan
 *   apakah foto kurang cahaya (data menumpuk di kiri), terlalu terang (menumpuk di
 *   kanan), atau kurang kontras (data tidak menyentuh kedua ujung).
 * - Levels bekerja dengan tiga titik: black point, gamma (midtone), white point.
 *   Semua nilai di bawah black point jadi hitam, di atas white point jadi putih,
 *   dan gamma menggeser kecerahan tengah.
 * - Auto Levels mencari titik terendah/tertinggi yang masih punya data berarti
 *   (mengabaikan ekor tipis), lalu merentangkan rentang itu ke 0..255.
 * - Kanal RGB dipisah karena "color cast" (foto kebiruan/kekuningan) terlihat
 *   sebagai pergeseran histogram antar kanal.
 */

export type Histogram = {
  /** Jumlah piksel per tingkat, 256 bin, untuk tiap kanal + luminance. */
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  lum: Uint32Array;
  /** Total piksel yang dihitung (piksel transparan dilewati). */
  total: number;
};

export type PixelSource = { data: Uint8ClampedArray };

/** Bobot luminance standar (Rec. 709) agar sesuai persepsi mata. */
const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;

/**
 * Hitung histogram dari data piksel.
 * Piksel dengan alfa < 16 dilewati agar area transparan tidak menggeser analisis.
 */
export function computeHistogram(img: PixelSource): Histogram {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const lum = new Uint32Array(256);
  const px = img.data;
  let total = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 16) continue;
    const cr = px[i];
    const cg = px[i + 1];
    const cb = px[i + 2];
    r[cr]++;
    g[cg]++;
    b[cb]++;
    lum[Math.round(LR * cr + LG * cg + LB * cb)]++;
    total++;
  }
  return { r, g, b, lum, total };
}

/** Nilai maksimum histogram (untuk skala grafik). */
export function histogramPeak(h: Uint32Array): number {
  let max = 0;
  for (let i = 0; i < 256; i++) if (h[i] > max) max = h[i];
  return max;
}

export type ClipInfo = {
  /** Persentase piksel yang menempel di hitam (0-4) per kanal. */
  blackPct: number;
  /** Persentase piksel yang menempel di putih (251-255) per kanal. */
  whitePct: number;
  /** Persentase piksel yang menempel di hitam untuk luminance. */
  lumBlackPct: number;
  /** Persentase piksel yang menempel di putih untuk luminance. */
  lumWhitePct: number;
};

/** Deteksi clipping: berapa persen piksel yang sudah "terpotong" di ujung rentang. */
export function detectClipping(h: Histogram): ClipInfo {
  const sum = (arr: Uint32Array, from: number, to: number) => {
    let s = 0;
    for (let i = from; i <= to; i++) s += arr[i];
    return s;
  };
  const pct = (v: number) => (h.total > 0 ? (v / h.total) * 100 : 0);
  const black = sum(h.lum, 0, 4);
  const white = sum(h.lum, 251, 255);
  return {
    blackPct: Math.max(pct(sum(h.r, 0, 4)), pct(sum(h.g, 0, 4)), pct(sum(h.b, 0, 4))),
    whitePct: Math.max(pct(sum(h.r, 251, 255)), pct(sum(h.g, 251, 255)), pct(sum(h.b, 251, 255))),
    lumBlackPct: pct(black),
    lumWhitePct: pct(white),
  };
}

export type AutoLevels = {
  /** Titik hitam hasil analisis (0..255). */
  black: number;
  /** Titik putih hasil analisis (0..255). */
  white: number;
  /** Gamma untuk midtone (0.1..10, 1 = netral). */
  gamma: number;
};

/**
 * Hitung Auto Levels dari histogram luminance.
 *
 * `clipPct` mengabaikan sekian persen ekor terluar agar beberapa piksel noise
 * tidak membuat rentang terlalu sempit (perilaku standar Auto Levels).
 */
export function computeAutoLevels(h: Histogram, clipPct = 0.5): AutoLevels {
  const lum = h.lum;
  const target = (h.total * clipPct) / 100;

  let black = 0;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += lum[i];
    if (acc > target) {
      black = i;
      break;
    }
  }

  let white = 255;
  acc = 0;
  for (let i = 255; i >= 0; i--) {
    acc += lum[i];
    if (acc > target) {
      white = i;
      break;
    }
  }

  // Jaga agar rentang tidak degenerate.
  if (white - black < 8) {
    black = 0;
    white = 255;
  }

  // Gamma dari posisi median: bila median lebih terang dari tengah, gamma > 1
  // (menerangkan midtone) dan sebaliknya.
  let median = 128;
  acc = 0;
  const half = h.total / 2;
  for (let i = 0; i < 256; i++) {
    acc += lum[i];
    if (acc >= half) {
      median = i;
      break;
    }
  }
  const midNorm = Math.min(1, Math.max(0.001, (median - black) / Math.max(1, white - black)));
  // gamma = log(0.5) / log(midNorm), dijepit agar tidak ekstrem.
  const gamma = midNorm > 0.001 && midNorm < 0.999 ? Math.min(3, Math.max(0.33, Math.log(0.5) / Math.log(midNorm))) : 1;

  return { black, white, gamma };
}

/**
 * Bangun LUT 256 entri untuk Levels.
 * Nilai < black -> 0, > white -> 255, di antaranya dinormalkan lalu dipangkatkan 1/gamma.
 */
export function buildLevelsLut(black: number, white: number, gamma: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const span = Math.max(1, white - black);
  const invGamma = 1 / Math.max(0.01, gamma);
  for (let i = 0; i < 256; i++) {
    let v = (i - black) / span;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    lut[i] = Math.round(Math.pow(v, invGamma) * 255);
  }
  return lut;
}

/** Terapkan LUT ke kanal RGB (alfa tidak diubah). */
export function applyLevels(img: PixelSource, lut: Uint8ClampedArray): void {
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    px[i] = lut[px[i]];
    px[i + 1] = lut[px[i + 1]];
    px[i + 2] = lut[px[i + 2]];
  }
}

export type AutoWhiteBalanceResult = {
  /** Gain per kanal yang disarankan (1 = tidak berubah). */
  gains: [number, number, number];
  /** true bila perbedaan antar kanal cukup besar untuk perlu dikoreksi. */
  needed: boolean;
};

/**
 * Auto white balance berbasis gray-world dengan pembatasan.
 *
 * Rata-rata tiap kanal dianggap seharusnya sama (abu-abu netral). Gain dihitung
 * dari rasio, lalu dijepit agar foto yang memang berwarna kuat tidak rusak.
 */
export function computeAutoWhiteBalance(img: PixelSource, strength = 1): AutoWhiteBalanceResult {
  const px = img.data;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 16) continue;
    r += px[i];
    g += px[i + 1];
    b += px[i + 2];
    n++;
  }
  if (n === 0) return { gains: [1, 1, 1], needed: false };
  r /= n;
  g /= n;
  b /= n;
  const gray = (r + g + b) / 3;
  if (gray < 1) return { gains: [1, 1, 1], needed: false };

  const clamp = (v: number) => Math.min(1.35, Math.max(0.74, v));
  const gr = clamp(gray / Math.max(1, r));
  const gg = clamp(gray / Math.max(1, g));
  const gb = clamp(gray / Math.max(1, b));

  // Terapkan sebagian sesuai `strength` agar hasil tidak agresif.
  const mix = (v: number) => 1 + (v - 1) * strength;

  const maxDev = Math.max(Math.abs(gr - 1), Math.abs(gg - 1), Math.abs(gb - 1));
  return { gains: [mix(gr), mix(gg), mix(gb)], needed: maxDev > 0.04 };
}

/** Terapkan gain per kanal. */
export function applyGains(img: PixelSource, gains: [number, number, number]): void {
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    px[i] = px[i] * gains[0];
    px[i + 1] = px[i + 1] * gains[1];
    px[i + 2] = px[i + 2] * gains[2];
  }
}

/** Deskripsi kondisi foto berdasarkan histogram, untuk ditampilkan ke pengguna. */
export function describeHistogram(h: Histogram): string {
  const clip = detectClipping(h);
  const notes: string[] = [];

  if (clip.lumBlackPct > 2) notes.push("banyak area gelap terpotong (hitam pekat)");
  if (clip.lumWhitePct > 2) notes.push("banyak area terang terpotong (putih pecah)");

  // Deteksi rentang sempit: data hanya menempati sebagian tengah histogram.
  let first = 0;
  let last = 255;
  for (let i = 0; i < 256; i++) {
    if (h.lum[i] > h.total * 0.0005) {
      first = i;
      break;
    }
  }
  for (let i = 255; i >= 0; i--) {
    if (h.lum[i] > h.total * 0.0005) {
      last = i;
      break;
    }
  }
  const span = last - first;
  if (span < 140) notes.push("kontras rendah (data menumpuk di tengah)");

  // Color cast: bandingkan median antar kanal.
  const medianOf = (arr: Uint32Array) => {
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += arr[i];
      if (acc >= h.total / 2) return i;
    }
    return 128;
  };
  const mr = medianOf(h.r);
  const mb = medianOf(h.b);
  if (Math.abs(mr - mb) > 14) notes.push(mr > mb ? "warna cenderung hangat" : "warna cenderung dingin");

  if (notes.length === 0) return "Distribusi cahaya sudah seimbang.";
  return `Perhatian: ${notes.join(", ")}.`;
}
