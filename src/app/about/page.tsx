"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toastSuccess } from "../../lib/toast";
import { clearAll, isStorageAvailable } from "../../lib/storage";
import Logo from "../../components/Logo";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import CopyrightNotice from "../../components/CopyrightNotice";
import { Archive, ArrowLeft, CameraOff, Puzzle, Ratio, ShieldCheck, Trash2 } from "lucide-react";

const STEPS: { icon: typeof Ratio; title: string; body: string }[] = [
  {
    icon: Ratio,
    title: "Kanvas render lokal",
    body: "Pratinjau dan ekspor memakai satu pipeline render yang sama. Yang kamu lihat di kanvas adalah yang tersimpan, pada ukuran preset atau piksel kustom yang kamu pilih.",
  },
  {
    icon: Puzzle,
    title: "Model segmentasi on-device",
    body: "Pemisahan subjek berjalan di browser via WebAssembly. Model diunduh sekali sekitar 40 MB lalu di-cache, dan foto tetap tidak dikirim ke mana pun.",
  },
  {
    icon: ShieldCheck,
    title: "Ekspor bersih metadata",
    body: "Metadata EXIF dihapus otomatis, jadi lokasi pengambilan foto tidak ikut tersimpan.",
  },
];

const LIMITS: { icon: typeof Ratio; label: string; value: string; accent?: boolean }[] = [
  { icon: Archive, label: "Ukuran Berkas Input Maksimum", value: "40 MB per foto" },
  { icon: Ratio, label: "Resolusi Maksimum Kanvas", value: "8192 px (sisi terpanjang)" },
  { icon: CameraOff, label: "Penanganan Metadata EXIF", value: "Otomatis Dihapus", accent: true },
  { icon: Puzzle, label: "Format Didukung", value: "JPEG, PNG, WebP, AVIF" },
];

