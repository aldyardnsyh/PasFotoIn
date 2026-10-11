/**
 * Standar ukuran pas foto dan dokumen.
 *
 * SUMBER & VERIFIKASI (diperiksa Agustus 2026):
 *
 * 1. Ukuran Indonesia (2x3, 3x4, 4x6, 6x9 cm) — konsisten lintas sumber:
 *    Paspoto, FixYourPic, ITKoding, Teknogram, SSFoto.
 *    Perbedaan angka piksel yang beredar di internet BUKAN karena standar berbeda,
 *    melainkan karena DPI yang dipakai berbeda:
 *    - 300 dpi (standar cetak): 3x4 cm = 354 x 472 px
 *    - 200 dpi (beberapa portal): 3x4 cm = 236 x 315 px
 *    Rumus: px = (mm / 25.4) * dpi
 *
 * 2. Standar internasional (ICAO Doc 9303, Edisi 8 2021) — dipakai 193 negara:
 *    - Geometri wajah: dagu ke ubun-ubun = 70-80% tinggi foto
 *    - Mata terbuka, ekspresi netral, mulut tertutup, kepala tegak
 *    - Latar polos terang (variasi nasional: AS putih, UK krem, Schengen abu terang)
 *    - Resolusi minimum 600 dpi pada ukuran cetak (35x45 mm = ~827 x 1063 px)
 *    - Dilarang: kacamata (mayoritas negara), edit wajah digital (aturan 2026)
 *
 * 3. Aturan latar Indonesia: merah untuk tahun lahir ganjil, biru untuk genap
 *    (dokumen sipil seperti KTP). Sekolah/instansi bisa punya aturan sendiri.
 */

export type RatioPreset = {
  id: string;
  label: string;
  group: "Umum" | "Media sosial" | "Marketplace" | "Dokumen" | "Internasional";
  w: number;
  h: number;
  /** Piksel pada 300 dpi (standar cetak). */
  px?: [number, number];
  /** Ukuran cetak dalam milimeter (sumber kebenaran ukuran fisik). */
  mm?: [number, number];
  /** Keterangan singkat: untuk keperluan apa. */
  note?: string;
};

