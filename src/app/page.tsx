"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toastSuccess } from "../lib/toast";
import Dropzone from "../components/editor/Dropzone";
import Logo from "../components/Logo";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import ProjectThumb from "../components/editor/ProjectThumb";
import { clearAll, isStorageAvailable, loadProjects } from "../lib/storage";
import { RATIO_PRESETS } from "../lib/presets";
import type { Project } from "../lib/geometry";
import {
  ArrowRight,
  Image as ImageIcon,
  Info,
  Keyboard,
  Lock,
  Palette,
  Pencil,
  Printer,
  Ratio,
  Scissors,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

/** Pintasan yang benar-benar aktif di editor (lihat src/app/editor/page.tsx). */
const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "Ctrl + Z", label: "Undo perubahan" },
  { keys: "Ctrl + Shift + Z", label: "Redo perubahan" },
  { keys: "Ctrl + E", label: "Buka dialog ekspor" },
  { keys: "R", label: "Putar 90 derajat" },
  { keys: "F", label: "Balik horizontal" },
  { keys: "0", label: "Atur ulang transformasi" },
  { keys: "G", label: "Tampilkan panduan" },
  { keys: "C", label: "Bandingkan sebelum dan sesudah" },
  { keys: "+ / -", label: "Zoom masuk dan keluar" },
  { keys: "[ / ]", label: "Pindah foto sebelumnya atau berikutnya" },
  { keys: "Panah", label: "Geser posisi, Shift untuk langkah besar" },
];

/**
 * Ukuran dokumen resmi yang benar-benar tersedia sebagai preset.
 * Ditampilkan sebagai pintasan: klik membuka pemilih berkas.
 */
const DOC_PRESETS: { label: string; size: string; dot: string }[] = [
  { label: "KTP / SIM", size: "3×4 cm", dot: "#D32F2F" },
  { label: "Ijazah / CPNS", size: "4×6 cm", dot: "#0B57D0" },
  { label: "Paspor / Visa", size: "35×45 mm", dot: "#FFFFFF" },
];

