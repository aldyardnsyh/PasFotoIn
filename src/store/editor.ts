"use client";

import { create } from "zustand";
import {
  Adjust,
  Background,
  DEFAULT_FRAME,
  DEFAULT_ADJUST,
  DEFAULT_TRANSFORM,
  Fit,
  FrameStyle,
  Project,
  Transform,
  clampTransform,
} from "../lib/geometry";
import { loadSettings, saveSettings, isStorageAvailable } from "../lib/storage";

export type RecentProject = Omit<Project, never>;

type Editable = Pick<
  Project,
  "ratioW" | "ratioH" | "presetId" | "fit" | "transform" | "background" | "adjust" | "frame"
>;

export type ImageEntry = {
  id: string;
  name: string;
  blobId: string;
  originalBlobId: string | null;
  bitmap: ImageBitmap | null;
  edit: Editable;
  previewUrl: string | null;
};

/**
 * Snapshot seluruh state yang bisa di-undo.
 *
 * Semua update di store bersifat immutable (selalu membuat objek ImageEntry baru),
 * sehingga menyimpan referensi array lama sudah cukup sebagai snapshot lengkap:
 * objek lama tidak pernah dimutasi. Biaya memori satu snapshot hanya daftar
 * referensi, bukan salinan bitmap.
 *
 * Dengan desain ini SEMUA aksi bisa di-undo: perubahan pengaturan, ganti rasio,
 * latar, penyesuaian, bingkai, ganti nama, hapus foto, sampai hasil pemrosesan
 * gambar (hapus latar AI, auto levels, auto warna, kembalikan foto asli).
 */
type Snapshot = {
  images: ImageEntry[];
  activeId: string | null;
  label: string;
};

const HISTORY_LIMIT = 60;

type Store = {
  images: ImageEntry[];
  activeId: string | null;
  /** Riwayat langkah sebelumnya (paling baru di akhir). */
  past: Snapshot[];
  /** Riwayat langkah yang dibatalkan (paling baru di awal). */
  future: Snapshot[];
  /** Label langkah berikutnya yang akan di-undo (untuk tooltip). */
  lastLabel: string | null;

  format: "png" | "jpeg" | "webp";
  quality: number;
  scaleMode: "preset" | "1x" | "2x" | "3x" | "custom";
  customW: number;
  customH: number;
  lockRatio: boolean;
  showGuides: boolean;
  storageAvailable: boolean;
  compare: boolean;
  pendingBackground: Background | null;
  qualityModel: "fast" | "balanced" | "best";
  refineStrength: "off" | "light" | "strong";

  addImages: (files: File[]) => Promise<string[]>;
  setActive: (id: string) => void;
  renameImage: (id: string, name: string) => void;

  setEdit: (patch: Partial<Editable>, commit?: boolean) => void;
  setTransform: (t: Partial<Transform>, commit?: boolean) => void;
  /** Terapkan preset rasio. presetId menyimpan preset mana yang dipilih agar penanda aktif tidak ambigu. */
  setRatio: (w: number, h: number, presetId?: string | null) => void;
  setFit: (fit: Fit) => void;
  setBackground: (bg: Background, commit?: boolean) => void;
  setAdjust: (patch: Partial<Adjust>, commit?: boolean) => void;
  resetAdjust: () => void;
  setFrame: (patch: Partial<FrameStyle>, commit?: boolean) => void;
  resetFrame: () => void;

  rotate: (deg: number) => void;
  flip: (axis: "x" | "y") => void;
  reset: () => void;
  resetAll: () => void;

  undo: () => void;
  redo: () => void;
  /** Catat snapshot SEBELUM perubahan yang akan datang (untuk drag/slider). */
  pushHistoryNow: (label?: string) => void;

  toggleLockRatio: () => void;
  setStorageAvailable: (ok: boolean) => void;
  setQualityModel: (m: Store["qualityModel"]) => void;
  setRefineStrength: (v: Store["refineStrength"]) => void;
  setFormat: (f: "png" | "jpeg" | "webp") => void;
  setQuality: (q: number) => void;
  setScaleMode: (m: Store["scaleMode"]) => void;
  setCustomSize: (w: number, h: number) => void;
  toggleGuides: () => void;
  toggleCompare: () => void;
  setPendingBackground: (bg: Background | null) => void;

  removeImage: (id: string) => { entry: ImageEntry; index: number } | null;
  restoreImage: (entry: ImageEntry, index: number) => void;

  setCutout: (
    id: string,
    cutout: Blob,
    opts?: { fit?: Fit; background?: Background; keepTransform?: boolean; label?: string },
  ) => Promise<boolean>;
  restoreOriginal: () => Promise<boolean>;
  /** Terapkan hasil koreksi tonal (Auto Levels / Auto Warna) ke blob foto. */
  applyBitmapEdit: (id: string, blob: Blob, label: string) => Promise<boolean>;
  /** Perjelas detail foto (penajaman + clarity) tanpa mengubah warna. */
  enhancePhoto: (id: string, opts: { sharpen: number; clarity: number; denoise: number; radius: number }) => Promise<boolean>;
  runRemoveBackground: (id: string, onProgress?: (label: string, pct: number | null) => void) => Promise<boolean>;
  applyToAll: () => void;
};

