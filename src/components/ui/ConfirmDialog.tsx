"use client";

/**
 * Modal konfirmasi yang informatif.
 *
 * Dipakai untuk aksi yang tidak bisa dibatalkan atau berisiko kehilangan data.
 * Berisi: ikon sesuai tingkat bahaya, judul, penjelasan akibat, dan dua tombol
 * dengan label yang menyebut aksinya (bukan "OK"/"Batal" yang ambigu).
 *
 * Dirender lewat portal ke document.body agar tidak terpotong oleh ancestor
 * ber-overflow-hidden (mis. kartu filmstrip).
 *
 * Aksesibilitas: role dialog, aria-modal, fokus terperangkap di dalam modal,
 * Escape menutup, klik overlay menutup (kecuali saat proses berjalan).
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info, Trash2, X } from "lucide-react";

export type ConfirmTone = "danger" | "warning" | "info";

export type ConfirmDialogProps = {
  open: boolean;
  tone?: ConfirmTone;
  title: string;
  /** Penjelasan singkat: apa yang terjadi dan apa akibatnya. */
  description: string;
  /** Poin tambahan, mis. daftar hal yang akan hilang. */
  details?: string[];
  /** Label tombol konfirmasi. Sebut aksinya, bukan "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Tampilkan spinner dan nonaktifkan tombol saat proses berjalan. */
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

const TONE_STYLE: Record<ConfirmTone, { icon: typeof Info; wrap: string; iconColor: string }> = {
  danger: { icon: Trash2, wrap: "bg-danger-surface", iconColor: "text-danger" },
  warning: { icon: AlertTriangle, wrap: "bg-warning-surface", iconColor: "text-warning" },
  info: { icon: Info, wrap: "bg-primary-50", iconColor: "text-primary-600" },
};

export default function ConfirmDialog({
  open,
  tone = "danger",
  title,
  description,
  details,
  confirmLabel,
  cancelLabel = "Batal",
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Portal hanya boleh dirender setelah mount (document belum ada saat SSR).
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
      // Jaga fokus tetap di dalam modal.
      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    confirmRef.current?.focus();
    // Cegah halaman di belakang ikut bergulir selama modal terbuka.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, busy, onClose]);

  if (!open || !mounted) return null;
  const style = TONE_STYLE[tone];
  const Icon = style.icon;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#0f172a]/45 p-4 backdrop-blur-[2px]">
      <div className="absolute inset-0" onClick={() => !busy && onClose()} aria-hidden />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        className="relative z-10 w-full max-w-[420px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg"
      >
        {/*
          Tombol tutup diletakkan di POJOK KIRI ATAS, bukan kanan.
          Alasannya: di pojok kanan ia menimpa judul dan deskripsi yang panjang,
          sehingga teks informasi terpotong. Di kiri atas ia berada di area kosong
          sebelum ikon, jadi tidak menghalangi apa pun.
        */}
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Tutup"
          title="Tutup"
          className="absolute left-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
        >
          <X size={15} strokeWidth={2} />
        </button>

        <div className="flex gap-3.5 px-5 pb-4 pt-11">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${style.wrap}`}>
            <Icon size={19} strokeWidth={1.5} className={style.iconColor} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-[14.5px] font-semibold leading-5 text-gray-900">
              {title}
            </h2>
            <p id="confirm-desc" className="mt-1.5 text-[12.5px] leading-5 text-gray-600">
              {description}
            </p>
            {details && details.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {details.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-[12px] leading-4 text-gray-500">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" aria-hidden />
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/70 px-5 py-3.5">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex h-[34px] items-center justify-center gap-2 rounded-lg px-3.5 text-[12.5px] font-semibold text-white transition-colors disabled:opacity-60 ${
              tone === "danger" ? "bg-danger hover:bg-red-700" : tone === "warning" ? "bg-warning hover:bg-amber-700" : "bg-primary-600 hover:bg-primary-700"
            }`}
          >
            {busy && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
