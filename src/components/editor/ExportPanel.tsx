"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toastSuccess, toastError, toastInfo } from "../../lib/toast";
import { useEditor } from "../../store/editor";
import { RATIO_PRESETS, DPI_OPTIONS, presetPxAt } from "../../lib/presets";
import { download, exportBlob, formatBytes, previewAndEstimate, targetSize } from "../../lib/export";
import { exportManyFast, exportOneFast } from "../../lib/export-batch";
import { loadBlob } from "../../lib/storage";
import { AlertTriangle, Archive, Clipboard, Copy, Download, Image as ImageIcon, Info, Link, Loader2, Unlink } from "lucide-react";

export default function ExportPanel({ compact = false }: { compact?: boolean }) {
  const image = useEditor((s) => s.images.find((e) => e.id === s.activeId));
  const images = useEditor((s) => s.images);
  const format = useEditor((s) => s.format);
  const quality = useEditor((s) => s.quality);
  const scaleMode = useEditor((s) => s.scaleMode);
  const customW = useEditor((s) => s.customW);
  const customH = useEditor((s) => s.customH);
  const setFormat = useEditor((s) => s.setFormat);
  const setQuality = useEditor((s) => s.setQuality);
  const setScaleMode = useEditor((s) => s.setScaleMode);
  const setCustomSize = useEditor((s) => s.setCustomSize);
  const applyToAll = useEditor((s) => s.applyToAll);
  const lockRatio = useEditor((s) => s.lockRatio);
  const toggleLockRatio = useEditor((s) => s.toggleLockRatio);

  const [filename, setFilename] = useState("");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dpi, setDpi] = useState(300);
  const cancelRef = useRef(false);

  const preset = useMemo(() => {
    if (!image) return undefined;
    return RATIO_PRESETS.find((p) => p.w === image.edit.ratioW && p.h === image.edit.ratioH && (p.px || p.mm));
  }, [image]);

  // Untuk preset dokumen dengan ukuran mm, hitung piksel dari DPI yang dipilih.
  // Ini penting: 300 dpi untuk cetak, 600 dpi untuk portal digital (ICAO 9303).
  const presetPx = useMemo(() => {
    if (!preset) return null;
    if (preset.mm) return presetPxAt(preset, dpi);
    return preset.px ?? null;
  }, [preset, dpi]);

  const hasMm = Boolean(preset?.mm);

  const sizeRaw = image ? targetSize(image.edit.ratioW, image.edit.ratioH, presetPx, scaleMode, customW, customH) : null;
  const sizeError = sizeRaw && "error" in sizeRaw ? sizeRaw.error : null;
  const size = sizeRaw && "w" in sizeRaw ? sizeRaw : null;
  const ext = format === "jpeg" ? "jpg" : format;

  useEffect(() => {
    // Hasil render async dari foto aktif, satu kali per perubahan input ekspor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilename(`${image?.name ?? ""}-${image?.edit.ratioW ?? 0}x${image?.edit.ratioH ?? 0}`);
  }, [image?.id, image?.name, image?.edit.ratioW, image?.edit.ratioH]);

  useEffect(() => {
    let alive = true;
    if (!image || !size) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEstimate(null);
      setPreview(null);
      return;
    }
    // Debounce: slider kualitas memicu perubahan cepat; tunggu berhenti dulu agar
    // tidak merender berulang kali dan membuat UI tersendat.
    const timer = setTimeout(async () => {
      const source = await loadBlob(image.blobId);
      if (!source || !alive) return;
      const project = {
        id: image.id,
        name: image.name,
        sourceBlobId: image.blobId,
        ratioW: image.edit.ratioW,
        ratioH: image.edit.ratioH,
        presetId: image.edit.presetId,
        fit: image.edit.fit,
        transform: image.edit.transform,
        background: image.edit.background,
        adjust: image.edit.adjust,
        frame: image.edit.frame,
        updatedAt: Date.now(),
      };
      const bgBlob = image.edit.background.kind === "image" ? (await loadBlob(image.edit.background.blobId)) ?? null : null;
      // Satu kali decode + render untuk pratinjau dan perkiraan ukuran sekaligus.
      const result = await previewAndEstimate(project, source, bgBlob, size!.w, size!.h, format, quality);
      if (alive && result) {
        setEstimate(result.estimate);
        setPreview(result.dataUrl);
      }
    }, 220);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // size dipakai lewat dimensinya agar efek tidak berputar pada identitas objek baru.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, image?.edit, size?.w, size?.h, format, quality]);

  if (!image || !size) {
    return <p className="p-4 text-sm text-gray-500">Pilih foto dulu untuk mengatur ekspor.</p>;
  }

  async function currentProject() {
    return {
      id: image!.id,
      name: image!.name,
      sourceBlobId: image!.blobId,
      ratioW: image!.edit.ratioW,
      ratioH: image!.edit.ratioH,
      fit: image!.edit.fit,
      transform: image!.edit.transform,
      background: image!.edit.background,
      adjust: image!.edit.adjust,
      updatedAt: Date.now(),
    };
  }

  async function onExport() {
    if (sizeError || !image) return;
    setBusy(true);
    try {
      const source = await loadBlob(image.blobId);
      if (!source) {
        toastError("Foto sumber tidak ditemukan di penyimpanan lokal.");
        return;
      }
      const bgBlob = image.edit.background.kind === "image" ? (await loadBlob(image.edit.background.blobId)) ?? null : null;
      const project = await currentProject();
      // Coba lewat Web Worker dulu agar UI tidak freeze pada ekspor besar.
      const fast = await exportOneFast(project, source, bgBlob, size!.w, size!.h, format, quality);
      const blob = fast ?? (await exportBlob(project, source, bgBlob, size!.w, size!.h, format, quality));
      if (!blob) {
        toastError("Ekspor gagal. Coba ukuran yang lebih kecil.");
        return;
      }
      download(blob, `${filename}.${ext}`);
      toastSuccess(`Siap diunduh. ${size!.w} x ${size!.h}, ${format.toUpperCase()}, sekitar ${formatBytes(blob.size)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    if (!image) return;
    try {
      const source = await loadBlob(image.blobId);
      if (!source) return;
      const blob = await exportBlob(await currentProject(), source, null, size!.w, size!.h, "png", 100);
      if (!blob || typeof ClipboardItem === "undefined") {
        toastError("Browser ini belum mendukung salin gambar ke clipboard.");
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toastSuccess("Disalin ke clipboard sebagai PNG.");
    } catch {
      toastError("Tidak bisa menyalin ke clipboard.");
    }
  }

  async function onExportZip() {
    if (sizeError) return;
    cancelRef.current = false;
    setBusy(true);
    try {
      const items = [];
      for (const e of images) {
        const source = await loadBlob(e.blobId);
        if (!source) continue;
        const bgBlob = e.edit.background.kind === "image" ? (await loadBlob(e.edit.background.blobId)) ?? null : null;
        items.push({
          project: {
            id: e.id,
            name: e.name,
            sourceBlobId: e.blobId,
            ratioW: e.edit.ratioW,
            ratioH: e.edit.ratioH,
            presetId: e.edit.presetId,
            fit: e.edit.fit,
            transform: e.edit.transform,
            background: e.edit.background,
            adjust: e.edit.adjust,
            frame: e.edit.frame,
            updatedAt: Date.now(),
          },
          source,
          bgBlob,
        });
      }
      const blob = await exportManyFast(items, size!.w, size!.h, format, quality, (done, total) => setProgress({ done, total }), () => cancelRef.current);
      if (!blob) {
        toastInfo("Ekspor batch dibatalkan.");
        return;
      }
      download(blob, `pasfotoin-${images.length}-foto.zip`);
      toastSuccess(`${images.length} foto diekspor. ZIP ${formatBytes(blob.size)}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className={compact ? "space-y-5 p-4" : "space-y-5"}>
      {/* 1. Pratinjau hasil + estimasi */}
      {preview ? (
        <div className="well flex items-center gap-4 border-gray-200 p-3">
          <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-100 shadow-xs">
            {/* Pratinjau data-URL dari kanvas, tidak bisa dioptimasi next/image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Pratinjau ekspor" className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-black/40 py-0.5 text-center text-[9px] text-white">
              <span className="code-label text-white">
                {image.edit.ratioW}×{image.edit.ratioH}
              </span>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="section-title truncate">Pratinjau Output</span>
              <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                Standar 300 DPI
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="code-label tabular font-medium text-gray-900">
                {size.w} × {size.h} px
              </span>
              <span className="text-gray-300">·</span>
              <span className="code-label tabular">{estimate ? `sekitar ${formatBytes(estimate)} (perkiraan)` : "menghitung ukuran…"}</span>
            </div>
            <p className="truncate text-[11px] text-gray-400">Siap cetak ke kertas foto lab studio atau portal ijazah elektronik.</p>
          </div>
        </div>
      ) : (
        <div className="well flex items-center gap-3 border-gray-200 p-3">
          <Loader2 size={16} className="animate-spin text-primary-600" />
          <span className="text-xs text-gray-500">Menyiapkan pratinjau…</span>
        </div>
      )}

      {/* 2. Peringatan */}
      {sizeError && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-surface p-3 text-xs text-warning">
          <AlertTriangle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
          {sizeError}
        </p>
      )}

      {image.edit.background.kind === "transparent" && format === "jpeg" && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-surface p-3 text-xs text-warning">
          <AlertTriangle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
          JPEG tidak mendukung transparansi. Area kosong akan diisi putih. Gunakan PNG atau WebP untuk mempertahankannya.
        </p>
      )}

      {/* 3. Pengaturan berkas */}
      <div className="space-y-3">
        <span className="micro-label font-semibold uppercase tracking-wider">Pengaturan Berkas</span>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="micro-label" htmlFor="export-format">
              Format File
            </label>
            <select
              id="export-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as typeof format)}
              className="field h-9"
            >
              <option value="png">PNG (Kualitas Tertinggi)</option>
              <option value="jpeg">JPEG (Optimal Berkas Kecil)</option>
              <option value="webp">WebP (Ringan &amp; Cepat)</option>
            </select>
          </div>
          {format !== "png" && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="micro-label" htmlFor="export-quality">
                  Kualitas Kompresi
                </label>
                <span className="code-label tabular font-semibold text-primary-600">{quality}%</span>
              </div>
              <input
                id="export-quality"
                type="range"
                min={40}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="range"
              />
            </div>
          )}
        </div>
      </div>

      {/* 4. Skala & dimensi */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="micro-label font-semibold uppercase tracking-wider">Skala &amp; Dimensi</span>
          <span className="micro-label">
            Rasio Asli {image.edit.ratioW}:{image.edit.ratioH}
          </span>
        </div>

        {/* Pemilih DPI: hanya untuk preset dokumen dengan ukuran mm. */}
        {hasMm && preset && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="micro-label">Resolusi Cetak</span>
              <span className="code-label tabular">
                {preset.mm![0]}×{preset.mm![1]} mm
              </span>
            </div>
            <div className="seg">
              {DPI_OPTIONS.map((d) => (
                <button
                  key={d.dpi}
                  type="button"
                  onClick={() => setDpi(d.dpi)}
                  aria-pressed={dpi === d.dpi}
                  title={d.hint}
                  className="seg-item"
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] leading-4 text-gray-400">
              {dpi === 300
                ? "300 DPI: standar cetak studio foto."
                : "600 DPI: minimum portal digital sesuai ICAO Doc 9303."}
            </p>
          </div>
        )}

        <div className="seg">
          {(["preset", "1x", "2x", "3x", "custom"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setScaleMode(m)}
              aria-pressed={scaleMode === m}
              className="seg-item"
            >
              {m === "preset" ? "Preset" : m === "custom" ? "Kustom" : m}
            </button>
          ))}
        </div>
        {scaleMode === "custom" && (
          <div className="well flex flex-wrap items-end gap-3 p-3">
            <div className="flex min-w-[100px] flex-1 flex-col gap-1">
              <label className="micro-label" htmlFor="custom-w">
                Lebar (W)
              </label>
              <div className="relative">
                <input
                  id="custom-w"
                  aria-label="Lebar piksel"
                  type="number"
                  value={customW}
                  onChange={(e) => {
                    const w = Number(e.target.value);
                    if (lockRatio && image) setCustomSize(w, Math.max(1, Math.round((w * image.edit.ratioH) / image.edit.ratioW)));
                    else setCustomSize(w, customH);
                  }}
                  className="field tabular h-8 pr-7 font-mono text-xs"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase text-gray-400">px</span>
              </div>
            </div>
            <span className="code-label pb-2">×</span>
            <div className="flex min-w-[100px] flex-1 flex-col gap-1">
              <label className="micro-label" htmlFor="custom-h">
                Tinggi (H)
              </label>
              <div className="relative">
                <input
                  id="custom-h"
                  aria-label="Tinggi piksel"
                  type="number"
                  value={customH}
                  onChange={(e) => {
                    const h = Number(e.target.value);
                    if (lockRatio && image) setCustomSize(Math.max(1, Math.round((h * image.edit.ratioW) / image.edit.ratioH)), h);
                    else setCustomSize(customW, h);
                  }}
                  className="field tabular h-8 pr-7 font-mono text-xs"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase text-gray-400">px</span>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleLockRatio}
              aria-pressed={lockRatio}
              title={lockRatio ? "Rasio terkunci" : "Rasio bebas"}
              className={`btn-secondary mb-0.5 h-8! px-2.5! text-[11px]! ${lockRatio ? "border-primary-200! bg-primary-50! text-primary-700!" : ""}`}
            >
              {lockRatio ? <Link size={13} strokeWidth={1.5} /> : <Unlink size={13} strokeWidth={1.5} />}
              {lockRatio ? "Terkunci" : "Bebas"}
            </button>
          </div>
        )}
      </div>

      {/* 5. Nama file */}
      <div className="flex flex-col gap-1.5">
        <label className="micro-label" htmlFor="export-name">
          Nama File Unduhan
        </label>
        <div className="flex items-center overflow-hidden rounded-lg border border-gray-200 bg-white focus-within:border-primary-600">
          <span className="flex items-center pl-3 pr-1 text-gray-400">
            <ImageIcon size={15} strokeWidth={1.5} aria-hidden />
          </span>
          <input
            id="export-name"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className="h-9 w-full px-2 text-[13px] text-gray-900 outline-none"
          />
          <span className="code-label border-l border-gray-200 bg-gray-50 px-3 py-2.5">.{ext}</span>
        </div>
      </div>

      {/* 6. Batch */}
      {images.length > 1 && (
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-25 p-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                applyToAll();
                toastSuccess(`Pengaturan foto ini diterapkan ke ${images.length - 1} foto lain.`);
              }}
              className="btn-secondary h-8! px-2.5! text-[11px]!"
            >
              <Copy size={13} strokeWidth={1.5} />
              Terapkan ke {images.length - 1} foto lain
            </button>
            <span className="code-label shrink-0">Total {images.length} Foto</span>
          </div>
          {progress ? (
            <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs text-gray-900">
                  <Loader2 size={13} className="animate-spin text-primary-600" />
                  <span className="font-medium tabular">
                    Mengekspor {progress.done} dari {progress.total} foto…
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => (cancelRef.current = true)}
                  className="text-xs font-medium text-danger hover:underline"
                >
                  Batalkan
                </button>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-primary-600 transition-[width]"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-400">
                <span>Format bundle: ZIP terkompresi otomatis</span>
                <span className="code-label tabular">{Math.round((progress.done / progress.total) * 100)}% selesai</span>
              </div>
            </div>
          ) : (
            <button type="button" disabled={busy} onClick={onExportZip} className="btn-secondary w-full">
              <Archive size={15} strokeWidth={1.5} />
              Ekspor {images.length} foto sebagai ZIP
            </button>
          )}
        </div>
      )}

      {/* 7. Aksi */}
      <div className="space-y-2">
        <button type="button" disabled={!!sizeError || busy} onClick={onExport} className="btn-primary h-10! w-full! text-[13px]!">
          {busy && !progress ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} strokeWidth={1.5} />}
          Ekspor
        </button>
        <button type="button" disabled={!!sizeError || busy} onClick={onCopy} className="btn-secondary w-full">
          <Clipboard size={15} strokeWidth={1.5} />
          Salin sebagai PNG
        </button>
      </div>

      {/* 8. Catatan privasi */}
      <div className="flex items-start gap-2 rounded-lg bg-gray-50 p-3 text-gray-400">
        <Info size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
        <p className="text-[11px] leading-relaxed">
          Metadata EXIF dihapus otomatis untuk privasi data biometrik. Seluruh proses pemotongan dan kompresi foto berjalan langsung di
          peramban tanpa pernah diunggah ke server pihak ketiga.
        </p>
      </div>
    </div>
  );
}