export const RATIO_PRESETS: RatioPreset[] = [
  // --- Umum (rasio saja, tanpa ukuran fisik) ---
  { id: "1:1", label: "1:1", group: "Umum", w: 1, h: 1 },
  { id: "4:5", label: "4:5", group: "Umum", w: 4, h: 5 },
  { id: "3:4", label: "3:4", group: "Umum", w: 3, h: 4 },
  { id: "2:3", label: "2:3", group: "Umum", w: 2, h: 3 },
  { id: "9:16", label: "9:16", group: "Umum", w: 9, h: 16 },
  { id: "16:9", label: "16:9", group: "Umum", w: 16, h: 9 },
  { id: "4:3", label: "4:3", group: "Umum", w: 4, h: 3 },
  { id: "3:2", label: "3:2", group: "Umum", w: 3, h: 2 },
  { id: "21:9", label: "21:9", group: "Umum", w: 21, h: 9 },

  // --- Media sosial ---
  { id: "ig-feed", label: "Instagram feed", group: "Media sosial", w: 4, h: 5, px: [1080, 1350] },
  { id: "ig-story", label: "Instagram story", group: "Media sosial", w: 9, h: 16, px: [1080, 1920] },
  { id: "tiktok", label: "TikTok", group: "Media sosial", w: 9, h: 16, px: [1080, 1920] },
  { id: "yt-thumb", label: "YouTube", group: "Media sosial", w: 16, h: 9, px: [1280, 720] },
  { id: "x-header", label: "Header X", group: "Media sosial", w: 3, h: 1, px: [1500, 500] },
  { id: "li-banner", label: "LinkedIn", group: "Media sosial", w: 4, h: 1, px: [1584, 396] },
  { id: "fb-cover", label: "Sampul Facebook", group: "Media sosial", w: 205, h: 78, px: [820, 312] },

  // --- Marketplace ---
  { id: "marketplace", label: "Produk", group: "Marketplace", w: 1, h: 1, px: [1200, 1200] },

  // --- Dokumen Indonesia (ukuran cm standar, piksel 300 dpi terverifikasi) ---
  {
    id: "pasfoto-2x3",
    label: "Pas foto 2x3",
    group: "Dokumen",
    w: 2,
    h: 3,
    px: [236, 354],
    mm: [20, 30],
    note: "SKCK, kartu anggota",
  },
  {
    id: "pasfoto-3x4",
    label: "Pas foto 3x4",
    group: "Dokumen",
    w: 3,
    h: 4,
    px: [354, 472],
    mm: [30, 40],
    note: "KTP, SIM, ijazah, lamaran kerja",
  },
  {
    id: "pasfoto-4x6",
    label: "Pas foto 4x6",
    group: "Dokumen",
    w: 2,
    h: 3,
    px: [472, 709],
    mm: [40, 60],
    note: "CPNS, SKCK, berkas resmi",
  },
  {
    id: "pasfoto-6x9",
    label: "Pas foto 6x9",
    group: "Dokumen",
    w: 2,
    h: 3,
    px: [709, 1063],
    mm: [60, 90],
    note: "Ijazah besar, dokumen khusus",
  },

  // --- Internasional (mengikuti ICAO Doc 9303 + aturan nasional) ---
  {
    id: "icao-35x45",
    label: "Paspor ICAO",
    group: "Internasional",
    w: 35,
    h: 45,
    px: [413, 531],
    mm: [35, 45],
    note: "Standar Schengen, UK, Australia, Jepang",
  },
  {
    id: "us-51x51",
    label: "Paspor AS 2x2 inci",
    group: "Internasional",
    w: 1,
    h: 1,
    // 51 mm @300 dpi = 602 px. Untuk portal DS-160, Departemen Luar Negeri AS
    // meminta tepat 600x600 px — gunakan mode piksel kustom bila perlu.
    px: [602, 602],
    mm: [51, 51],
    note: "DS-160 & paspor AS, latar putih",
  },
  {
    id: "china-33x48",
    label: "Visa China",
    group: "Internasional",
    w: 33,
    h: 48,
    px: [390, 567],
    mm: [33, 48],
    note: "COVA, latar putih",
  },
  {
    id: "malaysia-35x50",
    label: "Paspor Malaysia",
    group: "Internasional",
    w: 35,
    h: 50,
    px: [413, 591],
    mm: [35, 50],
    note: "FWCMS, latar putih",
  },
  {
    id: "india-25x35",
    label: "PAN India",
    group: "Internasional",
    w: 25,
    h: 35,
    px: [295, 413],
    mm: [25, 35],
    note: "Kartu PAN, latar putih",
  },
];

/** Kualitas cetak standar (dpi) untuk konversi mm ke piksel. */
export const PRINT_DPI = 300;

/** DPI minimum untuk portal digital sesuai ICAO Doc 9303. */
export const ICAO_DIGITAL_DPI = 600;

/**
 * Opsi resolusi ekspor untuk preset dokumen.
 * 300 dpi = standar cetak; 600 dpi = minimum portal digital (ICAO 9303).
 */
export const DPI_OPTIONS = [
  { dpi: 300, label: "300 DPI", hint: "Standar cetak" },
  { dpi: 600, label: "600 DPI", hint: "Portal digital (ICAO)" },
] as const;

/** Preset dokumen resmi Indonesia, dipakai untuk pintasan cepat. */
export const FORMAL_DOCUMENT_PRESETS = [
  { id: "ktp", label: "KTP / SIM", hint: "Merah 3x4", presetId: "pasfoto-3x4", color: "#D32F2F" },
  { id: "ijazah", label: "Ijazah / CPNS", hint: "Biru 4x6", presetId: "pasfoto-4x6", color: "#0B57D0" },
  { id: "paspor", label: "Paspor / Visa", hint: "Putih 3.5x4.5", presetId: "icao-35x45", color: "#FFFFFF" },
] as const;

