"use client";

import { useCallback, useRef, useState } from "react";
import { useEditor } from "../../store/editor";
import { toastError } from "../../lib/toast";
import { Upload } from "lucide-react";

export default function Dropzone({ large = false, onDone }: { large?: boolean; onDone?: () => void }) {
  const addImages = useEditor((s) => s.addImages);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return;
      const list = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(heic|heif|avif)$/i.test(f.name));
      if (list.length === 0) {
        toastError("File itu bukan gambar. Coba JPEG, PNG, atau WebP.");
        return;
      }
      await addImages(list);
      onDone?.();
    },
    [addImages, onDone],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
      className={`flex flex-col items-center justify-center gap-4 rounded-xl border-[1.5px] border-dashed bg-white text-center shadow-sm transition-colors ${
        over ? "border-primary-500 bg-primary-50" : "border-gray-300"
      } ${large ? "px-6 py-16" : "px-6 py-10"}`}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-500">
        <Upload size={24} strokeWidth={1.5} />
      </span>
      <div>
        <p className="font-medium text-gray-900">Tarik foto ke sini, atau pilih dari perangkat</p>
        <p className="mt-1 text-xs text-gray-500">JPEG, PNG, WebP, AVIF. Maksimum 40 MB per foto.</p>
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="btn-primary h-10! px-6!"
      >
        Pilih foto
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        // Penanda bahwa komponen sudah ter-render di sisi klien. Dipakai E2E
        // untuk menunggu React selesai hydrate sebelum mengirim event paste,
        // karena handler paste dipasang lewat useEffect.
        data-ready="1"
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
      <p className="text-xs text-gray-400">
        Bisa juga tempel dari clipboard dengan <kbd className="rounded border border-gray-300 bg-gray-50 px-1 py-px font-mono text-[11px]">Ctrl + V</kbd>.
      </p>
    </div>
  );
}
