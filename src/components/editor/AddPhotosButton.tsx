"use client";

import { useRef } from "react";
import { toastSuccess, toastError } from "../../lib/toast";
import { ImagePlus } from "lucide-react";
import { useEditor } from "../../store/editor";

/** Tombol tambah foto tanpa pindah halaman. Setelah ditambah, foto baru langsung dibuka. */
export default function AddPhotosButton({ variant = "topbar" }: { variant?: "topbar" | "tile" }) {
  const addImages = useEditor((s) => s.addImages);
  const setActive = useEditor((s) => s.setActive);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handle(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      toastError("File itu bukan gambar. Coba JPEG, PNG, atau WebP.");
      return;
    }
    const ids = await addImages(list);
    if (ids.length > 0) {
      setActive(ids[0]);
      if (list.length > 1) toastSuccess(`${ids.length} foto ditambahkan.`);
    }
  }

  if (variant === "tile") {
    return (
      <>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          title="Tambah foto"
          aria-label="Tambah foto"
          className="flex h-14 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900"
        >
          <ImagePlus size={18} strokeWidth={1.5} />
          <span className="text-[10px] font-medium">Tambah</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            handle(e.target.files);
            e.target.value = "";
          }}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title="Tambah foto"
        aria-label="Tambah foto"
        className="btn-secondary"
      >
        <ImagePlus size={16} strokeWidth={1.5} />
        <span className="hidden sm:inline">Tambah</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}
