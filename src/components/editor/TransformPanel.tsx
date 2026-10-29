"use client";

import { useEffect, useState } from "react";
import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from "lucide-react";
import { useEditor } from "../../store/editor";
import { useSliderHistory } from "./useSliderHistory";

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;

export default function TransformPanel() {
  const image = useEditor((s) => s.images.find((e) => e.id === s.activeId));
  const setTransform = useEditor((s) => s.setTransform);
  const pushHistoryNow = useEditor((s) => s.pushHistoryNow);
  const slider = useSliderHistory();
  const [scaleText, setScaleText] = useState("");

  const scale = image?.edit.transform.scale ?? 1;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScaleText(String(Math.round(scale * 100)));
  }, [scale]);

  if (!image) return null;
  const t = image.edit.transform;
  const min = image.edit.fit === "fill" ? 1 : MIN_SCALE;

  function commitScale(next: number) {
    if (!image) return;
    pushHistoryNow();
    setTransform({ scale: Math.min(MAX_SCALE, Math.max(min, next)) }, false);
  }

  return (
    <div className="space-y-4 p-4">
      <h3 className="section-title">Transformasi Foto</h3>

      {/* Zoom */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="micro-label">Zoom Skala</span>
          <span className="code-label tabular font-medium text-gray-900">{Math.round(scale * 100)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            aria-label="Zoom"
            min={Math.round(min * 100)}
            max={MAX_SCALE * 100}
            value={Math.round(scale * 100)}
            onChange={(e) => {
              const nilai = Number(e.target.value) / 100;
              slider.change((commit) => setTransform({ scale: nilai }, commit));
            }}
            onPointerDown={slider.onPointerDown}
            onPointerUp={slider.endGesture}
            onPointerCancel={slider.endGesture}
            className="range min-w-0 flex-1"
          />
          <div className="flex h-8 w-20 shrink-0 items-center rounded-md border border-gray-200 bg-white px-2">
            <input
              aria-label="Zoom persen"
              value={scaleText}
              inputMode="numeric"
              onChange={(e) => setScaleText(e.target.value)}
              onBlur={() => {
                const v = parseFloat(scaleText);
                if (Number.isFinite(v)) commitScale(v / 100);
                else setScaleText(String(Math.round(scale * 100)));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="tabular w-full min-w-0 text-right text-xs text-gray-900 outline-none"
            />
            <span className="text-xs text-gray-500">%</span>
          </div>
        </div>
      </div>

      {/* Rotasi */}
      <div>
        <span className="micro-label mb-1 block">Rotasi &amp; Pembalikan</span>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => useEditor.getState().rotate(-90)} className="btn-secondary">
            <RotateCcw size={15} strokeWidth={1.5} />
            90° Kiri
          </button>
          <button type="button" onClick={() => useEditor.getState().rotate(90)} className="btn-secondary">
            <RotateCw size={15} strokeWidth={1.5} />
            90° Kanan
          </button>
        </div>
      </div>

      {/* Kemiringan bebas */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="micro-label">Kemiringan Bebas</span>
          <span className="code-label tabular font-medium text-gray-900">
            {t.rotation > 0 ? "+" : ""}
            {Math.round(t.rotation)}°
          </span>
        </div>
        <input
          type="range"
          aria-label="Sudut bebas"
          min={-45}
          max={45}
          step={1}
          value={Math.round(t.rotation)}
          onChange={(e) => {
            const nilai = Number(e.target.value);
            slider.change((commit) => setTransform({ rotation: nilai }, commit));
          }}
          onPointerDown={slider.onPointerDown}
          onPointerUp={slider.endGesture}
          onPointerCancel={slider.endGesture}
          className="range"
        />
      </div>

      {/* Balik */}
      <div>
        <span className="micro-label mb-1 block">Balik</span>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => useEditor.getState().flip("x")}
            aria-pressed={t.flipX}
            className={`flex h-8 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors ${
              t.flipX ? "border-primary-200 bg-primary-50 text-primary-700" : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <FlipHorizontal2 size={15} strokeWidth={1.5} />
            Horizontal
          </button>
          <button
            type="button"
            onClick={() => useEditor.getState().flip("y")}
            aria-pressed={t.flipY}
            className={`flex h-8 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors ${
              t.flipY ? "border-primary-200 bg-primary-50 text-primary-700" : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <FlipVertical2 size={15} strokeWidth={1.5} />
            Vertikal
          </button>
        </div>
      </div>

      <button type="button" onClick={() => useEditor.getState().reset()} className="btn-reset-block">
        <RotateCcw size={14} strokeWidth={1.5} />
        Atur ulang transformasi
      </button>

      <p className="text-[11px] leading-4 text-gray-400">
        Geser foto langsung di kanvas. Panduan tengah dan 1/3 bisa dinyalakan dari bilah bawah kanvas.
      </p>
    </div>
  );
}