const settings = typeof window !== "undefined" ? loadSettings() : {};

function storageOk(): boolean {
  return typeof window !== "undefined" ? isStorageAvailable() : true;
}

/** Ambil snapshot dari state saat ini. */
function capture(s: { images: ImageEntry[]; activeId: string | null }, label: string): Snapshot {
  return { images: s.images, activeId: s.activeId, label };
}

/** Tambahkan snapshot ke riwayat, buang yang paling lama bila melewati batas. */
function withPast(s: Store, label: string): { past: Snapshot[]; future: Snapshot[] } {
  const past = [...s.past, capture(s, label)];
  if (past.length > HISTORY_LIMIT) {
    const trimmed = past.slice(0, past.length - HISTORY_LIMIT);
    // Blob dari langkah yang keluar dari riwayat tidak diperlukan lagi.
    // Pembersihan dijadwalkan agar tidak memblokir aksi utama.
    const live = new Set<string>();
    for (const e of s.images) live.add(e.blobId);
    for (const snap of past) for (const e of snap.images) live.add(e.blobId);
    const dead = new Set<string>();
    for (const snap of trimmed) {
      for (const e of snap.images) if (!live.has(e.blobId)) dead.add(e.blobId);
    }
    if (dead.size > 0) void pruneBlobs([...dead]);
    return { past: past.slice(-HISTORY_LIMIT), future: [] };
  }
  return { past, future: [] };
}

/** Hapus blob yang sudah tidak direferensikan riwayat maupun state aktif. */
async function pruneBlobs(ids: string[]): Promise<void> {
  try {
    const { deleteBlob } = await import("../lib/storage");
    for (const id of ids) await deleteBlob(id).catch(() => {});
  } catch {
    /* pembersihan bersifat opsional */
  }
}

