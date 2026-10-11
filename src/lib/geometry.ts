export type Fit = "fill" | "contain";

export type Transform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
};

export type Background =
  | { kind: "solid"; color: string }
  | { kind: "gradient"; stops: { color: string; at: number }[]; angle: number }
  | { kind: "blur"; amount: number; brightness: number }
  | { kind: "transparent" }
  | { kind: "image"; blobId: string };

/** Penyesuaian cahaya dan warna foto, semua -100..100 kecuali dinyatakan lain. */
export type Adjust = {
  /** Eksposur, kira-kira -1 sampai +1 stop. */
  exposure: number;
  contrast: number;
  saturation: number;
  /** Suhu warna: negatif lebih biru, positif lebih hangat (white balance). */
  temperature: number;
  /** Menahan atau membuka area terang. */
  highlights: number;
  /** Membuka atau menggelapkan area gelap. */
  shadows: number;
  /**
   * Levels: titik hitam 0..254, gamma 0.2..3 (1 netral), titik putih 1..255.
   * Dipakai oleh Auto Levels dan kontrol manual di panel histogram.
   * Non-destruktif: tersimpan di proyek, ikut ke ekspor, bisa di-undo.
   */
  levelBlack: number;
  levelGamma: number;
  levelWhite: number;
};

export const DEFAULT_ADJUST: Adjust = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  highlights: 0,
  shadows: 0,
  levelBlack: 0,
  levelGamma: 1,
  levelWhite: 255,
};

/** true bila levels masih pada nilai netral (tidak mengubah apa pun). */
export function isDefaultLevels(a: Adjust | undefined): boolean {
  if (!a) return true;
  return a.levelBlack === 0 && a.levelGamma === 1 && a.levelWhite === 255;
}

/**
 * Bingkai foto di dalam kanvas: padding (jarak dari tepi) dan sudut membulat.
 * Nilai dalam persen agar konsisten di semua ukuran ekspor.
 */
export type FrameStyle = {
  /** 0..25: jarak foto dari tepi bingkai, persen dari sisi terpendek. */
  padding: number;
  /** 0..50: radius sudut foto, persen dari sisi terpendek foto. */
  radius: number;
};

export const DEFAULT_FRAME: FrameStyle = { padding: 0, radius: 0 };

export function isDefaultFrame(f: FrameStyle | undefined): boolean {
  if (!f) return true;
  return f.padding === 0 && f.radius === 0;
}

export function isDefaultAdjust(a: Adjust | undefined): boolean {
  if (!a) return true;
  return (
    a.exposure === 0 &&
    a.contrast === 0 &&
    a.saturation === 0 &&
    a.temperature === 0 &&
    a.highlights === 0 &&
    a.shadows === 0 &&
    isDefaultLevels(a)
  );
}

export type Project = {
  id: string;
  name: string;
  sourceBlobId: string;
  originalBlobId?: string | null;
  ratioW: number;
  ratioH: number;
  /**
   * ID preset yang dipakai (mis. "pasfoto-4x6").
   *
   * Diperlukan karena beberapa preset punya rasio IDENTIK dengan ukuran fisik
   * berbeda: 2x3 cm, 4x6 cm, dan 6x9 cm semuanya 2:3. Tanpa ID, memilih salah
   * satu akan menandai ketiganya aktif sekaligus.
   */
  presetId?: string | null;
  fit: Fit;
  transform: Transform;
  background: Background;
  adjust: Adjust;
  frame?: FrameStyle;
  updatedAt: number;
};

export const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
};

/** Base scale so the photo covers (fill) or fits (contain) the frame, ignoring user transform. */
export function baseScale(fit: Fit, iw: number, ih: number, fw: number, fh: number): number {
  if (fit === "fill") return Math.max(fw / iw, fh / ih);
  return Math.min(fw / iw, fh / ih);
}

/**
 * Clamp translation so the (possibly rotated) photo still covers the frame in fill mode.
 * Uses the axis-aligned bounding box of the rotated photo as a conservative bound.
 *
 * `padRatio` (0..0.25) memperhitungkan padding bingkai: area efektif lebih kecil
 * dari kanvas, sehingga foto hanya perlu menutupi area dalam.
 */
export function clampTransform(
  t: Transform,
  fit: Fit,
  iw: number,
  ih: number,
  fw: number,
  fh: number,
  padRatio = 0,
): Transform {
  if (fit !== "fill") return t;
  const pad = Math.min(fw, fh) * padRatio;
  const innerW = Math.max(1, fw - pad * 2);
  const innerH = Math.max(1, fh - pad * 2);
  const bs = baseScale("fill", iw, ih, innerW, innerH);
  const s = bs * t.scale;
  const w = iw * s;
  const h = ih * s;
  const rad = (t.rotation * Math.PI) / 180;
  const bboxW = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
  const bboxH = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
  const maxX = Math.max(0, (bboxW - innerW) / 2) / innerW;
  const maxY = Math.max(0, (bboxH - innerH) / 2) / innerH;
  return {
    ...t,
    x: Math.min(maxX, Math.max(-maxX, t.x)),
    y: Math.min(maxY, Math.max(-maxY, t.y)),
  };
}