export default function AboutPage() {
  const [storageOk, setStorageOk] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    // Baca ketersediaan penyimpanan satu kali saat halaman dibuka.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStorageOk(isStorageAvailable());
  }, []);

  /** Hapus semua data lokal setelah dikonfirmasi lewat modal. */
  async function doClearAll() {
    setClearing(true);
    try {
      await clearAll();
      setConfirmClear(false);
      toastSuccess("Data lokal dihapus.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[960px] px-5 py-8">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="PasFotoIn, kembali ke beranda">
          <Logo />
        </Link>
        <Link href="/editor" className="text-sm text-primary-600 hover:underline">
          Buka editor
        </Link>
      </header>

      <article className="mx-auto mt-10 flex max-w-[640px] flex-col gap-8">
        {/* Kepala artikel */}
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-primary-600">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-600" aria-hidden />
            Dokumentasi Teknis &amp; Tata Kelola Data
          </div>
          <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.02em] text-gray-900">Tentang PasFotoIn</h1>
          <p className="leading-relaxed text-gray-600">
            PasFotoIn mengubah rasio dan latar foto di dalam browser. Tidak ada akun, tidak ada server penyimpanan, tidak ada unggahan.
          </p>
          <div className="mt-1 h-px w-full bg-gray-200" />
        </header>

        {/* 01 Privasi */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="code-label text-primary-600">01</span>
            <span className="code-label text-gray-300">/</span>
            <h2 className="text-base font-semibold text-gray-900">Privasi</h2>
          </div>
          <p className="leading-relaxed text-gray-600">
            Foto diproses di browser kamu dan tidak dikirim ke mana pun. Untuk memastikan, buka tab Network di DevTools saat mengekspor. Kamu tidak akan melihat permintaan yang memuat gambar. Hanya data pengaturan dan proyek yang disimpan, di perangkat ini saja.
          </p>
          <div className="rounded-xl bg-surface-low p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-high">
                <ShieldCheck size={16} strokeWidth={1.5} className="text-primary-600" aria-hidden />
              </span>
              <div>
                <span className="block text-sm font-medium text-gray-900">Prinsip Nol Peladen (Zero-Server Architecture)</span>
                <p className="mt-1 text-xs leading-5 text-gray-600">
                  Foto tidak pernah dikirim, dipindai, diunggah, atau dianalisis ke peladen eksternal mana pun. Tidak ada basis data terpusat dan tidak ada pelacak pihak ketiga.
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs leading-5 text-gray-500">
            Pengecualian: fitur Hapus latar (AI) mengunduh file model sekitar 40 MB sekali dari internet sebelum memproses. Foto tetap tidak diunggah ke mana pun.
          </p>
        </section>

        <div className="h-px w-full bg-gray-200" />

        {/* 02 Cara Kerja */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="code-label text-primary-600">02</span>
            <span className="code-label text-gray-300">/</span>
            <h2 className="text-base font-semibold text-gray-900">Cara Kerja</h2>
          </div>
          <p className="leading-relaxed text-gray-600">
            Saat kamu memilih foto, gambar dibaca langsung dari perangkat. Setiap perubahan rasio, posisi, dan latar digambar ulang di kanvas.
          </p>
          <div className="flex flex-col gap-2">
            {STEPS.map((s, i) => (
              <div key={s.title} className="flex items-start gap-3 rounded-xl bg-white p-3 shadow-sm">
                <span className="code-label flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface-mid font-semibold text-primary-600">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900">{s.title}</span>
                  <p className="mt-1 text-xs leading-5 text-gray-600">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="h-px w-full bg-gray-200" />

        {/* 03 Batas */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="code-label text-primary-600">03</span>
            <span className="code-label text-gray-300">/</span>
            <h2 className="text-base font-semibold text-gray-900">Batas</h2>
          </div>
          <p className="leading-relaxed text-gray-600">
            Batas ini menjaga stabilitas memori peramban dan keandalan isolasi privasi.
          </p>
          <div className="flex flex-col gap-1.5 rounded-xl bg-surface-low p-3">
            {LIMITS.map((l) => (
              <div key={l.label} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <l.icon size={16} strokeWidth={1.5} className="shrink-0 text-gray-400" aria-hidden />
                  <span className="truncate text-xs font-medium text-gray-900">{l.label}</span>
                </div>
                <span
                  className={`code-label shrink-0 rounded-lg px-2 py-0.5 ${
                    l.accent ? "bg-primary-50 text-primary-600" : "bg-surface-mid text-gray-600"
                  }`}
                >
                  {l.value}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="h-px w-full bg-gray-200" />

        {/* 04 Data Lokal */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="code-label text-primary-600">04</span>
            <span className="code-label text-gray-300">/</span>
            <h2 className="text-base font-semibold text-gray-900">Data Lokal</h2>
          </div>
          <p className="leading-relaxed text-gray-600">
            Pengaturan terakhir dan metadata proyek disimpan di localStorage. File gambar disimpan di IndexedDB pada perangkat ini. Maksimum 20 proyek, yang paling lama tidak dibuka dihapus lebih dulu, dan proyek kedaluwarsa setelah 14 hari tanpa dibuka.
          </p>
          {!storageOk && (
            <p className="rounded-xl border border-gray-200 bg-warning-surface px-3 py-2 text-xs text-gray-600">
              Penyimpanan lokal tidak tersedia di sesi ini. Proyek tidak akan tersimpan setelah tab ditutup.
            </p>
          )}
          <div className="flex flex-col gap-3 rounded-xl bg-surface-low p-4">
            <div>
              <span className="block text-sm font-medium text-gray-900">Manajemen Cache &amp; Draf Kerja</span>
              <p className="mt-1 text-xs leading-5 text-gray-600">
                Pembersihan ini menghapus seluruh salinan draf foto, riwayat suntingan, dan konfigurasi lokal yang tersimpan di peramban ini.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="code-label flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
                Draf tersimpan: Aktif di peramban
              </span>
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="group inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-surface-high px-3 text-xs font-medium text-gray-900 transition-colors hover:bg-danger-surface hover:text-danger"
              >
                <Trash2 size={16} strokeWidth={1.5} className="text-gray-400 transition-colors group-hover:text-danger" aria-hidden />
                Hapus semua data lokal
              </button>
            </div>
          </div>
        </section>

        <div className="h-px w-full bg-gray-200" />
      </article>

      {/* Footer halaman, selebar konten utama agar versi, hak cipta, dan tombol
          kembali muat dalam satu baris. */}
      <footer className="mt-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-gray-200 py-4">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-gray-500">
          <span className="code-label whitespace-nowrap">v1.0.0 · Offline Ready</span>
          <span aria-hidden className="text-gray-300">
            ·
          </span>
          <CopyrightNotice inline />
        </p>
        <Link href="/" className="btn-primary shrink-0">
          <ArrowLeft size={16} strokeWidth={1.5} aria-hidden />
          Kembali ke Workbench Editor
        </Link>
      </footer>

      <ConfirmDialog
        open={confirmClear}
        tone="danger"
        title="Hapus semua data lokal?"
        description="Seluruh proyek, draf kerja, dan pengaturan yang tersimpan di peramban ini akan dihapus permanen."
        details={[
          "Semua proyek tersimpan beserta foto sumbernya",
          "Riwayat suntingan dan pengaturan ekspor",
          "Tidak memengaruhi file asli di perangkat kamu",
        ]}
        confirmLabel="Hapus semua data"
        busy={clearing}
        onConfirm={doClearAll}
        onClose={() => setConfirmClear(false)}
      />
    </main>
  );
}