export const useEditor = create<Store>((set, get) => ({
  images: [],
  activeId: null,
  past: [],
  future: [],
  lastLabel: null,
  format: (settings.format as Store["format"]) ?? "png",
  quality: settings.quality ?? 90,
  scaleMode: "preset",
  customW: 1080,
  customH: 1350,
  lockRatio: true,
  showGuides: false,
  storageAvailable: storageOk(),
  compare: false,
  pendingBackground: null,
  qualityModel: "balanced",
  refineStrength: "light",

  // ---------- Unggah ----------

  addImages: async (files) => {
    const accepted = files.filter((f) => f.size <= 40 * 1024 * 1024);
    const entries: ImageEntry[] = [];
    for (const f of accepted.slice(0, 50 - get().images.length)) {
      try {
        // Simpan versi pratinjau berukuran terbatas agar drag tetap mulus pada foto besar.
        // Blob sumber tetap utuh sehingga ekspor memakai resolusi penuh.
        const { decodePreview } = await import("../lib/bitmap");
        const bitmap = await decodePreview(f);
        const id = crypto.randomUUID();
        const blobId = crypto.randomUUID();
        const { saveBlob } = await import("../lib/storage");
        await saveBlob(blobId, f);
        entries.push({
          id,
          name: f.name.replace(/\.[^.]+$/, ""),
          blobId,
          originalBlobId: null,
          bitmap,
          previewUrl: URL.createObjectURL(f),
          edit: {
            ratioW: 4,
            ratioH: 5,
            presetId: null,
            fit: "fill",
            transform: { ...DEFAULT_TRANSFORM },
            background: { kind: "solid", color: "#FFFFFF" },
            adjust: { ...DEFAULT_ADJUST },
            frame: { ...DEFAULT_FRAME },
          },
        });
      } catch {
        const { toastError } = await import("../lib/toast");
        toastError(`${f.name} tidak bisa dibuka. Formatnya belum didukung.`);
      }
    }
    if (entries.length > 0) {
      set((s) => ({
        ...withPast(s, entries.length > 1 ? `Tambah ${entries.length} foto` : "Tambah foto"),
        images: [...s.images, ...entries],
        activeId: s.activeId ?? entries[0].id,
      }));
    }
    return entries.map((e) => e.id);
  },

  setActive: (id) => set({ activeId: id }),

  /** Ganti nama foto aktif. Bisa di-undo seperti perubahan lain. */
  renameImage: (id, name) =>
    set((s) => ({
      ...withPast(s, "Ubah nama"),
      images: s.images.map((e) => (e.id === id ? { ...e, name } : e)),
    })),

  // ---------- Riwayat ----------

  pushHistoryNow: (label = "Ubah") =>
    set((s) => ({ ...withPast(s, label), lastLabel: label })),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s;
      const prev = s.past[s.past.length - 1];
      return {
        images: prev.images,
        activeId: prev.activeId,
        past: s.past.slice(0, -1),
        future: [capture(s, prev.label), ...s.future].slice(0, HISTORY_LIMIT),
        lastLabel: prev.label,
      };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      return {
        images: next.images,
        activeId: next.activeId,
        past: [...s.past, capture(s, next.label)].slice(-HISTORY_LIMIT),
        future: s.future.slice(1),
        lastLabel: next.label,
      };
    }),
  // ---------- Perubahan pengaturan ----------

  setEdit: (patch, commit = true) =>
    set((s) => ({
      ...(commit ? withPast(s, "Ubah pengaturan") : {}),
      images: s.images.map((e) => (e.id === s.activeId ? { ...e, edit: { ...e.edit, ...patch } } : e)),
    })),

  setTransform: (t, commit = true) =>
    set((s) => ({
      ...(commit ? withPast(s, "Geser atau zoom") : {}),
      images: s.images.map((e) => {
        if (e.id !== s.activeId) return e;
        const merged = { ...e.edit.transform, ...t };
        // ratioW/ratioH dipakai sebagai dimensi frame virtual: clampTransform hanya
        // butuh rasio, dan padding dihitung dari sisi terpendek secara konsisten.
        const clamped = e.bitmap
          ? clampTransform(
              merged,
              e.edit.fit,
              e.bitmap.width,
              e.bitmap.height,
              e.edit.ratioW,
              e.edit.ratioH,
              (e.edit.frame?.padding ?? 0) / 100,
            )
          : merged;
        return { ...e, edit: { ...e.edit, transform: clamped } };
      }),
    })),

  setRatio: (w, h, presetId = null) => get().setEdit({ ratioW: w, ratioH: h, presetId }),
  setFit: (fit) => get().setEdit({ fit }),
  setBackground: (bg, commit = true) => get().setEdit({ background: bg }, commit),

  setAdjust: (patch, commit = true) =>
    set((s) => ({
      ...(commit ? withPast(s, "Ubah penyesuaian") : {}),
      images: s.images.map((e) =>
        e.id === s.activeId ? { ...e, edit: { ...e.edit, adjust: { ...e.edit.adjust, ...patch } } } : e,
      ),
    })),

  resetAdjust: () => get().setEdit({ adjust: { ...DEFAULT_ADJUST } }),

  setFrame: (patch, commit = true) =>
    set((s) => ({
      ...(commit ? withPast(s, "Ubah bingkai") : {}),
      images: s.images.map((e) =>
        e.id === s.activeId
          ? { ...e, edit: { ...e.edit, frame: { ...(e.edit.frame ?? DEFAULT_FRAME), ...patch } } }
          : e,
      ),
    })),

  resetFrame: () => get().setEdit({ frame: { ...DEFAULT_FRAME } }),

  rotate: (deg) => {
    const e = get().images.find((x) => x.id === get().activeId);
    if (!e) return;
    const next = (e.edit.transform.rotation + deg + 540) % 360 - 180;
    get().setTransform({ rotation: next });
  },

  flip: (axis) => {
    const e = get().images.find((x) => x.id === get().activeId);
    if (!e) return;
    get().setTransform(axis === "x" ? { flipX: !e.edit.transform.flipX } : { flipY: !e.edit.transform.flipY });
  },

  reset: () =>
    set((s) => ({
      ...withPast(s, "Atur ulang transformasi"),
      images: s.images.map((e) =>
        e.id === s.activeId ? { ...e, edit: { ...e.edit, transform: { ...DEFAULT_TRANSFORM } } } : e,
      ),
    })),

  resetAll: () => set((s) => ({ ...withPast(s, "Tutup semua foto"), images: [], activeId: null })),

  // ---------- Pengaturan ekspor & tampilan (bukan bagian undo) ----------

  toggleLockRatio: () => set((s) => ({ lockRatio: !s.lockRatio })),
  setStorageAvailable: (ok) => set({ storageAvailable: ok }),
  setQualityModel: (m) => set({ qualityModel: m }),
  setRefineStrength: (v) => set({ refineStrength: v }),

  setFormat: (f) => {
    set({ format: f });
    saveSettings({ ...loadSettings(), format: f });
  },
  setQuality: (q) => {
    set({ quality: q });
    saveSettings({ ...loadSettings(), quality: q });
  },
  setScaleMode: (m) => set({ scaleMode: m }),
  setCustomSize: (w, h) => set({ customW: w, customH: h }),
  toggleGuides: () => set((s) => ({ showGuides: !s.showGuides })),
  toggleCompare: () => set((s) => ({ compare: !s.compare })),
  setPendingBackground: (bg) => set({ pendingBackground: bg }),

  // ---------- Kelola foto ----------

  removeImage: (id) => {
    const s = get();
    const index = s.images.findIndex((e) => e.id === id);
    if (index === -1) return null;
    const entry = s.images[index];
    const images = s.images.filter((e) => e.id !== id);
    set({
      ...withPast(s, "Hapus foto"),
      images,
      activeId: s.activeId === id ? (images[Math.min(index, images.length - 1)]?.id ?? null) : s.activeId,
    });
    return { entry, index };
  },

  restoreImage: (entry, index) =>
    set((s) => {
      if (s.images.some((e) => e.id === entry.id)) return s;
      const images = [...s.images];
      images.splice(Math.min(index, images.length), 0, entry);
      return { ...withPast(s, "Kembalikan foto"), images, activeId: s.activeId ?? entry.id };
    }),

  // ---------- Pemrosesan bitmap (bisa di-undo) ----------

  /**
   * Ganti blob foto dengan hasil baru (cutout AI, koreksi tonal).
   *
   * Blob baru disimpan pada kunci BARU sehingga blob lama tetap ada di
   * penyimpanan; ini yang membuat undo bisa mengembalikan gambar sebelumnya
   * tanpa perlu menyimpan salinan tambahan.
   */
  applyBitmapEdit: async (id, blob, label) => {
    const s = get();
    const e = s.images.find((x) => x.id === id);
    if (!e) return false;
    const { saveBlob } = await import("../lib/storage");
    const newBlobId = crypto.randomUUID();
    const saved = await saveBlob(newBlobId, blob);
    if (!saved) return false;
    const { decodePreview } = await import("../lib/bitmap");
    const bitmap = await decodePreview(blob);
    set((st) => ({
      ...withPast(st, label),
      images: st.images.map((x) => (x.id === id ? { ...x, bitmap, blobId: newBlobId } : x)),
    }));
    return true;
  },

  /**
   * Perjelas detail foto: penajaman tepi + clarity + denoise ringan.
   *
   * Berguna setelah penggantian latar atau pemrosesan ulang yang menurunkan
   * ketajaman. Warna tidak diubah karena semua operasi bekerja pada luminance.
   * Bisa di-undo seperti perubahan lain.
   */
  enhancePhoto: async (id, opts) => {
    const s = get();
    const e = s.images.find((x) => x.id === id);
    if (!e) return false;
    const { loadBlob, saveBlob } = await import("../lib/storage");
    const source = await loadBlob(e.blobId);
    if (!source) return false;
    const { enhanceBlob } = await import("../lib/enhance");
    const enhanced = await enhanceBlob(source, opts);
    const newBlobId = crypto.randomUUID();
    const saved = await saveBlob(newBlobId, enhanced);
    if (!saved) return false;
    const { decodePreview } = await import("../lib/bitmap");
    const bitmap = await decodePreview(enhanced);
    set((st) => ({
      ...withPast(st, "Perjelas detail"),
      images: st.images.map((x) => (x.id === id ? { ...x, bitmap, blobId: newBlobId } : x)),
    }));
    return true;
  },

  setCutout: async (id, cutout, opts) => {
    const s = get();
    const e = s.images.find((x) => x.id === id);
    if (!e) return false;
    const { loadBlob, saveBlob } = await import("../lib/storage");

    // Simpan blob asli sekali agar tombol "Foto Asli" selalu bisa dipakai.
    let originalBlobId = e.originalBlobId;
    if (!originalBlobId) {
      const orig = await loadBlob(e.blobId);
      if (!orig) return false;
      originalBlobId = `orig-${crypto.randomUUID()}`;
      await saveBlob(originalBlobId, orig);
    }

    // Blob cutout disimpan pada kunci baru; blob sebelumnya tetap ada untuk undo.
    const newBlobId = crypto.randomUUID();
    const saved = await saveBlob(newBlobId, cutout);
    if (!saved) return false;
    const { decodePreview } = await import("../lib/bitmap");
    const bitmap = await decodePreview(cutout);

    const nextEdit: Editable = opts
      ? {
          ...e.edit,
          fit: opts.fit ?? e.edit.fit,
          transform: opts.keepTransform ? e.edit.transform : { ...DEFAULT_TRANSFORM },
          background: opts.background ?? e.edit.background,
        }
      : {
          ...e.edit,
          fit: "contain" as Fit,
          transform: { ...DEFAULT_TRANSFORM },
          background: { kind: "transparent" as const },
        };

    set((st) => ({
      ...withPast(st, opts?.label ?? "Pisahkan subjek"),
      images: st.images.map((x) =>
        x.id === id ? { ...x, bitmap, blobId: newBlobId, originalBlobId, edit: nextEdit } : x,
      ),
    }));
    return true;
  },

  restoreOriginal: async () => {
    const s = get();
    const e = s.images.find((x) => x.id === s.activeId);
    if (!e?.originalBlobId) return false;
    const { loadBlob } = await import("../lib/storage");
    const orig = await loadBlob(e.originalBlobId);
    if (!orig) return false;
    // Simpan sebagai blob baru juga, supaya undo tetap bisa kembali ke hasil edit.
    const { saveBlob } = await import("../lib/storage");
    const newBlobId = crypto.randomUUID();
    const saved = await saveBlob(newBlobId, orig);
    if (!saved) return false;
    const { decodePreview } = await import("../lib/bitmap");
    const bitmap = await decodePreview(orig);
    set((st) => ({
      ...withPast(st, "Kembalikan foto asli"),
      images: st.images.map((x) => (x.id === e.id ? { ...x, bitmap, blobId: newBlobId, originalBlobId: null } : x)),
    }));
    return true;
  },

  /** Pisahkan subjek (AI). Bisa di-undo seperti perubahan lain. */
  runRemoveBackground: async (id, onProgress) => {
    const s = get();
    const e = s.images.find((x) => x.id === id);
    if (!e) return false;
    try {
      const { loadBlob } = await import("../lib/storage");
      const source = await loadBlob(e.blobId);
      if (!source) return false;
      // Inferensi berjalan di Web Worker sehingga UI tetap responsif (tidak freeze).
      const { separateSubject } = await import("../lib/separate");
      const cutout = await separateSubject(source, s.qualityModel, s.refineStrength, (label, pct) => {
        onProgress?.(label, pct);
      });

      const pending = get().pendingBackground;
      // Dengan latar tertunda: pertahankan framing foto, ganti latar di dalamnya.
      // Tanpa latar tertunda: perilaku bawaan (Muat + transparan).
      const ok = await get().setCutout(
        id,
        cutout,
        pending ? { fit: e.edit.fit, keepTransform: true, background: pending } : undefined,
      );
      if (!ok) return false;
      if (pending) get().setPendingBackground(null);
      return true;
    } catch {
      return false;
    }
  },

  applyToAll: () => {
    const s = get();
    const active = s.images.find((e) => e.id === s.activeId);
    if (!active) return;
    set((st) => ({
      ...withPast(st, "Samakan semua foto"),
      images: st.images.map((e) => {
        if (e.id === st.activeId) return e;
        let transform = { ...active.edit.transform };
        if (e.bitmap) {
          transform = clampTransform(
            transform,
            active.edit.fit,
            e.bitmap.width,
            e.bitmap.height,
            active.edit.ratioW,
            active.edit.ratioH,
            (active.edit.frame?.padding ?? 0) / 100,
          );
        }
        return { ...e, edit: { ...active.edit, transform } };
      }),
    }));
  },
}));

export function activeImage(s: Store): ImageEntry | undefined {
  return s.images.find((e) => e.id === s.activeId);
}

/** Apakah masih ada langkah yang bisa dibatalkan. */
export function canUndo(s: Store): boolean {
  return s.past.length > 0;
}

/** Apakah masih ada langkah yang bisa diulang. */
export function canRedo(s: Store): boolean {
  return s.future.length > 0;
}
