"use client";

import { useState } from "react";
import { toastSuccess } from "../../lib/toast";
import { Trash2 } from "lucide-react";
import { useEditor } from "../../store/editor";
import ConfirmDialog from "../ui/ConfirmDialog";

/**
 * Hapus foto dari sesi.
 *
 * Menampilkan modal konfirmasi karena foto yang dihapus membawa seluruh
 * pengaturan (rasio, latar, penyesuaian, hasil pemisahan subjek). Meski bisa
 * di-undo, konfirmasi mencegah kehilangan pekerjaan karena salah klik.
 */
export default function DeletePhotoButton({
  id,
  name,
  variant = "tile",
}: {
  id: string;
  name: string;
  variant?: "tile" | "topbar";
}) {
  const removeImage = useEditor((s) => s.removeImage);
  const undo = useEditor((s) => s.undo);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function doDelete() {
    setBusy(true);
    const removed = removeImage(id);
    setBusy(false);
    setConfirmOpen(false);
    if (!removed) return;
    toastSuccess(`"${name}" dihapus dari sesi.`, {
      action: {
        label: "Urungkan",
        onClick: () => undo(),
      },
    });
  }

  const dialog = (
    <ConfirmDialog
      open={confirmOpen}
      tone="danger"
      title={`Hapus "${name}"?`}
      description="Foto ini akan dihapus dari sesi kerja. Semua pengaturan dan hasil pemrosesan pada foto ini ikut terhapus."
      details={[
        "Rasio, latar, dan penyesuaian pada foto ini",
        "Hasil pemisahan subjek (bila sudah dilakukan)",
        "Bisa dikembalikan dengan Ctrl + Z atau tombol Urungkan",
      ]}
      confirmLabel="Hapus foto"
      busy={busy}
      onConfirm={doDelete}
      onClose={() => setConfirmOpen(false)}
    />
  );

  if (variant === "tile") {
    return (
      <>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          title={`Hapus ${name}`}
          aria-label={`Hapus ${name}`}
          className="flex w-7 shrink-0 items-center justify-center border-l border-gray-200 text-danger transition-colors hover:bg-danger-surface"
        >
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
        {dialog}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        title="Hapus foto ini"
        aria-label="Hapus foto ini"
        className="btn-icon is-danger"
      >
        <Trash2 size={18} strokeWidth={1.5} />
      </button>
      {dialog}
    </>
  );
}
