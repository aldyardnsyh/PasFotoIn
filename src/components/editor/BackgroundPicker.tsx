"use client";

import { useEffect, useMemo, useState } from "react";
import { toastSuccess, toastError } from "../../lib/toast";
import { Check, Loader2, Pipette, Scissors } from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { useEditor } from "../../store/editor";
import { GRADIENT_PRESETS, SOLID_SWATCHES, FORMAL_BACKGROUNDS } from "../../lib/presets";
import { extractPalette } from "../../lib/palette";
import { saveBlob } from "../../lib/storage";
import { preloadModel } from "../../lib/separate";
import RemoveBackgroundPanel from "./RemoveBackgroundPanel";
import { Background } from "../../lib/geometry";
import { isValidHex, hexToRgb, rgbToHex } from "../../lib/color";

const TABS = ["solid", "gradient", "blur", "transparent", "image"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  solid: "Warna",
  gradient: "Gradien",
  blur: "Blur",
  transparent: "Transparan",
  image: "Gambar",
};

export default function BackgroundPicker() {
  const image = useEditor((s) => s.images.find((e) => e.id === s.activeId));
  const setBackground = useEditor((s) => s.setBackground);
  const setPendingBackground = useEditor((s) => s.setPendingBackground);
  const runRemoveBackground = useEditor((s) => s.runRemoveBackground);
  const pending = useEditor((s) => s.pendingBackground);
  const [tab, setTab] = useState<Tab>("solid");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ label: string; pct: number | null } | null>(null);
  const bitmap = image?.bitmap ?? null;
  const palette = useMemo(() => (bitmap ? extractPalette(bitmap) : []), [bitmap]);
  const qualityModel = useEditor((s) => s.qualityModel);

  // Mulai unduh model di latar belakang saat panel Latar dibuka, sehingga saat
  // tombol "Pisahkan Subjek" ditekan prosesnya jauh lebih cepat.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = setTimeout(() => preloadModel(qualityModel), 1500);
    return () => clearTimeout(timer);
  }, [qualityModel]);

  if (!image) return null;
  const bg = image.edit.background;
  const separated = image.originalBlobId !== null;
  const covered = image.edit.fit === "fill" && image.edit.transform.rotation === 0;

  /**
   * Pilih latar. Bila foto masih menutupi seluruh bingkai (mode Isi), latar tidak akan terlihat.
   * Tampilkan pilihan eksplisit alih-alih diam-diam berpindah ke mode Muat.
   */
  const set = (b: Background) => {
    if (covered && !separated) {
      setPendingBackground(b);
      return;
    }
    setBackground(b);
  };

  async function separateAndApply() {
    const pendingNow = useEditor.getState().pendingBackground;
    setBusy(true);
    setProgress({ label: "Menyiapkan…", pct: null });
    const ok = await runRemoveBackground(image!.id, (label, pct) => setProgress({ label, pct }));
    setBusy(false);
    setProgress(null);
    if (ok) {
      toastSuccess("Subjek dipisahkan. Latar foto sekarang memakai pilihan kamu.");
    } else {
      toastError("Subjek tidak bisa dipisahkan. Periksa koneksi lalu coba lagi.");
    }
    if (!ok && pendingNow) setPendingBackground(null);
  }

  /** Jalankan pemisahan subjek langsung dari kartu ajakan (tanpa latar tertunda). */
  async function runSeparate() {
    setBusy(true);
    setProgress({ label: "Menyiapkan…", pct: null });
    const ok = await runRemoveBackground(image!.id, (label, pct) => setProgress({ label, pct }));
    setBusy(false);
    setProgress(null);
    if (ok) {
      toastSuccess("Subjek dipisahkan. Pilih warna latar untuk menggantinya.");
    } else {
      toastError("Subjek tidak bisa dipisahkan. Periksa koneksi lalu coba lagi.");
    }
  }

  function keepPhotoAndAddSpace() {
    useEditor.getState().setFit("contain");
    const pendingNow = useEditor.getState().pendingBackground;
    if (pendingNow) {
      setBackground(pendingNow);
      setPendingBackground(null);
    }
    toastSuccess("Mode Muat diaktifkan. Latar mengisi ruang di sekeliling foto.");
  }

  return (
    <div className="space-y-4 p-4">
      {/* Kartu pilihan saat latar tidak terlihat (mode Isi) */}
      {pending && !busy && (
        <div className="space-y-2 rounded-lg bg-surface-mid p-3 shadow-xs">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-primary-600">●</span>
            <p className="text-xs font-semibold text-gray-900">Latar tidak akan terlihat pada mode Isi.</p>
          </div>
          <p className="text-[11px] leading-4 text-gray-500">
            Foto menutupi seluruh bingkai, jadi pilihan latar ({pending.kind === "solid" ? pending.color : "ini"}) belum tampak. Pilih
            cara menampilkannya:
          </p>
          <div className="space-y-1.5 pt-1">
            <button type="button" onClick={separateAndApply} className="btn-primary w-full justify-between!">
              <span className="flex items-center gap-2">
                <Scissors size={15} strokeWidth={1.5} />
                Pisahkan subjek, ganti latar foto
              </span>
              <span aria-hidden>›</span>
            </button>
            <p className="px-1 text-[10px] leading-4 text-gray-500">
              Subjek dipisahkan otomatis, lalu latar di dalam foto diganti. Model sekitar 40 MB diunduh sekali. Foto tidak diunggah.
            </p>
            <button type="button" onClick={keepPhotoAndAddSpace} className="btn-secondary w-full">
              Biarkan foto utuh, tambah ruang latar
            </button>
          </div>
          <button type="button" onClick={() => setPendingBackground(null)} className="text-[11px] text-gray-400 hover:text-gray-600">
            Batal
          </button>
        </div>
      )}

      {/* Progres pemisahan subjek */}
      {busy && progress && (
        <div className="well space-y-2 p-3">
          <p className="flex items-center gap-2 text-xs font-medium text-gray-900">
            <Loader2 size={13} className="animate-spin text-primary-600" />
            {progress.label}
            {progress.pct !== null ? <span className="code-label tabular font-semibold text-primary-600">{Math.round(progress.pct * 100)}%</span> : null}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-primary-600 transition-[width]"
              style={{ width: `${Math.round((progress.pct ?? 0.33) * 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-400">Jangan tutup tab ini sampai selesai.</p>
        </div>
      )}

      {/* Status subjek terpisah */}
      {separated && (
        <div className="well flex items-center justify-between gap-2 px-3 py-2">
          <span className="text-[11px] leading-4 text-gray-600">Subjek sudah dipisahkan. Latar diganti di dalam foto.</span>
          <button
            type="button"
            onClick={() => useEditor.getState().restoreOriginal().then((ok) => ok && toastSuccess("Foto asli dikembalikan."))}
            className="shrink-0 text-[11px] font-medium text-primary-600 hover:underline"
          >
            Kembalikan
          </button>
        </div>
      )}

      {/* Ajakan memisahkan subjek: tombol langsung menjalankan aksinya. */}
      {!separated && !pending && (
        <div className="well space-y-2 p-3">
          <p className="text-[11.5px] leading-4 text-gray-600">
            Ingin latar asli di dalam foto ikut berubah? Pisahkan subjek lebih dulu.
          </p>
          <button
            type="button"
            onClick={() => void runSeparate()}
            disabled={busy}
            className="btn-primary h-8! w-full! text-[11.5px]!"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Scissors size={13} strokeWidth={1.5} />}
            {busy ? "Memproses…" : "Pisahkan subjek sekarang"}
          </button>
          <p className="text-[10px] leading-4 text-gray-400">
            Model berjalan di perangkat. Setelah selesai, pilih warna latar dan hasilnya langsung terlihat.
          </p>
        </div>
      )}

      {/* Sub-tab jenis latar */}
      <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              tab === t ? "bg-gray-200 text-primary-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "solid" && (
        <div className="space-y-3">
          {/* Warna latar standar resmi Indonesia */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="micro-label font-semibold uppercase tracking-wider">Latar Resmi</span>
              <span className="code-label text-[10px]">Standar Indonesia</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {FORMAL_BACKGROUNDS.map((f) => (
                <button
                  key={f.color}
                  type="button"
                  title={`${f.label} — ${f.hint}`}
                  aria-label={`Latar ${f.label}`}
                  aria-pressed={bg.kind === "solid" && bg.color === f.color}
                  onClick={() => set({ kind: "solid", color: f.color })}
                  className={`flex h-8 items-center justify-center rounded-md border border-black/10 shadow-xs transition-opacity hover:opacity-90 ${
                    bg.kind === "solid" && bg.color === f.color ? "ring-2 ring-primary-600 ring-offset-2" : ""
                  }`}
                  style={{ background: f.color }}
                >
                  {bg.kind === "solid" && bg.color === f.color && (
                    <Check size={14} strokeWidth={2.5} className={f.color === "#FFFFFF" || f.color === "#64748B" ? "text-gray-900" : "text-white"} />
                  )}
                </button>
              ))}
            </div>
            <p className="text-[10px] leading-4 text-gray-400">
              Merah untuk KTP/SIM, biru untuk ijazah/CPNS, putih untuk paspor/visa.
            </p>
          </div>

          {palette.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="micro-label font-semibold uppercase tracking-wider">Dari Foto</span>
                <span className="code-label text-[10px]">Ekstraksi Otomatis</span>
              </div>
              <div className="well flex items-center justify-between p-2">
                {palette.map((c, i) => (
                  <button
                    key={`${c}-${i}`}
                    type="button"
                    title={c}
                    aria-label={`Warna dari foto ${c}`}
                    onClick={() => set({ kind: "solid", color: c })}
                    className={`h-7 w-7 rounded-full border border-black/10 shadow-xs transition-transform hover:scale-110 ${
                      bg.kind === "solid" && bg.color === c ? "ring-2 ring-primary-600 ring-offset-2" : ""
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          )}

          {SOLID_SWATCHES.map((g) => (
            <div key={g.group} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="micro-label font-semibold">{g.group}</span>
                <span className="code-label text-[10px]">{g.colors[0]}</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {g.colors.map((c, i) => (
                  <button
                    key={`${c}-${i}`}
                    type="button"
                    title={c}
                    aria-label={`Warna ${c}`}
                    onClick={() => set({ kind: "solid", color: c })}
                    className={`flex h-7 items-center justify-center rounded-md border border-black/10 shadow-xs transition-opacity hover:opacity-90 ${
                      bg.kind === "solid" && bg.color === c ? "ring-2 ring-primary-600" : ""
                    }`}
                    style={{ background: c }}
                  >
                    {bg.kind === "solid" && bg.color === c && <span className="h-1.5 w-1.5 rounded-full bg-white shadow-sm" />}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="well space-y-2 p-2.5">
            <span className="micro-label font-semibold">Warna Kustom</span>
            <HexColorPicker
              color={bg.kind === "solid" ? bg.color : "#FFFFFF"}
              onChange={(c) => set({ kind: "solid", color: c.toUpperCase() })}
            />
            <div className="flex items-center gap-2">
              <input
                aria-label="Warna heksadesimal"
                value={bg.kind === "solid" ? bg.color : "#FFFFFF"}
                onChange={(e) => {
                  const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                  if (isValidHex(v)) set({ kind: "solid", color: v.toUpperCase() });
                }}
                className="field tabular h-8 min-w-0 flex-1 font-mono text-xs uppercase"
              />
              {typeof window !== "undefined" && "EyeDropper" in window && (
                <button
                  type="button"
                  title="Ambil warna dari layar"
                  aria-label="Ambil warna dari layar"
                  onClick={async () => {
                    try {
                      type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };
                      const Ctor = (window as unknown as { EyeDropper: EyeDropperCtor }).EyeDropper;
                      const res = await new Ctor().open();
                      const rgb = hexToRgb(res.sRGBHex);
                      if (rgb) set({ kind: "solid", color: rgbToHex(rgb) });
                    } catch {
                      /* dibatalkan pengguna */
                    }
                  }}
                  className="btn-icon h-8 w-8 shrink-0 border border-gray-200 bg-white"
                >
                  <Pipette size={15} strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "gradient" && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1.5">
            {GRADIENT_PRESETS.map((g, i) => {
              const css = `linear-gradient(${g.angle}deg, ${g.stops.map((s) => `${s.color} ${s.at * 100}%`).join(", ")})`;
              const active = bg.kind === "gradient" && JSON.stringify(bg.stops) === JSON.stringify(g.stops);
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Gradien ${i + 1}`}
                  onClick={() => set({ kind: "gradient", stops: g.stops, angle: g.angle })}
                  className={`h-10 rounded-md border shadow-xs ${
                    active ? "border-primary-600 ring-2 ring-primary-600/40" : "border-gray-200"
                  }`}
                  style={{ background: css }}
                />
              );
            })}
          </div>
          {bg.kind === "gradient" && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="micro-label">Sudut</span>
                <span className="code-label tabular font-medium text-gray-900">{bg.angle}°</span>
              </div>
              <input
                type="range"
                aria-label="Sudut gradien"
                min={0}
                max={360}
                value={bg.angle}
                onChange={(e) => set({ ...bg, angle: Number(e.target.value) })}
                className="range"
              />
            </div>
          )}
        </div>
      )}

      {tab === "blur" && (
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="micro-label">Kekuatan</span>
              <span className="code-label tabular font-medium text-gray-900">{bg.kind === "blur" ? bg.amount : 0}</span>
            </div>
            <input
              type="range"
              aria-label="Kekuatan blur"
              min={0}
              max={100}
              value={bg.kind === "blur" ? bg.amount : 40}
              onChange={(e) => set({ kind: "blur", amount: Number(e.target.value), brightness: bg.kind === "blur" ? bg.brightness : 0 })}
              className="range"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="micro-label">Kecerahan</span>
              <span className="code-label tabular font-medium text-gray-900">{bg.kind === "blur" ? bg.brightness : 0}</span>
            </div>
            <input
              type="range"
              aria-label="Kecerahan blur"
              min={-50}
              max={50}
              value={bg.kind === "blur" ? bg.brightness : 0}
              onChange={(e) => set({ kind: "blur", amount: bg.kind === "blur" ? bg.amount : 40, brightness: Number(e.target.value) })}
              className="range"
            />
          </div>
          {bg.kind !== "blur" && (
            <button type="button" onClick={() => set({ kind: "blur", amount: 40, brightness: 0 })} className="btn-secondary w-full">
              Terapkan latar blur
            </button>
          )}
        </div>
      )}

      {tab === "transparent" && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => set({ kind: "transparent" })}
            className={`flex w-full items-center gap-3 rounded-lg border p-3 text-xs font-medium transition-colors ${
              bg.kind === "transparent" ? "border-primary-200 bg-primary-50 text-primary-700" : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <span className="checkerboard inline-block h-6 w-10 shrink-0 rounded-sm border border-gray-200" />
            Latar transparan
          </button>
          <p className="text-[11px] leading-4 text-gray-500">
            Hanya tersimpan pada PNG dan WebP. Ekspor JPEG akan mengisi area kosong dengan putih.
          </p>
        </div>
      )}

      {tab === "image" && (
        <div className="well space-y-2 p-3">
          <label className="micro-label block" htmlFor="bg-image">
            Pilih gambar latar
          </label>
          <input
            id="bg-image"
            type="file"
            accept="image/*"
            className="w-full text-xs text-gray-600"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const blobId = crypto.randomUUID();
              await saveBlob(blobId, f).catch(() => {});
              set({ kind: "image", blobId });
            }}
          />
        </div>
      )}

      {/* Pemisahan subjek AI */}
      <div className="space-y-3 border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between">
          <h4 className="section-title">Pemisahan Subjek AI</h4>
          <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">On-device</span>
        </div>
        <RemoveBackgroundPanel />
      </div>
    </div>
  );
}
