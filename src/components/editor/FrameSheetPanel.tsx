"use client";

/**
 * Panel bingkai (padding + sudut membulat) dan cetak lembar A4.
 * Semua pengaturan tersimpan di proyek sehingga ikut ke ekspor.
 */
import { useMemo, useState } from "react";
import { toastSuccess, toastError } from "../../lib/toast";
import { Download, Frame, Loader2, RotateCcw } from "lucide-react";
import { useEditor } from "../../store/editor";
import { useSliderHistory } from "./useSliderHistory";
import { RATIO_PRESETS } from "../../lib/presets";
import { loadBlob } from "../../lib/storage";
import { download, formatBytes } from "../../lib/export";
import { A4_MM, sheetCapacity, renderSheetBlob } from "../../lib/sheet";

export default function FrameSheetPanel() {
  const image = useEditor((s) => s.images.find((e) => e.id === s.activeId));
  const setFrame = useEditor((s) => s.setFrame);
  const resetFrame = useEditor((s) => s.resetFrame);
  const pushHistoryNow = useEditor((s) => s.pushHistoryNow);
  const slider = useSliderHistory();
  const format = useEditor((s) => s.format);
  const quality = useEditor((s) => s.quality);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [copyCount, setCopyCount] = useState<number | null>(null);

  const preset = useMemo(() => {
    if (!image) return undefined;
    return RATIO_PRESETS.find((p) => p.w === image.edit.ratioW && p.h === image.edit.ratioH && p.mm);
  }, [image]);

  const photoMm = preset?.mm ?? null;
  const capacity = useMemo(() => (photoMm ? sheetCapacity(photoMm) : null), [photoMm]);

  if (!image) return null;
  const frame = image.edit.frame ?? { padding: 0, radius: 0 };

  async function exportSheet(count?: number) {
    if (!image || !photoMm) return;
    setSheetBusy(true);
    try {
      const source = await loadBlob(image.blobId);
      if (!source) {
        toastError("Foto sumber tidak ditemukan di penyimpanan lokal.");
        return;
      }
      const project = {
        id: image.id,
        name: image.name,
        sourceBlobId: image.blobId,
        ratioW: image.edit.ratioW,
        ratioH: image.edit.ratioH,
        fit: image.edit.fit,
        transform: image.edit.transform,
        background: image.edit.background,
        adjust: image.edit.adjust,
        frame: image.edit.frame,
        updatedAt: Date.now(),
      };
      const result = await renderSheetBlob(
        project,
        source,
        { photoMm, dpi: 300, cutMarks: true, sheetColor: "#FFFFFF" },
        format === "webp" ? "webp" : format,
        quality,
        count,
      );
      if (!result) {
        toastError("Gagal membuat lembar cetak.");
        return;
      }
      const ext = format === "jpeg" ? "jpg" : format;
      download(result.blob, `${image.name}-lembar-A4-${result.total}x.${ext}`);
      toastSuccess(`Lembar A4 siap cetak: ${result.total} foto (${result.cols}×${result.rows}). ${formatBytes(result.blob.size)}`);
    } finally {
      setSheetBusy(false);
    }
  }

  return (
    <div className="space-y-5 p-4">
      {/* Bingkai: padding + sudut membulat */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="section-title flex items-center gap-1.5">
            <Frame size={14} strokeWidth={1.5} aria-hidden />
            Bingkai Foto
          </h3>
          <button type="button" onClick={resetFrame} className="btn-reset" title="Kembalikan bingkai ke pengaturan awal">
            <RotateCcw size={12} strokeWidth={2} aria-hidden />
            Setel ulang
          </button>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="micro-label">Padding</span>
            <span className="code-label tabular font-medium text-gray-900">{frame.padding}%</span>
          </div>
          <input
            type="range"
            aria-label="Padding bingkai"
            min={0}
            max={25}
            value={frame.padding}
            onChange={(e) => {
              const nilai = Number(e.target.value);
              slider.change((commit) => setFrame({ padding: nilai }, commit));
            }}
            onPointerDown={slider.onPointerDown}
            onPointerUp={slider.endGesture}
            onPointerCancel={slider.endGesture}
            className="range"
          />
          <span className="block text-[11px] leading-4 text-gray-400">Jarak foto dari tepi bingkai</span>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="micro-label">Sudut Membulat</span>
            <span className="code-label tabular font-medium text-gray-900">{frame.radius}%</span>
          </div>
          <input
            type="range"
            aria-label="Sudut membulat"
            min={0}
            max={50}
            value={frame.radius}
            onChange={(e) => {
              const nilai = Number(e.target.value);
              slider.change((commit) => setFrame({ radius: nilai }, commit));
            }}
            onPointerDown={slider.onPointerDown}
            onPointerUp={slider.endGesture}
            onPointerCancel={slider.endGesture}
            className="range"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            pushHistoryNow();
            setFrame({ padding: 6, radius: 4 }, false);
          }}
          className="btn-secondary w-full"
        >
          <RotateCcw size={14} strokeWidth={1.5} />
          Bingkai rapi (padding 6%, sudut 4%)
        </button>
      </section>

      {/* Cetak lembar A4 */}
      <section className="space-y-3 border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="section-title">Cetak Lembar A4</h3>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">300 DPI</span>
        </div>

        {!photoMm || !capacity ? (
          <p className="text-[11px] leading-4 text-gray-500">
            Pilih preset dokumen (mis. Pas foto 3x4 atau 4x6) untuk membuat lembar cetak berisi banyak salinan.
          </p>
        ) : (
          <>
            <p className="text-[11px] leading-4 text-gray-500">
              Lembar {A4_MM.w}×{A4_MM.h} mm berisi {capacity.cols}×{capacity.rows} = <span className="tabular font-medium text-gray-900">{capacity.total} salinan</span> foto{" "}
              {photoMm[0]}×{photoMm[1]} mm, lengkap dengan garis potong.
            </p>

            <div className="flex items-center gap-2">
              <label className="micro-label shrink-0" htmlFor="sheet-count">
                Jumlah
              </label>
              <input
                id="sheet-count"
                type="number"
                min={1}
                max={capacity.total}
                value={copyCount ?? capacity.total}
                onChange={(e) => setCopyCount(Math.max(1, Math.min(capacity.total, Number(e.target.value))))}
                className="field tabular h-8 font-mono text-xs"
              />
              <span className="code-label shrink-0">dari {capacity.total}</span>
            </div>

            <button type="button" onClick={() => exportSheet(copyCount ?? undefined)} disabled={sheetBusy} className="btn-primary h-9! w-full!">
              {sheetBusy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} strokeWidth={1.5} />}
              Unduh Lembar Cetak
            </button>
            <p className="text-[11px] leading-4 text-gray-400">
              Cetak pada kertas A4 tanpa penyesuaian skala (100%). Potong mengikuti garis putus-putus.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
