"use client";

import { useState } from "react";
import { toastSuccess, toastError } from "../../lib/toast";
import { RotateCcw, Wand2 } from "lucide-react";
import { useEditor } from "../../store/editor";
import type { Adjust } from "../../lib/geometry";
import { estimateWhiteBalance } from "../../lib/adjust";

type Slider = {
  key: keyof Adjust;
  label: string;
  hint: string;
};

const SLIDERS: Slider[] = [
  { key: "exposure", label: "Eksposur", hint: "Keseluruhan terang gelap" },
  { key: "contrast", label: "Kontras", hint: "Perbedaan terang dan gelap" },
  { key: "highlights", label: "Sorotan", hint: "Area terang, minus untuk menahan" },
  { key: "shadows", label: "Bayangan", hint: "Area gelap, plus untuk membuka" },
  { key: "saturation", label: "Saturasi", hint: "Kepekatan warna" },
  { key: "temperature", label: "Suhu", hint: "Biru ke dingin, kuning ke hangat" },
];

export default function AdjustPanel() {
  const image = useEditor((s) => s.images.find((e) => e.id === s.activeId));
  const setAdjust = useEditor((s) => s.setAdjust);
  const resetAdjust = useEditor((s) => s.resetAdjust);
  const pushHistoryNow = useEditor((s) => s.pushHistoryNow);
  const [autoBusy, setAutoBusy] = useState(false);

  if (!image) return null;
  const a = image.edit.adjust;

  async function autoWhiteBalance() {
    if (!image?.bitmap) return;
    setAutoBusy(true);
    try {
      const bmp = image.bitmap;
      // Sampel kecil cukup untuk estimasi gray-world.
      const w = 160;
      const h = Math.max(1, Math.round((w * bmp.height) / bmp.width));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // Bitmap bisa sudah dilepas bila foto diganti saat proses berjalan.
      try {
        ctx.drawImage(bmp, 0, 0, w, h);
      } catch {
        toastError("Foto sedang dimuat ulang. Coba lagi sebentar.");
        return;
      }
      const t = estimateWhiteBalance(ctx.getImageData(0, 0, w, h));
      pushHistoryNow();
      setAdjust({ temperature: t }, false);
      toastSuccess(t === 0 ? "Warna sudah netral." : `Suhu disetel ke ${t > 0 ? "+" : ""}${t}.`);
    } finally {
      setAutoBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="section-title">Cahaya dan Warna</h3>
        <button
          type="button"
          onClick={autoWhiteBalance}
          disabled={autoBusy}
          title="Setel suhu otomatis agar warna netral"
          className="btn-secondary h-7! px-2.5!"
        >
          <Wand2 size={13} strokeWidth={1.5} />
          White balance otomatis
        </button>
      </div>

      {SLIDERS.map((s) => (
        <label key={s.key} className="block">
          <span className="flex items-baseline justify-between">
            <span className="micro-label">{s.label}</span>
            <span className="code-label tabular font-medium text-gray-900">
              {a[s.key] > 0 ? "+" : ""}
              {a[s.key]}
            </span>
          </span>
          <input
            type="range"
            aria-label={s.label}
            min={-100}
            max={100}
            value={a[s.key]}
            onChange={(e) => setAdjust({ [s.key]: Number(e.target.value) } as Partial<Adjust>, false)}
            onPointerDown={() => pushHistoryNow()}
            className="range"
          />
          <span className="block text-[11px] leading-4 text-gray-400">{s.hint}</span>
        </label>
      ))}

      <button type="button" onClick={resetAdjust} className="btn-reset-block">
        <RotateCcw size={14} strokeWidth={1.5} />
        Setel ulang cahaya dan warna
      </button>

      <p className="text-[11px] leading-4 text-gray-400">
        Penyesuaian ikut tersimpan di proyek dan diterapkan saat ekspor. Foto sumber tidak diubah.
      </p>
    </div>
  );
}
