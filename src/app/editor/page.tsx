"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toastSuccess, toastError } from "../../lib/toast";
import { useEditor } from "../../store/editor";
import Canvas from "../../components/editor/Canvas";
import Inspector from "../../components/editor/Inspector";
import Filmstrip from "../../components/editor/Filmstrip";
import ExportDialog from "../../components/editor/ExportDialog";
import Dropzone from "../../components/editor/Dropzone";
import AddPhotosButton from "../../components/editor/AddPhotosButton";
import DeletePhotoButton from "../../components/editor/DeletePhotoButton";
import { loadBlob, loadProjects, saveProject, QUOTA_EVENT, deleteOldestProject } from "../../lib/storage";
import { DEFAULT_ADJUST, DEFAULT_TRANSFORM } from "../../lib/geometry";
import {
  Columns2,
  Copy,
  Download,
  Grid3x3,
  Minus,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  SlidersHorizontal,
  Undo2,
  X,
} from "lucide-react";

export default function EditorPage() {
  const images = useEditor((s) => s.images);
  const activeId = useEditor((s) => s.activeId);
  const addImages = useEditor((s) => s.addImages);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const reset = useEditor((s) => s.reset);
  const setTransform = useEditor((s) => s.setTransform);
  const toggleGuides = useEditor((s) => s.toggleGuides);
  const showGuides = useEditor((s) => s.showGuides);
  const compare = useEditor((s) => s.compare);
  const toggleCompare = useEditor((s) => s.toggleCompare);
  const setActive = useEditor((s) => s.setActive);
  const applyToAll = useEditor((s) => s.applyToAll);
  const renameImage = useEditor((s) => s.renameImage);
  const storageAvailable = useEditor((s) => s.storageAvailable);
  const pastCount = useEditor((s) => s.past.length);
  const futureCount = useEditor((s) => s.future.length);
  const lastLabel = useEditor((s) => s.lastLabel);
  const active = images.find((e) => e.id === activeId);
  const [exportOpen, setExportOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const raw = sessionStorage.getItem("pasfotoin:open");
    const clipRaw = sessionStorage.getItem("pasfotoin:clipboard");
    (async () => {
      try {
        if (useEditor.getState().images.length > 0) {
          sessionStorage.removeItem("pasfotoin:open");
          sessionStorage.removeItem("pasfotoin:clipboard");
          return;
        }
        // Tempelan dari beranda: muat blob-nya lebih dulu.
        if (clipRaw) {
          sessionStorage.removeItem("pasfotoin:clipboard");
          const clip = JSON.parse(clipRaw) as { blobId: string; name: string };
          const blob = await loadBlob(clip.blobId);
          if (blob) {
            const file = new File([blob], clip.name, { type: blob.type || "image/png" });
            await addImages([file]);
          }
          return;
        }
        const p = raw ? JSON.parse(raw) : loadProjects()[0];
        sessionStorage.removeItem("pasfotoin:open");
        if (!p) return;
        const blob = await loadBlob(p.sourceBlobId);
        if (!blob) return;
        const file = new File([blob], `${p.name}.png`, { type: blob.type || "image/png" });
        await addImages([file]);
        const s = useEditor.getState();
        const id = s.activeId;
        if (id) {
          useEditor.setState({
            images: s.images.map((e) =>
              e.id === id
                ? {
                    ...e,
                    name: p.name,
                    edit: {
                      ratioW: p.ratioW,
                      ratioH: p.ratioH,
                      presetId: p.presetId ?? null,
                      fit: p.fit,
                      transform: p.transform ?? DEFAULT_TRANSFORM,
                      background: p.background,
                      adjust: p.adjust ?? DEFAULT_ADJUST,
                    },
                    originalBlobId: p.originalBlobId ?? null,
                  }
                : e,
            ),
          });
        }
      } catch {
        /* abaikan */
      }
    })();
  }, [addImages]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length > 0) {
        e.preventDefault();
        addImages(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addImages]);

  useEffect(() => {
    const onQuota = () => {
      toastError("Penyimpanan browser penuh. Hapus proyek lama untuk melanjutkan menyimpan.", {
        action: {
          label: "Hapus proyek lama",
          onClick: async () => {
            const removed = await deleteOldestProject();
            toastSuccess(removed ? `"${removed.name}" dihapus dari penyimpanan.` : "Tidak ada proyek lama yang bisa dihapus.");
          },
        },
      });
    };
    window.addEventListener(QUOTA_EVENT, onQuota);
    return () => window.removeEventListener(QUOTA_EVENT, onQuota);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      const mod = e.ctrlKey || e.metaKey;
      const st = useEditor.getState();
      const cur = st.images.find((x) => x.id === st.activeId);
      if (!cur) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setExportOpen(true);
      } else if (e.key === "r" || e.key === "R") {
        st.rotate(90);
      } else if (e.key === "f" || e.key === "F") {
        st.flip("x");
      } else if (e.key === "0") {
        st.reset();
      } else if (e.key === "+" || e.key === "=") {
        st.setTransform({ scale: Math.min(5, cur.edit.transform.scale * 1.1) });
      } else if (e.key === "-") {
        const min = cur.edit.fit === "fill" ? 1 : 0.1;
        st.setTransform({ scale: Math.max(min, cur.edit.transform.scale / 1.1) });
      } else if (e.key === "g" || e.key === "G") {
        st.toggleGuides();
      } else if (e.key === "c" || e.key === "C") {
        st.toggleCompare();
      } else if (e.key === "[" || e.key === "]") {
        const idx = st.images.findIndex((x) => x.id === st.activeId);
        const next = e.key === "[" ? (idx - 1 + st.images.length) % st.images.length : (idx + 1) % st.images.length;
        setActive(st.images[next].id);
      } else if (e.key.startsWith("Arrow") && cur) {
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step / 500 : e.key === "ArrowRight" ? step / 500 : 0;
        const dy = e.key === "ArrowUp" ? -step / 500 : e.key === "ArrowDown" ? step / 500 : 0;
        e.preventDefault();
        st.setTransform({ x: cur.edit.transform.x + dx, y: cur.edit.transform.y + dy });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setActive]);

  useEffect(() => {
    if (!active) return;
    const snapshot = {
      id: active.id,
      name: active.name,
      sourceBlobId: active.blobId,
      originalBlobId: active.originalBlobId ?? null,
      ratioW: active.edit.ratioW,
      ratioH: active.edit.ratioH,
      presetId: active.edit.presetId,
      fit: active.edit.fit,
      transform: active.edit.transform,
      background: active.edit.background,
      adjust: active.edit.adjust,
      frame: active.edit.frame,
      updatedAt: Date.now(),
    };
    const persist = async () => {
      await saveProject({ ...snapshot, updatedAt: Date.now() }, null);
      // Buat thumbnail dari blob foto agar daftar "Proyek terakhir" menampilkan
      // pratinjau nyata. Dibuat sekali per penyimpanan dan ukurannya kecil.
      if (active.bitmap) {
        const { loadBlob, makeThumbnail, saveThumbnail } = await import("../../lib/storage");
        const src = await loadBlob(active.blobId);
        if (src) {
          const thumb = await makeThumbnail(src);
          if (thumb) await saveThumbnail(active.id, thumb);
        }
      }
    };
    const t = setTimeout(() => void persist(), 800);
    const flush = () => void persist();
    window.addEventListener("pagehide", flush);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pagehide", flush);
    };
  }, [active?.edit, active?.name, active]);

  const scalePct = active ? Math.round(active.edit.transform.scale * 100) : 100;

  /**
   * Ganti nama foto. Menyimpan satu langkah riwayat per penyuntingan (saat blur
   * atau Enter), bukan per ketikan, agar undo tidak dipenuhi langkah kecil.
   */
  function renameActive(name: string) {
    if (!active || name === active.name) return;
    renameImage(active.id, name);
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="relative z-20 flex h-14 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 shadow-sm sm:px-4">
        <Link href="/" className="hidden shrink-0 items-center gap-2 sm:flex" aria-label="PasFotoIn">
          <span className="text-sm font-semibold tracking-tight text-gray-900">PasFotoIn</span>
          <span className="inline-block h-2 w-2 rounded-full bg-primary-600" aria-hidden />
        </Link>
        <span className="hidden h-4 w-px shrink-0 bg-gray-200 sm:block" aria-hidden />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {active ? (
            <div className="flex min-w-0 shrink items-center gap-1.5 rounded-md bg-gray-50 px-2 py-1 transition-colors hover:bg-gray-100 focus-within:bg-white focus-within:ring-1 focus-within:ring-primary-600/40">
              <input
                type="text"
                defaultValue={active.name}
                key={active.id}
                onBlur={(e) => renameActive(e.target.value.trim() || active.name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") {
                    (e.target as HTMLInputElement).value = active.name;
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                aria-label="Nama proyek"
                className="w-20 min-w-[3rem] truncate bg-transparent text-[13px] font-medium text-gray-900 outline-none sm:w-48"
              />
              <Pencil size={14} strokeWidth={1.5} className="hidden shrink-0 text-gray-400 sm:block" aria-hidden />
            </div>
          ) : (
            <span className="text-sm text-gray-500">Editor</span>
          )}
          <span
            title={storageAvailable ? "Tersimpan otomatis di browser" : "Penyimpanan lokal tidak tersedia"}
            className="flex min-w-0 shrink items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-gray-500"
          >
            {storageAvailable ? (
              <>
                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden />
                <span className="hidden truncate lg:inline">Tersimpan otomatis di browser</span>
              </>
            ) : (
              <>
                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
                <span className="hidden truncate lg:inline">Penyimpanan lokal tidak tersedia</span>
              </>
            )}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
            <button
              type="button"
              onClick={undo}
              title={lastLabel ? `Undo: ${lastLabel} (Ctrl+Z)` : "Undo (Ctrl+Z)"}
              aria-label="Undo"
              className="btn-icon"
              disabled={pastCount === 0}
            >
              <Undo2 size={18} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={redo}
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
              className="btn-icon"
              disabled={futureCount === 0}
            >
              <Redo2 size={18} strokeWidth={1.5} />
            </button>
          </div>
          <span className="hidden h-4 w-px bg-gray-200 sm:block" aria-hidden />
          {active && <AddPhotosButton />}
          {active && <DeletePhotoButton id={active.id} name={active.name} variant="topbar" />}
          <span className="hidden h-4 w-px bg-gray-200 sm:block" aria-hidden />
          <button type="button" onClick={() => setExportOpen(true)} disabled={!active} className="btn-primary px-4!">
            <Download size={16} strokeWidth={1.5} />
            Ekspor
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          {images.length === 0 ? (
            <div className="flex flex-1 items-center justify-center bg-gray-100 p-6">
              <div className="w-full max-w-md">
                <Dropzone />
              </div>
            </div>
          ) : (
            <div className="relative flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1">
                <Canvas />
              </div>
              {active && (
                <div className="relative z-30 flex shrink-0 flex-wrap items-center gap-1 border-t border-gray-200 bg-white px-3 py-2 md:gap-2 md:px-4">
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-label="Zoom keluar"
                      title="Zoom keluar"
                      onClick={() =>
                        active &&
                        setTransform({
                          scale: Math.max(active.edit.fit === "fill" ? 1 : 0.1, active.edit.transform.scale / 1.1),
                        })
                      }
                      className="btn-icon h-7! w-7!"
                    >
                      <Minus size={16} strokeWidth={1.5} />
                    </button>
                    <span className="code-label w-11 shrink-0 text-center tabular">{scalePct}%</span>
                    <button
                      type="button"
                      aria-label="Zoom masuk"
                      title="Zoom masuk"
                      onClick={() => active && setTransform({ scale: Math.min(5, active.edit.transform.scale * 1.1) })}
                      className="btn-icon h-7! w-7!"
                    >
                      <Plus size={16} strokeWidth={1.5} />
                    </button>
                  </div>
                  <span className="h-4 w-px bg-gray-200" aria-hidden />
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={toggleGuides} title="Panduan (G)" aria-pressed={showGuides} className="btn-ghost">
                      <Grid3x3 size={14} strokeWidth={1.5} />
                      Panduan
                    </button>
                    <button
                      type="button"
                      onClick={toggleCompare}
                      title="Bandingkan sebelum/sesudah (C)"
                      aria-pressed={compare}
                      className="btn-ghost"
                    >
                      <Columns2 size={14} strokeWidth={1.5} />
                      Bandingkan
                    </button>
                    <button type="button" onClick={reset} title="Reset transformasi (0)" className="btn-ghost">
                      <RotateCcw size={14} strokeWidth={1.5} />
                      Atur ulang
                    </button>
                  </div>
                  {images.length > 1 && (
                    <>
                      <span className="h-4 w-px bg-gray-200" aria-hidden />
                      <button
                        type="button"
                        onClick={() => {
                          applyToAll();
                          toastSuccess(`Pengaturan foto ini diterapkan ke ${images.length - 1} foto lain.`);
                        }}
                        title="Samakan rasio, posisi, dan latar ke semua foto"
                        className="btn-ghost"
                      >
                        <Copy size={14} strokeWidth={1.5} />
                        Samakan semua
                      </button>
                    </>
                  )}
                  <div className="ml-auto lg:hidden">
                    <button type="button" onClick={() => setSheetOpen(true)} title="Buka pengaturan" className="btn-ghost">
                      <SlidersHorizontal size={14} strokeWidth={1.5} />
                      Pengaturan
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="hidden w-[320px] shrink-0 md:block">
          <Inspector />
        </div>
      </div>

      <Filmstrip />

      {sheetOpen && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end lg:hidden">
          <div className="absolute inset-0 bg-[rgba(16,24,40,0.4)]" onClick={() => setSheetOpen(false)} aria-hidden />
          <div className="relative z-10 flex h-[75vh] flex-col rounded-t-2xl bg-white shadow-lg">
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-10 rounded-full bg-gray-300" aria-hidden />
            </div>
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
              <span className="text-sm font-semibold text-gray-900">Pengaturan</span>
              <button type="button" onClick={() => setSheetOpen(false)} className="btn-ghost">
                <X size={16} strokeWidth={1.5} />
                Tutup
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Inspector />
            </div>
          </div>
        </div>
      )}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}
