"use client";

import { useEffect, useRef } from "react";
import { Image as ImageIcon, X } from "lucide-react";
import { useEditor } from "../../store/editor";
import ExportPanel from "./ExportPanel";

export default function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const image = useEditor((s) => s.images.find((e) => e.id === s.activeId));
  const count = useEditor((s) => s.images.length);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0f172a]/40 p-4 backdrop-blur-[3px]">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Ekspor foto"
        tabIndex={-1}
        className="relative z-10 my-auto flex w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg"
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-5 pb-3 pt-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-gray-900">Ekspor Foto</h2>
              <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">Siap Unduh</span>
            </div>
            <div className="flex items-center gap-1.5 text-[12px] text-gray-500">
              <ImageIcon size={14} strokeWidth={1.5} aria-hidden className="shrink-0 text-gray-400" />
              <span className="max-w-[340px] truncate">{image?.name ?? "Tanpa foto"}</span>
              <span className="text-gray-300">•</span>
              <span className="code-label">{count > 1 ? `${count} foto` : "Berkas Tunggal"}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="btn-icon -mr-1">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="max-h-[74vh] overflow-y-auto p-5">
          <ExportPanel />
        </div>
      </div>
    </div>
  );
}