/** Kemampuan nyata aplikasi, bukan klaim pemasaran. */
const CAPABILITIES: { icon: typeof Palette; title: string; body: string }[] = [
  {
    icon: Scissors,
    title: "Pisahkan subjek",
    body: "Model berjalan di perangkat. Tiga tingkat kualitas, dari 42 MB sampai 168 MB.",
  },
  {
    icon: Ratio,
    title: "Ukuran resmi Indonesia",
    body: "2×3, 3×4, 4×6, 6×9 cm sampai paspor ICAO. Ukuran mm dan piksel 300/600 DPI.",
  },
  {
    icon: Printer,
    title: "Lembar cetak A4",
    body: "Satu lembar berisi puluhan salinan dengan garis potong, siap dibawa ke lab foto.",
  },
  {
    icon: SlidersHorizontal,
    title: "Histogram & Levels",
    body: "Grafik RGB, garis levels yang bisa ditarik, dan white balance otomatis.",
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  { n: "01", title: "Pilih atau tarik foto", body: "Bisa juga tempel dari clipboard dengan Ctrl + V." },
  { n: "02", title: "Atur ukuran dan latar", body: "Pilih preset dokumen, geser posisi, ganti latar di dalam foto." },
  { n: "03", title: "Ekspor atau cetak", body: "Unduh satu file, banyak file sebagai ZIP, atau lembar A4 siap potong." },
];

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [storageOk, setStorageOk] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  /** Hapus semua data lokal setelah dikonfirmasi lewat modal. */
  async function doClearAll() {
    setClearing(true);
    try {
      await clearAll();
      setProjects([]);
      setConfirmClear(false);
      toastSuccess("Data lokal dihapus.");
    } finally {
      setClearing(false);
    }
  }

  useEffect(() => {
    // Baca penyimpanan lokal satu kali saat halaman dibuka.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStorageOk(isStorageAvailable());
    setProjects(loadProjects());
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) return;
      e.preventDefault();
      void (async () => {
        const { saveBlob } = await import("../lib/storage");
        const blobId = `clip-${crypto.randomUUID()}`;
        const saved = await saveBlob(blobId, files[0]);
        if (!saved) return;
        sessionStorage.setItem("pasfotoin:clipboard", JSON.stringify({ blobId, name: files[0].name || "tempelan" }));
        router.push("/editor");
      })();
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [router]);

  /** Buka dialog berkas milik dropzone tanpa menambah input file kedua di halaman. */
  const openPicker = () => {
    dropRef.current?.querySelector<HTMLInputElement>('input[type="file"]')?.click();
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Bilah atas */}
      <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-surface/85 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-[1080px] items-center justify-between px-5">
          <Link href="/" aria-label="PasFotoIn, ke beranda">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1">
            <details className="relative">
              <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 [&::-webkit-details-marker]:hidden">
                <Keyboard size={15} strokeWidth={1.5} aria-hidden />
                Pintasan
              </summary>
              <div className="absolute right-0 top-10 z-20 w-[300px] rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
                <p className="micro-label font-semibold uppercase tracking-wider">Pintasan editor</p>
                <ul className="mt-3 space-y-2">
                  {SHORTCUTS.map((s) => (
                    <li key={s.keys} className="flex items-center justify-between gap-3">
                      <span className="text-[12px] text-gray-600">{s.label}</span>
                      <kbd className="code-label shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5">{s.keys}</kbd>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 border-t border-gray-100 pt-3 text-[11px] leading-4 text-gray-400">
                  Aktif di halaman editor setelah foto dimuat. Ctrl + V juga bekerja di halaman ini.
                </p>
              </div>
            </details>
            <Link
              href="/about"
              className="flex h-8 items-center rounded-lg px-3 text-[12.5px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              Tentang
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-gray-200/70">
          {/* Latar dekoratif: grid studio + gradien lembut, bukan blob atau glow. */}
          <div className="pointer-events-none absolute inset-0 studio-grid opacity-[0.55]" aria-hidden />
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(250,248,255,0) 0%, rgba(250,248,255,0.92) 62%, #faf8ff 100%)" }}
            aria-hidden
          />

          <div className="relative mx-auto w-full max-w-[1080px] px-5 pb-12 pt-14">
            <div className="flex flex-col items-center text-center">
              <h1 className="max-w-[720px] text-[34px] font-bold leading-[1.12] tracking-[-0.03em] text-gray-900 sm:text-[46px]">
                Ubah rasio dan latar foto,
                <br className="hidden sm:block" /> siap untuk dokumen resmi
              </h1>

              <p className="mt-4 max-w-[560px] text-[14.5px] leading-6 text-gray-600">
                Preset pas foto Indonesia dalam sentimeter, pemisahan subjek otomatis, dan lembar cetak A4. Foto tidak
                pernah diunggah ke server.
              </p>

              {/* Pintasan dokumen: ukuran nyata, bukan klaim */}
              <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
                {DOC_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={openPicker}
                    className="group inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-sm"
                  >
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
                      style={{ background: p.dot }}
                      aria-hidden
                    />
                    <span className="flex flex-col leading-tight">
                      <span className="text-[12px] font-semibold text-gray-900">{p.label}</span>
                      <span className="code-label">{p.size}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dropzone */}
            <div ref={dropRef} className="mx-auto mt-9 w-full max-w-[640px] rounded-2xl bg-white p-2 shadow-md">
              <Dropzone large onDone={() => router.push("/editor")} />
            </div>

            {!storageOk && (
              <p className="mx-auto mt-4 flex w-full max-w-[640px] items-start gap-2 rounded-xl border border-gray-200 bg-warning-surface px-3 py-2.5 text-[12px] leading-5 text-gray-600">
                <Info size={15} strokeWidth={1.5} className="mt-px shrink-0 text-warning" aria-hidden />
                Penyimpanan lokal tidak tersedia. Proyek tidak akan tersimpan setelah tab ditutup.
              </p>
            )}
          </div>
        </section>

        {/* Kemampuan */}
        <section className="mx-auto w-full max-w-[1080px] px-5 py-14">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-gray-900">Yang bisa kamu lakukan</h2>
              <p className="mt-1 text-[13px] text-gray-500">Empat hal yang paling sering dipakai untuk pas foto.</p>
            </div>
            <button type="button" onClick={openPicker} className="btn-secondary">
              Coba sekarang
              <ArrowRight size={15} strokeWidth={1.5} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((f) => (
              <div key={f.title} className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm">
                <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
                  <f.icon size={18} strokeWidth={1.5} className="text-primary-600" aria-hidden />
                </span>
                <h3 className="text-[13px] font-semibold text-gray-900">{f.title}</h3>
                <p className="mt-1.5 text-[12px] leading-5 text-gray-500">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Cara kerja */}
        <section className="border-y border-gray-200/70 bg-surface-low/60">
          <div className="mx-auto w-full max-w-[1080px] px-5 py-14">
            <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-gray-900">Tiga langkah</h2>
            <p className="mt-1 text-[13px] text-gray-500">Dari foto di galeri sampai file siap kirim.</p>

            <ol className="mt-8 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="flex flex-col border-t-2 border-gray-200 pt-4">
                  <span className="code-label font-semibold text-primary-600">{s.n}</span>
                  <h3 className="mt-2 text-[13.5px] font-semibold text-gray-900">{s.title}</h3>
                  <p className="mt-1.5 text-[12px] leading-5 text-gray-500">{s.body}</p>
                </li>
              ))}
            </ol>

            <div className="mt-9 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
              <Lock size={16} strokeWidth={1.5} className="shrink-0 text-primary-600" aria-hidden />
              <p className="text-[12px] leading-5 text-gray-600">
                Foto tidak dikirim ke mana pun. Untuk memastikan, buka tab Network di DevTools saat mengekspor.
              </p>
              <Link href="/about" className="ml-auto shrink-0 text-[12px] font-medium text-primary-600 hover:underline">
                Selengkapnya
              </Link>
            </div>
          </div>
        </section>

        {/* Proyek terakhir */}
        <section className="mx-auto w-full max-w-[1080px] px-5 py-14">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <h2 className="truncate text-[20px] font-semibold tracking-[-0.02em] text-gray-900">Proyek terakhir</h2>
              {projects.length > 0 && (
                <span className="tabular shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                  {projects.length} berkas
                </span>
              )}
            </div>
            {projects.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-gray-600 transition-colors hover:bg-danger-surface hover:text-danger"
              >
                <Trash2 size={14} strokeWidth={1.5} aria-hidden />
                Hapus data lokal
              </button>
            )}
          </div>

          {projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 p-12 text-center">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                <ImageIcon size={26} strokeWidth={1.5} aria-hidden />
              </span>
              <h3 className="text-[14px] font-semibold text-gray-900">Belum ada proyek</h3>
              <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-5 text-gray-500">
                Foto yang kamu edit akan muncul di sini. Riwayat disimpan secara privat di IndexedDB peramban kamu.
              </p>
              <button type="button" onClick={openPicker} className="btn-primary mt-5">
                Mulai suntingan pertama
              </button>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
              {projects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem("pasfotoin:open", JSON.stringify(p));
                      router.push("/editor");
                    }}
                    className="group flex w-full flex-col rounded-xl border border-gray-200 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
                  >
                    <span className="relative mb-3 block aspect-[3/4] w-full overflow-hidden rounded-lg bg-gray-100">
                      <ProjectThumb projectId={p.id} name={p.name} />
                      <span className="code-label absolute left-2 top-2 rounded bg-white/90 px-1.5 py-0.5 font-semibold shadow-xs">
                        {p.ratioW}:{p.ratioH}
                      </span>
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gray-900/25 opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[12px] font-medium text-gray-900 shadow-md">
                          <Pencil size={14} strokeWidth={1.5} aria-hidden />
                          Buka
                        </span>
                      </span>
                    </span>
                    <span className="block truncate text-[13px] font-semibold text-gray-900 group-hover:text-primary-600">{p.name}</span>
                    <span className="code-label tabular mt-1 block">
                      {p.presetId
                        ? (RATIO_PRESETS.find((r) => r.id === p.presetId)?.label ?? `${p.ratioW}:${p.ratioH}`)
                        : `${p.ratioW}:${p.ratioH}`}{" "}
                      · {new Date(p.updatedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="border-t border-gray-200/70 bg-white">
        <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-2 px-5 py-6 text-[12px] text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Rasio untuk Instagram, TikTok, YouTube, dan marketplace. Semua proses berjalan di browser kamu.</p>
          <span className="code-label shrink-0">v1.0.0 · Offline Ready</span>
        </div>
      </footer>

      <ConfirmDialog
        open={confirmClear}
        tone="danger"
        title="Hapus semua data lokal?"
        description="Seluruh proyek dan pengaturan yang tersimpan di peramban ini akan dihapus permanen."
        details={[
          `${projects.length} proyek tersimpan beserta foto sumbernya`,
          "Pengaturan ekspor (format dan kualitas)",
          "Tidak memengaruhi file asli di perangkat kamu",
        ]}
        confirmLabel="Hapus semua data"
        busy={clearing}
        onConfirm={doClearAll}
        onClose={() => setConfirmClear(false)}
      />
    </div>
  );
}
