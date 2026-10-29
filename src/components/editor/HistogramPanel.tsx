"use client";

/**
 * Panel histogram dengan kontrol Levels interaktif.
 *
 * Semua koreksi bersifat NON-DESTRUKTIF: nilai levels disimpan di `edit.adjust`
 * sebagai bagian dari proyek, sehingga:
 * - bisa di-undo/redo seperti perubahan lain
 * - ikut ke hasil ekspor tanpa mengubah foto asli
 * - bisa disetel ulang kapan saja
 *
 * Garis hitam/putih/gamma di grafik bisa ditarik langsung, sama seperti Levels
 * di Photoshop.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toastSuccess, toastError } from "../../lib/toast";
import { Info, RotateCcw, Wand2 } from "lucide-react";
import { useEditor } from "../../store/editor";
import { useSliderHistory } from "./useSliderHistory";
import {
  computeAutoLevels,
  computeHistogram,
  computeAutoWhiteBalance,
  describeHistogram,
  detectClipping,
  histogramPeak,
  type Histogram,
} from "../../lib/histogram";
import { DEFAULT_ADJUST } from "../../lib/geometry";

/** Ukuran sampel analisis; cukup akurat dan cepat. */
const SAMPLE = 256;
/** Grafik digambar pada resolusi tetap agar posisi garis presisi. */
const GRAPH_W = 256;
const GRAPH_H = 76;

type Channel = "lum" | "rgb";
type Handle = "black" | "gamma" | "white" | null;

