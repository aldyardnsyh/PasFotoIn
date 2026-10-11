"use client";

import { useEffect, useRef, useState } from "react";
import { toastSuccess, toastError } from "../../lib/toast";
import { Eye, Lock, RefreshCw, Scissors } from "lucide-react";
import { useEditor } from "../../store/editor";
import { preloadModel } from "../../lib/separate";

type Stage = "idle" | "busy" | "error";

const MODELS = [
  { id: "fast" as const, label: "Cepat", size: "42 MB", hint: "Untuk percobaan dan foto sederhana" },
  { id: "balanced" as const, label: "Seimbang", size: "84 MB", hint: "Kualitas lebih baik, unduhan sedang" },
  { id: "best" as const, label: "Terbaik", size: "168 MB", hint: "Tepi paling halus, unduhan paling besar" },
];

export default function RemoveBackgroundPanel() {
  const image = useEditor((s) => s.images.find((e) => e.id === s.activeId));
  const runRemoveBackground = useEditor((s) => s.runRemoveBackground);
  const restoreOriginal = useEditor((s) => s.restoreOriginal);
  const qualityModel = useEditor((s) => s.qualityModel);
  const setQualityModel = useEditor((s) => s.setQualityModel);
  const refineStrength = useEditor((s) => s.refineStrength);
  const setRefineStrength = useEditor((s) => s.setRefineStrength);
  const [stage, setStage] = useState<Stage>("idle");
  const [label, setLabel] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Penghitung waktu proses: memberi umpan balik bahwa aplikasi masih bekerja,
  // terutama saat tahap tanpa persentase (inisialisasi model).
  useEffect(() => {
    if (stage !== "busy") return;
    const start = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - start) / 100) / 10), 100);
    return () => clearInterval(timer);
  }, [stage]);

  if (!image) return null;
  const cut = image.originalBlobId !== null;

  async function run() {
    const id = image!.id;
    setStage("busy");
    setPct(null);
    setLabel("Menyiapkan…");
    const started = Date.now();
    const ok = await runRemoveBackground(id, (l, p) => {
      if (!alive.current) return;
      setLabel(l);
      setPct(p);
    });
    if (!alive.current) return;
    if (ok) {
      setStage("idle");
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      toastSuccess(`Subjek dipisahkan dalam ${secs} detik. Pilih warna latar untuk menggantinya.`);
    } else {
      setStage("error");
    }
  }

  async function restore() {
    const ok = await restoreOriginal();
    if (ok) toastSuccess("Foto asli dikembalikan.");
    else toastError("Foto asli tidak ditemukan di penyimpanan lokal.");
  }

  if (cut) {
    return (
      <div className="space-y-4">
        <p className="text-xs leading-5 text-gray-500">
          Subjek sudah dipisahkan dari latar asli. Pilih warna atau gradien di atas untuk latar barunya. Tepi yang belum rapi bisa
          diperbaiki dengan memisahkan ulang memakai kualitas seleksi yang lebih tinggi.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={run} disabled={stage === "busy"} className="btn-secondary">
            <RefreshCw size={15} strokeWidth={1.5} />
            Pisahkan Ulang
          </button>
          <button type="button" onClick={restore} className="btn-secondary">
            <Eye size={15} strokeWidth={1.5} />
            Foto Asli
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs leading-5 text-gray-500">
        Subjek dipisahkan otomatis dari latar, lalu latar foto bisa kamu ganti. Model diunduh sekali saat pertama kali, lalu
        disimpan di perangkat. Foto tidak diunggah ke mana pun.
      </p>

      <div>
        <h4 className="micro-label mb-2 font-semibold">Kualitas Seleksi:</h4>
        <div className="space-y-1.5">
          {MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setQualityModel(m.id);
                // Mulai unduh model begitu kualitas dipilih agar siap saat tombol ditekan.
                preloadModel(m.id);
              }}
              aria-pressed={qualityModel === m.id}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                qualityModel === m.id ? "border-primary-600/40 bg-gray-100 ring-1 ring-primary-600/40" : "border-gray-200 bg-gray-50 hover:bg-gray-100"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold ${qualityModel === m.id ? "text-primary-700" : "text-gray-900"}`}>
                  {m.label} ({m.size})
                </span>
                {m.id === "balanced" && (
                  <span className="rounded bg-primary-600 px-1 text-[9px] font-medium text-white">Rekomendasi</span>
                )}
              </span>
              <span className="mt-0.5 block text-[11px] leading-4 text-gray-500">{m.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h4 className="micro-label mb-2 font-semibold">Perapian Tepi (Feather):</h4>
        <div className="seg">
          {(
            [
              { id: "off" as const, label: "Mati" },
              { id: "light" as const, label: "Ringan" },
              { id: "strong" as const, label: "Kuat" },
            ]
          ).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRefineStrength(r.id)}
              aria-pressed={refineStrength === r.id}
              className="seg-item"
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] leading-4 text-gray-500">
          Membersihkan bercak, memadatkan area tebal yang salah transparan (mis. pakaian gelap), dan menyelaraskan tepi
          dengan detail asli foto. Rambut dan tepi halus tetap utuh.
        </p>
      </div>

      {stage === "busy" ? (
        <div className="well space-y-2 p-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-900">
              <span className="h-2 w-2 animate-ping rounded-full bg-primary-600" />
              {label}
            </span>
            <span className="code-label tabular font-semibold text-primary-600">
              {pct !== null ? `${Math.round(pct * 100)}%` : `${elapsed.toFixed(1)}s`}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            {pct !== null ? (
              <div className="h-full rounded-full bg-primary-600 transition-[width]" style={{ width: `${pct * 100}%` }} />
            ) : (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-primary-600" />
            )}
          </div>
          <p className="flex items-center gap-1 text-[11px] leading-4 text-gray-400">
            <Lock size={12} strokeWidth={1.5} aria-hidden />
            Berjalan di latar belakang, kamu masih bisa memakai panel lain.
          </p>
        </div>
      ) : (
        <button type="button" onClick={run} className="btn-primary h-10! w-full! text-[13px]!">
          <Scissors size={16} strokeWidth={1.5} />
          {stage === "error" ? "Coba lagi" : "Pisahkan Subjek"}
        </button>
      )}
      {stage === "error" && (
        <p className="text-xs text-danger">Subjek tidak bisa dipisahkan. Periksa koneksi lalu coba lagi.</p>
      )}
    </div>
  );
}
