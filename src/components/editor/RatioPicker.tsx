"use client";

import { useState } from "react";
import { ArrowLeftRight, BadgeCheck, Frame, Globe, Maximize, Puzzle } from "lucide-react";
import { useEditor } from "../../store/editor";
import { FORMAL_DOCUMENT_PRESETS, RATIO_PRESETS } from "../../lib/presets";

function RatioGlyph({ w, h, active }: { w: number; h: number; active: boolean }) {
  const max = 22;
  const r = w / h;
  let dw: number, dh: number;
  if (r >= 1) {
    dw = max;
    dh = Math.max(5, max / r);
  } else {
    dh = max;
    dw = Math.max(5, max * r);
  }
  return (
    <svg width={max} height={max} viewBox={`0 0 ${max} ${max}`} aria-hidden>
      <rect
        x={(max - dw) / 2}
        y={(max - dh) / 2}
        width={dw}
        height={dh}
        rx={2}
        fill={active ? "#2563EB" : "none"}
        stroke={active ? "#2563EB" : "#94A3B8"}
        strokeWidth={1.5}
      />
    </svg>
  );
}

const GROUP_ICON = {
  "Media sosial": Globe,
  Marketplace: Puzzle,
  Dokumen: BadgeCheck,
} as const;

export default function RatioPicker() {
  const image = useEditor((s) => s.images.find((e) => e.id === s.activeId));
  const setRatio = useEditor((s) => s.setRatio);
  const [customW, setCustomW] = useState("4");
  const [customH, setCustomH] = useState("5");

  if (!image) return null;
  const general = RATIO_PRESETS.filter((p) => p.group === "Umum");
  const docs = RATIO_PRESETS.filter((p) => p.group === "Dokumen");
  const intl = RATIO_PRESETS.filter((p) => p.group === "Internasional");
  const social = RATIO_PRESETS.filter((p) => p.group === "Media sosial" || p.group === "Marketplace");

  return (
    <div className="space-y-5 p-4">
      {/* 0. Pintasan dokumen resmi Indonesia */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="section-title">Dokumen Resmi</h3>
          <span className="section-hint">Sekali klik</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FORMAL_DOCUMENT_PRESETS.map((d) => {
            const target = RATIO_PRESETS.find((p) => p.id === d.presetId);
            if (!target) return null;
            const active = image.edit.presetId === target.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setRatio(target.w, target.h, target.id);
                  useEditor.getState().setBackground({ kind: "solid", color: d.color });
                  // Dokumen resmi memakai mode Muat agar latar terlihat di sekeliling foto.
                  useEditor.getState().setFit("contain");
                }}
                aria-pressed={active}
                title={`${d.label} · latar ${d.hint}`}
                className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium transition-colors ${
                  active ? "bg-primary-600 text-white shadow-xs" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
                  style={{ background: d.color }}
                  aria-hidden
                />
                {d.label}
                <span className={active ? "text-white/70" : "text-gray-400"}>{d.hint.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] leading-4 text-gray-400">
          Mengatur rasio, warna latar resmi, dan mode Muat sekaligus.
        </p>
      </section>

      {/* 1. Preset rasio proporsional */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="section-title">Preset Rasio</h3>
          <span className="section-hint">Standar Foto</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {general.map((p) => {
            const active = image.edit.presetId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setRatio(p.w, p.h, p.id)}
                aria-pressed={active}
                title={p.px ? `${p.label} · ${p.px[0]} x ${p.px[1]}` : p.label}
                className="chip"
              >
                <RatioGlyph w={p.w} h={p.h} active={active} />
                <span className="tabular">{p.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Preset dokumen & media sosial dalam daftar informatif */}
      <section className="space-y-3">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="section-title">Dokumen Indonesia</h3>
            <span className="section-hint">cm &middot; 300 dpi</span>
          </div>
          <div className="space-y-1.5">
            {docs.map((p) => {
              const active = image.edit.presetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setRatio(p.w, p.h, p.id)}
                  aria-pressed={active}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                    active ? "border-primary-200 bg-primary-50" : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                  }`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className={`text-[11px] font-semibold ${active ? "text-primary-700" : "text-gray-900"}`}>
                      {p.label.replace("Pas foto ", "")}
                      {p.mm ? ` cm` : ""}
                    </span>
                    <span className="truncate text-[10px] text-gray-400">{p.note}</span>
                  </span>
                  <span className="code-label shrink-0 tabular">
                    {p.mm ? `${p.mm[0]}×${p.mm[1]}mm` : ""}
                    {p.px ? ` · ${p.px[0]}×${p.px[1]}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="section-title">Internasional</h3>
            <span className="section-hint">ICAO 9303</span>
          </div>
          <div className="space-y-1.5">
            {intl.map((p) => {
              const active = image.edit.presetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setRatio(p.w, p.h, p.id)}
                  aria-pressed={active}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                    active ? "border-primary-200 bg-primary-50" : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                  }`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className={`text-[11px] font-semibold ${active ? "text-primary-700" : "text-gray-900"}`}>{p.label}</span>
                    <span className="truncate text-[10px] text-gray-400">{p.note}</span>
                  </span>
                  <span className="code-label shrink-0 tabular">
                    {p.mm ? `${p.mm[0]}×${p.mm[1]}mm` : ""}
                    {p.px ? ` · ${p.px[0]}×${p.px[1]}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="section-title">Media Sosial</h3>
            <span className="section-hint">piksel</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {social.map((p) => {
              const active = image.edit.presetId === p.id;
              const Icon = GROUP_ICON[p.group as keyof typeof GROUP_ICON];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setRatio(p.w, p.h, p.id)}
                  aria-pressed={active}
                  title={p.px ? `${p.label} · ${p.px[0]} x ${p.px[1]}` : p.label}
                  className={`flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors ${
                    active ? "bg-primary-600 text-white shadow-xs" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {Icon && <Icon size={13} strokeWidth={1.5} aria-hidden />}
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Ukuran kustom */}
      <section>
        <h3 className="section-title mb-2">Ukuran Kustom</h3>
        <div className="well space-y-2 p-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 flex-1 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2">
              <span className="micro-label">L</span>
              <input
                aria-label="Lebar rasio"
                value={customW}
                onChange={(e) => setCustomW(e.target.value)}
                inputMode="numeric"
                className="tabular w-full min-w-0 bg-transparent text-xs text-gray-900 outline-none"
              />
            </div>
            <button
              type="button"
              title="Tukar orientasi"
              aria-label="Tukar orientasi"
              onClick={() => {
                setCustomW(customH);
                setCustomH(customW);
              }}
              className="btn-icon h-8 w-8 shrink-0 border border-gray-200 bg-white"
            >
              <ArrowLeftRight size={15} strokeWidth={1.5} />
            </button>
            <div className="flex h-8 flex-1 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2">
              <span className="micro-label">T</span>
              <input
                aria-label="Tinggi rasio"
                value={customH}
                onChange={(e) => setCustomH(e.target.value)}
                inputMode="numeric"
                className="tabular w-full min-w-0 bg-transparent text-xs text-gray-900 outline-none"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const w = parseFloat(customW);
              const h = parseFloat(customH);
              if (w > 0 && h > 0) setRatio(w, h);
            }}
            className="btn-secondary w-full"
          >
            Terapkan Ukuran
          </button>
        </div>
      </section>

      {/* 4. Mode penempatan */}
      <section>
        <h3 className="section-title mb-2">Mode Penempatan</h3>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            aria-label="Isi"
            aria-pressed={image.edit.fit === "fill"}
            onClick={() => useEditor.getState().setFit("fill")}
            className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
              image.edit.fit === "fill"
                ? "border-primary-200 bg-primary-50 text-primary-700"
                : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Frame size={18} strokeWidth={1.5} aria-hidden />
            <span className="flex flex-col">
              <span className="text-xs font-semibold">Isi (Fill)</span>
              <span className="text-[10px] opacity-80">Penuhi area tanpa margin</span>
            </span>
          </button>
          <button
            type="button"
            aria-label="Muat"
            aria-pressed={image.edit.fit === "contain"}
            onClick={() => useEditor.getState().setFit("contain")}
            className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
              image.edit.fit === "contain"
                ? "border-primary-200 bg-primary-50 text-primary-700"
                : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Maximize size={18} strokeWidth={1.5} aria-hidden />
            <span className="flex flex-col">
              <span className="text-xs font-semibold">Muat (Fit)</span>
              <span className="text-[10px] opacity-80">Pertahankan rasio asli</span>
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
