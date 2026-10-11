"use client";

/**
 * Panel "Perjelas Detail" — peningkatan ketajaman tanpa mengubah warna atau isi.
 *
 * Latar belakang masalah: setelah penggantian latar atau pemrosesan ulang, foto
 * sering terlihat kurang tajam karena resampling berulang. Panel ini mengembalikan
 * ketajaman dengan unsharp mask + clarity, keduanya bekerja pada luminance saja
 * sehingga warna tidak bergeser.
 */
import { useState } from "react";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useEditor } from "../../store/editor";
import { DEFAULT_ENHANCE } from "../../lib/enhance";
import { toastSuccess, toastError } from "../../lib/toast";

/**
 * Tingkat preset: hasil langsung tanpa perlu menyetel slider.
 *
 * Nilai sengaja lembut. Tujuan enhance adalah memperjelas detail yang sudah ada,
 * bukan mengubah tampilan foto. Preset "Tajam" pun masih dalam batas aman.
 */
const PRESETS = [
  { id: "soft", label: "Sangat Halus", sharpen: 15, clarity: 8, denoise: 25, hint: "Sentuhan minimal, foto hampir tidak berubah" },
  { id: "standard", label: "Halus", sharpen: 30, clarity: 15, denoise: 20, hint: "Pilihan aman untuk sebagian besar foto" },
  { id: "strong", label: "Sedang", sharpen: 50, clarity: 25, denoise: 12, hint: "Untuk foto yang terlihat lembut atau agak blur" },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

export default function EnhancePanel() {
  const image = useEditor((s) => s.images.find((e) => e.id === s.activeId));
  const enhancePhoto = useEditor((s) => s.enhancePhoto);
  const [preset, setPreset] = useState<PresetId>("standard");
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [sharpen, setSharpen] = useState(DEFAULT_ENHANCE.sharpen);
  const [clarity, setClarity] = useState(DEFAULT_ENHANCE.clarity);
  const [denoise, setDenoise] = useState(DEFAULT_ENHANCE.denoise);

  if (!image) return null;

  const active = PRESETS.find((p) => p.id === preset)!;
  const opts = advanced
    ? { sharpen, clarity, denoise, radius: DEFAULT_ENHANCE.radius }
    : { sharpen: active.sharpen, clarity: active.clarity, denoise: active.denoise, radius: DEFAULT_ENHANCE.radius };

  async function run() {
    setBusy(true);
    try {
      const ok = await enhancePhoto(image!.id, opts);
      if (ok) toastSuccess("Detail diperjelas. Warna dan isi foto tidak diubah.");
      else toastError("Gagal memperjelas detail. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <h3 className="section-title flex items-center gap-1.5">
          <Sparkles size={14} strokeWidth={1.5} className="text-primary-600" aria-hidden />
          Perjelas Detail
        </h3>
      </div>

      <p className="text-[11px] leading-4 text-gray-500">
        Menajamkan tepi dan detail tanpa mengubah warna, kontras, atau isi foto. Berguna setelah penggantian latar.
      </p>

      {/* Tingkat preset */}
      <div className="space-y-1.5">
        <span className="micro-label font-semibold">Tingkat</span>
        <div className="space-y-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPreset(p.id);
                setAdvanced(false);
              }}
              aria-pressed={!advanced && preset === p.id}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                !advanced && preset === p.id
                  ? "border-primary-600/40 bg-gray-100 ring-1 ring-primary-600/40"
                  : "border-gray-200 bg-gray-50 hover:bg-gray-100"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold ${!advanced && preset === p.id ? "text-primary-700" : "text-gray-900"}`}>
                  {p.label}
                </span>
                <span className="code-label tabular">+{p.sharpen}</span>
              </span>
              <span className="mt-0.5 block text-[11px] leading-4 text-gray-500">{p.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Kontrol lanjutan */}
      <button
        type="button"
        onClick={() => {
          // Saat membuka kontrol lanjutan, isi slider dengan nilai preset aktif
          // agar pengguna mulai dari titik yang masuk akal, bukan nilai default.
          if (!advanced) {
            setSharpen(active.sharpen);
            setClarity(active.clarity);
            setDenoise(active.denoise);
          }
          setAdvanced((v) => !v);
        }}
        className="text-[11px] font-medium text-primary-600 hover:underline"
      >
        {advanced ? "Sembunyikan kontrol lanjutan" : "Kontrol lanjutan"}
      </button>

      {advanced && (
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="micro-label">Ketajaman Tepi</span>
              <span className="code-label tabular">{sharpen}</span>
            </div>
            <input
              type="range"
              aria-label="Ketajaman tepi"
              min={0}
              max={100}
              value={sharpen}
              onChange={(e) => setSharpen(Number(e.target.value))}
              className="range"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="micro-label">Kejelasan (Clarity)</span>
              <span className="code-label tabular">{clarity}</span>
            </div>
            <input
              type="range"
              aria-label="Kejelasan"
              min={0}
              max={100}
              value={clarity}
              onChange={(e) => setClarity(Number(e.target.value))}
              className="range"
            />
            <span className="block text-[10px] leading-4 text-gray-400">
              Kontras lokal pada midtone. Tidak mengubah titik hitam atau putih.
            </span>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="micro-label">Kurangi Noise</span>
              <span className="code-label tabular">{denoise}</span>
            </div>
            <input
              type="range"
              aria-label="Kurangi noise"
              min={0}
              max={100}
              value={denoise}
              onChange={(e) => setDenoise(Number(e.target.value))}
              className="range"
            />
            <span className="block text-[10px] leading-4 text-gray-400">
              Dijalankan sebelum penajaman agar noise tidak ikut dipertegas.
            </span>
          </div>
        </div>
      )}

      <button type="button" onClick={run} disabled={busy} className="btn-primary h-9! w-full!">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} strokeWidth={1.5} />}
        {busy ? "Memproses…" : "Perjelas Sekarang"}
      </button>

      <p className="flex items-start gap-1.5 text-[10px] leading-4 text-gray-400">
        <RotateCcw size={11} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
        Hasilnya bisa dibatalkan dengan Ctrl + Z. Foto asli tetap tersimpan.
      </p>
    </div>
  );
}