export default function HistogramPanel() {
  const image = useEditor((s) => s.images.find((e) => e.id === s.activeId));
  const setAdjust = useEditor((s) => s.setAdjust);
  const pushHistoryNow = useEditor((s) => s.pushHistoryNow);
  const slider = useSliderHistory();
  const [hist, setHist] = useState<Histogram | null>(null);
  const [channel, setChannel] = useState<Channel>("lum");
  const [dragging, setDragging] = useState<Handle>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bitmap = image?.bitmap ?? null;
  const adjust = image?.edit.adjust;

  const black = adjust?.levelBlack ?? 0;
  const gamma = adjust?.levelGamma ?? 1;
  const white = adjust?.levelWhite ?? 255;
  const levelsActive = black !== 0 || white !== 255 || gamma !== 1;

  // Histogram dihitung dari foto ASLI (tanpa penyesuaian) agar garis levels
  // tetap punya acuan yang stabil saat slider digeser.
  useEffect(() => {
    let alive = true;
    if (!bitmap) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHist(null);
      return;
    }
    const w = Math.min(SAMPLE, bitmap.width);
    const h = Math.max(1, Math.round((w * bitmap.height) / bitmap.width));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Bitmap bisa sudah dilepas bila foto diganti saat proses berjalan.
    try {
      ctx.drawImage(bitmap, 0, 0, w, h);
    } catch {
      return;
    }
    const data = ctx.getImageData(0, 0, w, h);
    if (!alive) return;
    setHist(computeHistogram(data));
    return () => {
      alive = false;
    };
  }, [bitmap]);

  // Gambar grafik + garis levels.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hist) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = GRAPH_W * dpr;
    canvas.height = GRAPH_H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, GRAPH_W, GRAPH_H);

    const drawSeries = (arr: Uint32Array, color: string, alpha = 1) => {
      const peak = histogramPeak(arr) || 1;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, GRAPH_H);
      for (let i = 0; i < 256; i++) {
        // Skala akar agar puncak tinggi tidak menenggelamkan detail kecil.
        const v = Math.sqrt(arr[i] / peak);
        ctx.lineTo(i, GRAPH_H - v * (GRAPH_H - 4));
      }
      ctx.lineTo(255, GRAPH_H);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    if (channel === "lum") {
      drawSeries(hist.lum, "#475569");
    } else {
      drawSeries(hist.r, "#ef4444", 0.5);
      drawSeries(hist.g, "#22c55e", 0.5);
      drawSeries(hist.b, "#3b82f6", 0.5);
    }

    // Area di luar rentang levels diredupkan agar user melihat efeknya.
    if (levelsActive) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.18)";
      if (black > 0) ctx.fillRect(0, 0, black, GRAPH_H);
      if (white < 255) ctx.fillRect(white, 0, GRAPH_W - white, GRAPH_H);
    }

    // Garis hitam, gamma, putih.
    const drawLine = (x: number, color: string, dashed: boolean) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = dashed ? 1 : 1.5;
      ctx.setLineDash(dashed ? [3, 3] : []);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, GRAPH_H);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    drawLine(black, "#0f172a", false);
    // Posisi garis gamma: gamma g berarti nilai input t dengan t^(1/g) = 0.5,
    // sehingga t = 0.5^g. Ini membuat garis bergeser sesuai efek nyatanya.
    const gammaT = Math.pow(0.5, gamma);
    const gammaPos = black + (white - black) * gammaT;
    drawLine(gammaPos, "#94a3b8", true);
    drawLine(white, "#ffffff", false);
  }, [hist, channel, black, gamma, white, levelsActive]);

  const clip = useMemo(() => (hist ? detectClipping(hist) : null), [hist]);
  const summary = useMemo(() => (hist ? describeHistogram(hist) : ""), [hist]);

  /** Ubah nilai levels (non-destruktif, bisa di-undo). */
  const setLevels = useCallback(
    (patch: { levelBlack?: number; levelGamma?: number; levelWhite?: number }, commit = false) => {
      setAdjust(patch, commit);
    },
    [setAdjust],
  );

  /** Auto Levels: hitung dari histogram lalu terapkan sebagai nilai levels. */
  const runAutoLevels = useCallback(() => {
    if (!image) return;
    const img = image.bitmap;
    if (!img) return;
    const w = Math.min(SAMPLE, img.width);
    const h = Math.max(1, Math.round((w * img.height) / img.width));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Bitmap bisa sudah dilepas bila foto diganti saat proses berjalan.
    try {
      ctx.drawImage(img, 0, 0, w, h);
    } catch {
      toastError("Foto sedang dimuat ulang. Coba lagi sebentar.");
      return;
    }
    const levels = computeAutoLevels(computeHistogram(ctx.getImageData(0, 0, w, h)));
    // Kekuatan dilembutkan: hanya menerapkan 55% dari rentang usulan agar
    // hasilnya natural dan tidak "jomplang" seperti auto yang agresif.
    const STRENGTH = 0.55;
    const b = Math.round(levels.black * STRENGTH);
    const wv = Math.round(255 - (255 - levels.white) * STRENGTH);
    const g = 1 + (levels.gamma - 1) * STRENGTH;
    pushHistoryNow("Auto Levels");
    setLevels({ levelBlack: b, levelGamma: Number(g.toFixed(2)), levelWhite: wv });
    toastSuccess(`Auto Levels lembut: hitam ${b}, putih ${wv}. Geser garis di grafik untuk menyesuaikan.`);
  }, [image, pushHistoryNow, setLevels]);

  /** Auto Warna: hitung gain white balance lalu ubah suhu agar setara. */
  const runAutoColor = useCallback(() => {
    if (!image) return;
    const img = image.bitmap;
    if (!img) return;
    const w = Math.min(SAMPLE, img.width);
    const h = Math.max(1, Math.round((w * img.height) / img.width));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Bitmap bisa sudah dilepas bila foto diganti saat proses berjalan.
    try {
      ctx.drawImage(img, 0, 0, w, h);
    } catch {
      toastError("Foto sedang dimuat ulang. Coba lagi sebentar.");
      return;
    }
    const wb = computeAutoWhiteBalance(ctx.getImageData(0, 0, w, h));
    if (!wb.needed) {
      toastSuccess("Warna sudah netral, tidak perlu dikoreksi.");
      return;
    }
    // Konversi rasio gain merah/biru menjadi nilai suhu (-100..100), dengan
    // kekuatan dibatasi agar tidak mengubah tampilan secara drastis.
    const ratio = wb.gains[0] / Math.max(0.01, wb.gains[2]);
    const temp = Math.max(-100, Math.min(100, Math.round((ratio - 1) * 70)));
    pushHistoryNow("Auto Warna");
    setAdjust({ temperature: temp }, false);
    toastSuccess("White balance otomatis diterapkan. Geser slider Suhu untuk menyesuaikan.");
  }, [image, pushHistoryNow, setAdjust]);

  const resetLevels = useCallback(() => {
    pushHistoryNow("Setel ulang levels");
    setAdjust(
      {
        levelBlack: DEFAULT_ADJUST.levelBlack,
        levelGamma: DEFAULT_ADJUST.levelGamma,
        levelWhite: DEFAULT_ADJUST.levelWhite,
      },
      false,
    );
  }, [pushHistoryNow, setAdjust]);

  /** Konversi posisi pointer ke nilai 0..255. */
  const posToValue = useCallback((clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.round(Math.min(1, Math.max(0, ratio)) * 255);
  }, []);

  /** Drag garis di grafik. */
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const v = posToValue(e.clientX);
      // Pilih handle terdekat.
      const dBlack = Math.abs(v - black);
      const dWhite = Math.abs(v - white);
      const mid = black + (white - black) / 2;
      const dGamma = Math.abs(v - mid);
      const nearest: Handle = dBlack <= dWhite && dBlack <= dGamma ? "black" : dWhite <= dGamma ? "white" : "gamma";
      setDragging(nearest);
      pushHistoryNow("Ubah levels");
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [black, white, posToValue, pushHistoryNow],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragging) return;
      const v = posToValue(e.clientX);
      if (dragging === "black") setLevels({ levelBlack: Math.min(v, white - 8) });
      else if (dragging === "white") setLevels({ levelWhite: Math.max(v, black + 8) });
      else {
        // Dari posisi relatif t, gamma = log(t) / log(0.5) sehingga t = 0.5^gamma.
        const t = (v - black) / Math.max(1, white - black);
        const clamped = Math.min(0.92, Math.max(0.08, t));
        const g = Math.log(clamped) / Math.log(0.5);
        setLevels({ levelGamma: Number(Math.min(3, Math.max(0.33, g)).toFixed(2)) });
      }
    },
    [dragging, black, white, posToValue, setLevels],
  );

  const onPointerUp = useCallback(() => setDragging(null), []);

  if (!image) return null;

  return (
    <div className="space-y-3 border-t border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <h3 className="section-title">Histogram</h3>
        <div className="seg">
          <button type="button" onClick={() => setChannel("lum")} aria-pressed={channel === "lum"} className="seg-item h-6! px-2! text-[10px]!">
            Cahaya
          </button>
          <button type="button" onClick={() => setChannel("rgb")} aria-pressed={channel === "rgb"} className="seg-item h-6! px-2! text-[10px]!">
            RGB
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <canvas
          ref={canvasRef}
          className={`block h-[76px] w-full touch-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
          aria-label="Grafik histogram foto, garis levels bisa ditarik"
          role="img"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      {/* Nilai levels aktif */}
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span className="tabular">
          Hitam <span className="font-semibold text-gray-900">{black}</span>
        </span>
        <span className="tabular">
          Gamma <span className="font-semibold text-gray-900">{gamma.toFixed(2)}</span>
        </span>
        <span className="tabular">
          Putih <span className="font-semibold text-gray-900">{white}</span>
        </span>
      </div>

      {/* Slider manual untuk kontrol presisi */}
      <div className="space-y-2">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="micro-label">Titik Hitam</span>
            <span className="code-label tabular">{black}</span>
          </div>
          <input
            type="range"
            aria-label="Titik hitam"
            min={0}
            max={254}
            value={black}
            onChange={(e) => {
              const nilai = Math.min(Number(e.target.value), white - 8);
              slider.change((commit) => setLevels({ levelBlack: nilai }, commit));
            }}
            onPointerDown={slider.onPointerDown}
            onPointerUp={slider.endGesture}
            onPointerCancel={slider.endGesture}
            className="range"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="micro-label">Gamma (Midtone)</span>
            <span className="code-label tabular">{gamma.toFixed(2)}</span>
          </div>
          <input
            type="range"
            aria-label="Gamma"
            min={33}
            max={300}
            value={Math.round(gamma * 100)}
            onChange={(e) => {
              const nilai = Number((Number(e.target.value) / 100).toFixed(2));
              slider.change((commit) => setLevels({ levelGamma: nilai }, commit));
            }}
            onPointerDown={slider.onPointerDown}
            onPointerUp={slider.endGesture}
            onPointerCancel={slider.endGesture}
            className="range"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="micro-label">Titik Putih</span>
            <span className="code-label tabular">{white}</span>
          </div>
          <input
            type="range"
            aria-label="Titik putih"
            min={1}
            max={255}
            value={white}
            onChange={(e) => {
              const nilai = Math.max(Number(e.target.value), black + 8);
              slider.change((commit) => setLevels({ levelWhite: nilai }, commit));
            }}
            onPointerDown={slider.onPointerDown}
            onPointerUp={slider.endGesture}
            onPointerCancel={slider.endGesture}
            className="range"
          />
        </div>
      </div>

      {/* Indikator clipping */}
      {clip && (
        <div className="flex items-center justify-between text-[10px]">
          <span className="flex items-center gap-1.5 text-gray-500">
            <span className="h-2 w-2 rounded-sm bg-gray-900" aria-hidden />
            <span className="tabular">Gelap {clip.lumBlackPct.toFixed(1)}%</span>
          </span>
          <span className="flex items-center gap-1.5 text-gray-500">
            <span className="tabular">Terang {clip.lumWhitePct.toFixed(1)}%</span>
            <span className="h-2 w-2 rounded-sm bg-white ring-1 ring-gray-300" aria-hidden />
          </span>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11px] leading-4 text-gray-500">
        <Info size={12} strokeWidth={1.5} className="mt-0.5 shrink-0 text-gray-400" aria-hidden />
        {summary}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={runAutoLevels} className="btn-secondary">
          <Wand2 size={14} strokeWidth={1.5} />
          Auto Levels
        </button>
        <button type="button" onClick={runAutoColor} className="btn-secondary">
          <Wand2 size={14} strokeWidth={1.5} />
          Auto Warna
        </button>
      </div>

      {levelsActive && (
        <button type="button" onClick={resetLevels} className="btn-reset-block">
          <RotateCcw size={14} strokeWidth={1.5} />
          Setel ulang levels
        </button>
      )}

      <p className="text-[10px] leading-4 text-gray-400">
        Tarik garis di grafik untuk mengatur titik hitam, gamma, dan titik putih. Semua perubahan bisa dibatalkan dengan Undo dan
        tidak mengubah foto asli.
      </p>
    </div>
  );
}
