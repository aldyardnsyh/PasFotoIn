import { get, set, del, keys } from "idb-keyval";
import type { Project } from "./geometry";

const PREFIX = "pasfotoin:v1:";
const PROJECTS_KEY = `${PREFIX}projects`;
const SETTINGS_KEY = `${PREFIX}settings`;
const MAX_PROJECTS = 20;
const EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;

export type StoredSettings = {
  format?: string;
  quality?: number;
  scale?: number;
};

export function isStorageAvailable(): boolean {
  try {
    localStorage.setItem(`${PREFIX}probe`, "1");
    localStorage.removeItem(`${PREFIX}probe`);
    return true;
  } catch {
    return false;
  }
}

export const QUOTA_EVENT = "pasfotoin:quota";

/** true bila error berasal dari kuota penyimpanan yang penuh (localStorage atau IndexedDB). */
export function isQuotaError(e: unknown): boolean {
  if (!(e instanceof DOMException)) return false;
  return e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22;
}

/** Beri tahu UI (toast) tanpa menghentikan sesi. Dipakai saat blob proyek gagal disimpan. */
export function notifyQuota() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(QUOTA_EVENT));
}

export function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSettings(s: StoredSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* quota: abaikan, pengaturan kecil */
  }
}

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    const list: Project[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    return list.filter((p) => now - p.updatedAt < EXPIRY_MS).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function saveProject(p: Project, sourceBlob: Blob | null): Promise<boolean> {
  try {
    const list = loadProjects().filter((x) => x.id !== p.id);
    list.unshift(p);
    const trimmed = list.slice(0, MAX_PROJECTS);
    const removed = list.slice(MAX_PROJECTS);
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(trimmed));
    if (sourceBlob) await set(`${PREFIX}blob:${p.sourceBlobId}`, sourceBlob);
    for (const r of removed) {
      localStorage.removeItem(`${PREFIX}meta:${r.id}`);
      await del(`${PREFIX}blob:${r.sourceBlobId}`).catch(() => {});
      await deleteThumbnail(r.id);
    }
    return true;
  } catch (e) {
    if (isQuotaError(e)) notifyQuota();
    return false;
  }
}

export async function loadBlob(id: string): Promise<Blob | undefined> {
  try {
    return await get<Blob>(`${PREFIX}blob:${id}`);
  } catch {
    return undefined;
  }
}

/**
 * Simpan thumbnail proyek ke IndexedDB.
 *
 * Thumbnail terpisah dari foto sumber: ukurannya kecil (maks 240 px, JPEG kualitas
 * rendah) sehingga hemat kuota, tapi cukup untuk ditampilkan di daftar "Proyek terakhir".
 * Dipakai agar daftar riwayat menampilkan pratinjau nyata, bukan ikon kosong.
 */
export async function saveThumbnail(projectId: string, blob: Blob): Promise<boolean> {
  try {
    await set(`${PREFIX}thumb:${projectId}`, blob);
    return true;
  } catch {
    return false;
  }
}

/** Ambil thumbnail proyek. Mengembalikan undefined bila belum ada atau sudah dihapus. */
export async function loadThumbnail(projectId: string): Promise<Blob | undefined> {
  try {
    return await get<Blob>(`${PREFIX}thumb:${projectId}`);
  } catch {
    return undefined;
  }
}

/** Hapus thumbnail proyek (dipakai saat proyek dibuang dari daftar). */
export async function deleteThumbnail(projectId: string): Promise<void> {
  try {
    await del(`${PREFIX}thumb:${projectId}`);
  } catch {
    /* opsional */
  }
}

/**
 * Buat thumbnail kecil dari blob gambar.
 * Sisi terpanjang dibatasi 240 px dan dikodekan sebagai JPEG kualitas 0.72
 * agar ukurannya hanya beberapa kilobyte.
 */
export async function makeThumbnail(source: Blob, maxSide = 240): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, maxSide / longest);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas =
      typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    if (canvas instanceof OffscreenCanvas) {
      return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.72 });
    }
    return await new Promise<Blob | null>((resolve) =>
      (canvas as HTMLCanvasElement).toBlob(resolve, "image/jpeg", 0.72),
    );
  } catch {
    return null;
  }
}

export async function saveBlob(id: string, blob: Blob): Promise<boolean> {
  try {
    await set(`${PREFIX}blob:${id}`, blob);
    return true;
  } catch (e) {
    if (isQuotaError(e)) notifyQuota();
    return false;
  }
}

/** Hapus proyek paling lama (untuk tawaran saat penyimpanan penuh). */
export async function deleteOldestProject(): Promise<Project | null> {
  const list = loadProjects();
  if (list.length === 0) return null;
  const oldest = list[list.length - 1];
  try {
    const next = list.filter((p) => p.id !== oldest.id);
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
    await del(`${PREFIX}blob:${oldest.sourceBlobId}`).catch(() => {});
    if (oldest.originalBlobId) await del(`${PREFIX}blob:${oldest.originalBlobId}`).catch(() => {});
    await deleteThumbnail(oldest.id);
    return oldest;
  } catch {
    return null;
  }
}

export async function deleteBlob(id: string) {
  await del(`${PREFIX}blob:${id}`);
}

export async function clearAll() {
  try {
    localStorage.clear();
    const all = await keys();
    for (const k of all) {
      if (typeof k === "string" && k.startsWith(PREFIX)) await del(k);
    }
  } catch {
    /* abaikan */
  }
}