/** Warna latar standar resmi Indonesia. */
export const FORMAL_BACKGROUNDS = [
  { label: "Merah Resmi", color: "#D32F2F", hint: "KTP, SIM, tahun lahir ganjil" },
  { label: "Biru Resmi", color: "#0B57D0", hint: "Ijazah, CPNS, tahun lahir genap" },
  { label: "Putih Bersih", color: "#FFFFFF", hint: "Paspor, visa, dokumen internasional" },
  { label: "Abu Studio", color: "#64748B", hint: "Netral, berbagai keperluan" },
] as const;

type GradientPreset = { stops: { color: string; at: number }[]; angle: number };

export const GRADIENT_PRESETS: GradientPreset[] = [
  { stops: [{ color: "#F8FAFC", at: 0 }, { color: "#E2E8F0", at: 1 }], angle: 180 },
  { stops: [{ color: "#EFF5FF", at: 0 }, { color: "#DCE8FE", at: 1 }], angle: 180 },
  { stops: [{ color: "#DBEAFE", at: 0 }, { color: "#BFDBFE", at: 1 }], angle: 135 },
  { stops: [{ color: "#FDF2F8", at: 0 }, { color: "#FCE7F3", at: 1 }], angle: 135 },
  { stops: [{ color: "#FEF3C7", at: 0 }, { color: "#FDE68A", at: 1 }], angle: 135 },
  { stops: [{ color: "#ECFDF5", at: 0 }, { color: "#D1FAE5", at: 1 }], angle: 135 },
  { stops: [{ color: "#1E293B", at: 0 }, { color: "#0F172A", at: 1 }], angle: 180 },
  { stops: [{ color: "#334155", at: 0 }, { color: "#1E293B", at: 1 }], angle: 180 },
  { stops: [{ color: "#F8FAFC", at: 0 }, { color: "#CBD5E1", at: 1 }], angle: 90 },
  { stops: [{ color: "#FEF2F2", at: 0 }, { color: "#FECACA", at: 1 }], angle: 135 },
  { stops: [{ color: "#F5F3FF", at: 0 }, { color: "#DDD6FE", at: 1 }], angle: 135 },
  { stops: [{ color: "#101828", at: 0 }, { color: "#344054", at: 1 }], angle: 160 },
];

const NEUTRAL = ["#FFFFFF", "#F5F6F8", "#E1E4EA", "#CDD2DB", "#98A2B3", "#475467", "#101828", "#000000"];
const BIRU = ["#EFF5FF", "#BED5FD", "#3E78F0", "#2F61DA", "#223A75"];
const HANGAT = ["#FFF7ED", "#FED7AA", "#C77700", "#9A3412", "#7F1D1D"];
const PASTEL = ["#FDF2F8", "#FCE7F3", "#ECFDF5", "#D1FAE5", "#FEF3C7"];
const GELAP = ["#1E293B", "#0F172A", "#223A75", "#3B0764", "#450A0A"];

export const SOLID_SWATCHES: { group: string; colors: string[] }[] = [
  { group: "Netral", colors: NEUTRAL },
  { group: "Biru", colors: BIRU },
  { group: "Hangat", colors: HANGAT },
  { group: "Pastel", colors: PASTEL },
  { group: "Gelap", colors: GELAP },
];

/** Konversi milimeter ke piksel pada dpi tertentu. */
export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

/**
 * Ukuran piksel preset pada dpi tertentu.
 * Bila preset punya `mm`, hitung dari mm (sumber kebenaran ukuran fisik).
 * Bila tidak, skala dari px 300 dpi bawaan.
 */
export function presetPxAt(preset: RatioPreset, dpi: number): [number, number] | null {
  if (preset.mm) return [mmToPx(preset.mm[0], dpi), mmToPx(preset.mm[1], dpi)];
  if (preset.px) {
    const k = dpi / PRINT_DPI;
    return [Math.round(preset.px[0] * k), Math.round(preset.px[1] * k)];
  }
  return null;
}
