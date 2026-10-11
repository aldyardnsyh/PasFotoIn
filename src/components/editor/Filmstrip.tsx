"use client";

import { useEditor } from "../../store/editor";
import { RATIO_PRESETS } from "../../lib/presets";
import AddPhotosButton from "./AddPhotosButton";
import DeletePhotoButton from "./DeletePhotoButton";

export default function Filmstrip() {
  const images = useEditor((s) => s.images);
  const activeId = useEditor((s) => s.activeId);
  const setActive = useEditor((s) => s.setActive);

  if (images.length <= 1) return null;

  return (
    <div className="no-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto border-t border-gray-200 bg-white px-4 py-3 shadow-sm">
      <AddPhotosButton variant="tile" />
      {images.map((e) => {
        // Pakai presetId agar label ukuran tepat (2x3, 4x6, dan 6x9 sama-sama 2:3).
        const preset = e.edit.presetId
          ? RATIO_PRESETS.find((p) => p.id === e.edit.presetId)
          : RATIO_PRESETS.find((p) => p.w === e.edit.ratioW && p.h === e.edit.ratioH && p.px);
        const isActive = e.id === activeId;
        const sizeLabel = preset?.mm
          ? `${preset.mm[0] / 10}×${preset.mm[1] / 10} cm`
          : `${e.edit.ratioW}:${e.edit.ratioH}`;
        return (
          <div
            key={e.id}
            className={`group relative flex h-14 shrink-0 items-stretch rounded-lg border transition-colors ${
              isActive ? "border-primary-600 bg-primary-50" : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            {/* Seluruh kartu bisa diklik untuk memilih foto, bukan hanya thumbnail. */}
            <button
              type="button"
              onClick={() => setActive(e.id)}
              aria-label={`Pilih ${e.name}`}
              aria-pressed={isActive}
              className="flex items-center gap-2.5 px-2 text-left"
            >
              <span
                className="relative block shrink-0 overflow-hidden rounded bg-gray-100"
                style={{ aspectRatio: `${e.edit.ratioW} / ${e.edit.ratioH}`, height: 44, minWidth: 28, maxWidth: 72 }}
              >
                {e.previewUrl && (
                  /* Thumbnail object-URL lokal, tidak bisa dioptimasi next/image */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.previewUrl} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <span className="flex max-w-[150px] min-w-0 flex-col gap-0.5 pr-1">
                <span className={`truncate text-[12px] font-medium ${isActive ? "text-primary-700" : "text-gray-900"}`}>
                  {e.name}
                </span>
                <span className="code-label truncate tabular">
                  {sizeLabel}
                  {preset?.px ? ` · ${preset.px[0]}×${preset.px[1]}px` : ""}
                </span>
                {isActive && <span className="text-[10px] font-semibold uppercase tracking-wide text-primary-600">Aktif</span>}
              </span>
            </button>
            <DeletePhotoButton id={e.id} name={e.name} variant="tile" />
          </div>
        );
      })}
    </div>
  );
}
