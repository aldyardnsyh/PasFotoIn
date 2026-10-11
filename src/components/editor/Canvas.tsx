"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor } from "../../store/editor";
import { prepareSource, render } from "../../lib/render";
import type { Drawable } from "../../lib/render";
import { loadBlob } from "../../lib/storage";
import { RATIO_PRESETS } from "../../lib/presets";

/** Menghitung bingkai terbesar berasio r yang muat di kotak w x h. */
function fitBox(w: number, h: number, r: number): { fw: number; fh: number } {
  if (w / h > r) return { fw: h * r, fh: h };
  return { fw: w, fh: w / r };
}

/** Latar studio: bidang abu dengan titik halus, dipakai semua keadaan kanvas. */
function StudioBackdrop() {
  return <div className="studio-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />;
}

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrap, setWrap] = useState({ w: 0, h: 0 });
  const images = useEditor((s) => s.images);
  const activeId = useEditor((s) => s.activeId);
  const showGuides = useEditor((s) => s.showGuides);
  const compare = useEditor((s) => s.compare);
  const setTransform = useEditor((s) => s.setTransform);
  const pushHistoryNow = useEditor((s) => s.pushHistoryNow);
  const image = images.find((e) => e.id === activeId);
  const [bgBitmap, setBgBitmap] = useState<ImageBitmap | null>(null);
  const [drawable, setDrawable] = useState<Drawable | null>(null);
  /**
   * Bitmap untuk panel "Asli" pada mode Bandingkan.
   *
   * PENTING: `image.bitmap` adalah versi yang sedang diedit — setelah pemisahan
   * subjek, bitmap itu sudah tidak berlatar. Untuk perbandingan yang benar, panel
   * "Asli" harus memakai blob ASLI yang disimpan saat pemisahan pertama.
   */
  const [originalBitmap, setOriginalBitmap] = useState<ImageBitmap | null>(null);

  /**
   * Muat bitmap asli untuk panel perbandingan.
   *
   * Bitmap lama TIDAK ditutup di sini. Alasannya: React bisa menjalankan render
   * dengan state lama sebelum effect berikutnya selesai, sehingga menutup bitmap
   * lama akan menyebabkan "image source is detached" saat drawImage.
   * Sebagai gantinya, bitmap dilepas oleh garbage collector; ImageBitmap tanpa
   * referensi akan dibebaskan otomatis oleh browser.
   */
  useEffect(() => {
    let alive = true;
    const originalId = image?.originalBlobId;
    if (!originalId) {
      // Belum ada pemisahan: bitmap aktif memang foto asli.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOriginalBitmap(null);
      return;
    }
    loadBlob(originalId).then(async (b) => {
      if (!b || !alive) return;
      const bmp = await createImageBitmap(b, { imageOrientation: "from-image" });
      if (!alive) {
        bmp.close();
        return;
      }
      setOriginalBitmap(bmp);
    });
    return () => {
      alive = false;
    };
  }, [image?.originalBlobId, image?.id]);

  // Sumber gambar untuk kanvas: bitmap asli atau versi yang sudah disesuaikan cahaya/warnanya.
  useEffect(() => {
    let alive = true;
    if (!image?.bitmap) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDrawable(null);
      return;
    }
    prepareSource(image.bitmap, image.edit.adjust).then(
      (d) => {
        if (alive) setDrawable(d);
      },
      () => {
        // Bitmap sudah ditutup (mis. setelah pisahkan subjek): pakai bitmap terbaru apa adanya.
        if (alive) setDrawable(image.bitmap);
      },
    );
    return () => {
      alive = false;
    };
  }, [image?.bitmap, image?.edit.adjust]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setWrap({ w: r.width, h: r.height });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    // Reset pratinjau latar tiap kali jenis latar berubah, lalu muat ulang bila perlu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBgBitmap(null);
    if (image?.edit.background.kind === "image") {
      loadBlob(image.edit.background.blobId).then(async (b) => {
        if (b && alive) setBgBitmap(await createImageBitmap(b));
      });
    }
    return () => {
      alive = false;
    };
  }, [image?.edit.background]);

  const bgLoading = image?.edit.background.kind === "image" && !bgBitmap;
  const ratio = image ? image.edit.ratioW / image.edit.ratioH : 1;
  const preset = image ? RATIO_PRESETS.find((p) => p.w === image.edit.ratioW && p.h === image.edit.ratioH && p.px) : undefined;
  const dimensionLabel = image
    ? `${image.edit.ratioW}:${image.edit.ratioH}${preset?.px ? ` · ${preset.px[0]}×${preset.px[1]} px` : ""}`
    : "";

  // Ukuran bingkai kanan (hasil). Kiri (asli) mengikuti aspek foto sumber.
  let fw = 0;
  let fh = 0;
  let lw = 0;
  let lh = 0;
  if (image && wrap.w > 0 && wrap.h > 0) {
    if (compare && image.bitmap) {
      const gap = 24;
      const paneW = (wrap.w - gap) / 2;
      const paneH = wrap.h - 28;
      ({ fw, fh } = fitBox(paneW, paneH, ratio));
      const lr = image.bitmap.width / image.bitmap.height;
      ({ fw: lw, fh: lh } = fitBox(paneW, paneH, lr));
    } else {
      ({ fw, fh } = fitBox(wrap.w, wrap.h, ratio));
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !drawable || fw < 2 || fh < 2) return;
    // Lewati render bila drawable adalah bitmap lama yang sudah ditutup (mis. setelah pisahkan subjek).
    if (drawable instanceof ImageBitmap && drawable !== image?.bitmap) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const nextW = Math.round(fw * dpr);
    const nextH = Math.round(fh * dpr);
    // Ubah ukuran hanya bila berubah: menyetel canvas.width selalu mengosongkan
    // buffer dan memaksa realokasi, yang membuat drag terasa berat.
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      render(ctx, image!.edit, drawable, canvas.width, canvas.height, bgBitmap);
    } catch {
      /* bitmap sudah tidak valid; render berikutnya memakai bitmap baru */
    }
  }, [drawable, image, fw, fh, bgBitmap]);

  useEffect(() => {
    const canvas = leftRef.current;
    // Panel "Asli" memakai bitmap asli bila foto sudah dipisahkan, supaya
    // perbandingan benar-benar menunjukkan sebelum dan sesudah.
    const source = originalBitmap ?? image?.bitmap;
    if (!canvas || !compare || !source || lw < 2 || lh < 2) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const nextW = Math.round(lw * dpr);
    const nextH = Math.round(lh * dpr);
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Bitmap bisa sudah dilepas (mis. foto diganti saat render berjalan).
    // Tangkap error agar UI tidak crash; render berikutnya memakai bitmap baru.
    try {
      if (source.width < 1 || source.height < 1) return;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const s = Math.min(canvas.width / source.width, canvas.height / source.height);
      const dw = source.width * s;
      const dh = source.height * s;
      ctx.drawImage(source, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    } catch {
      /* bitmap sudah tidak valid */
    }
  }, [image?.bitmap, originalBitmap, lw, lh, compare]);

  const drag = useRef<{ x: number; y: number; pushed: boolean } | null>(null);
  const pinch = useRef<{ dist: number; scale: number; pushed: boolean } | null>(null);
  const lastWheelPush = useRef(0);

  if (!image) {
    return (
      <div ref={wrapRef} className="relative flex h-full w-full items-center justify-center bg-gray-100 p-6">
        <StudioBackdrop />
        <p className="relative text-sm text-gray-500">Tambahkan foto untuk mulai mengedit.</p>
      </div>
    );
  }

  const frame = (
    <div className="relative" style={{ width: fw, height: fh }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Pratinjau ${image.edit.ratioW}:${image.edit.ratioH}`}
        className={`absolute inset-0 h-full w-full touch-none rounded-sm shadow-lg ring-1 ring-black/10 ${image.edit.background.kind === "transparent" ? "checkerboard" : "bg-white"}`}
        onPointerDown={(e) => {
          if (e.pointerType === "touch") return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, pushed: false };
        }}
        onPointerMove={(e) => {
          if (!drag.current || !image || e.pointerType === "touch") return;
          const dx = (e.clientX - drag.current.x) / fw;
          const dy = (e.clientY - drag.current.y) / fh;
          drag.current = { x: e.clientX, y: e.clientY, pushed: drag.current.pushed };
          if (dx === 0 && dy === 0) return;
          if (!drag.current.pushed) {
            pushHistoryNow();
            drag.current.pushed = true;
          }
          setTransform({ x: image.edit.transform.x + dx, y: image.edit.transform.y + dy }, false);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onWheel={(e) => {
          if (!image) return;
          const min = image.edit.fit === "fill" ? 1 : 0.1;
          const next = Math.min(5, Math.max(min, image.edit.transform.scale * Math.exp(-e.deltaY * 0.001)));
          const now = Date.now();
          if (now - lastWheelPush.current > 600) {
            pushHistoryNow();
            lastWheelPush.current = now;
          }
          setTransform({ scale: next }, false);
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            const [a, b] = [e.touches[0], e.touches[1]];
            pinch.current = { dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY), scale: image.edit.transform.scale, pushed: false };
            drag.current = null;
          } else if (e.touches.length === 1) {
            pinch.current = null;
            drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, pushed: false };
          }
        }}
        onTouchMove={(e) => {
          if (!image) return;
          if (e.touches.length === 2 && pinch.current) {
            e.preventDefault();
            const [a, b] = [e.touches[0], e.touches[1]];
            const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
            const min = image.edit.fit === "fill" ? 1 : 0.1;
            const next = Math.min(5, Math.max(min, pinch.current.scale * (dist / pinch.current.dist)));
            if (!pinch.current.pushed) {
              pushHistoryNow();
              pinch.current.pushed = true;
            }
            setTransform({ scale: next }, false);
          } else if (e.touches.length === 1 && drag.current) {
            e.preventDefault();
            const t = e.touches[0];
            const dx = (t.clientX - drag.current.x) / fw;
            const dy = (t.clientY - drag.current.y) / fh;
            drag.current = { x: t.clientX, y: t.clientY, pushed: drag.current.pushed };
            if (dx === 0 && dy === 0) return;
            if (!drag.current.pushed) {
              pushHistoryNow();
              drag.current.pushed = true;
            }
            setTransform({ x: image.edit.transform.x + dx, y: image.edit.transform.y + dy }, false);
          }
        }}
        onTouchEnd={(e) => {
          if (e.touches.length === 0) {
            drag.current = null;
            pinch.current = null;
          }
        }}
      />
      {showGuides && (
        <div className="pointer-events-none absolute inset-0">
          {[1 / 3, 2 / 3].map((f) => (
            <div key={`v${f}`} className="absolute inset-y-0 border-l border-primary-400/50" style={{ left: `${f * 100}%` }} />
          ))}
          {[1 / 3, 2 / 3].map((f) => (
            <div key={`h${f}`} className="absolute inset-x-0 border-t border-primary-400/50" style={{ top: `${f * 100}%` }} />
          ))}
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-primary-400/50" />
          <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-primary-400/50" />
          {/* Panduan pas foto: garis mata di 38% dan oval kepala, mengikuti standar biometrik umum. */}
          <div className="absolute inset-x-[12%] top-[38%] border-t border-solid border-primary-600/60" />
          <div className="absolute left-1/2 top-[46%] h-[62%] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-dashed border-primary-600/45" />
          <div className="absolute inset-x-[12%] bottom-[8%] border-t border-dashed border-primary-600/40" />
        </div>
      )}
      <div className="code-label pointer-events-none absolute right-2 top-2 rounded bg-gray-900/80 px-2 py-0.5 text-white! shadow-sm">
        {dimensionLabel}
      </div>
      {bgLoading && (
        <div className="absolute left-2 top-2 rounded-md bg-gray-900/80 px-2 py-1 text-[11px] text-white">
          Memuat latar…
        </div>
      )}
    </div>
  );

  if (!compare || fw === 0) {
    return (
      <div ref={wrapRef} className="relative flex h-full w-full items-center justify-center bg-gray-100 p-6">
        <StudioBackdrop />
        <div className="relative">{fw > 0 && frame}</div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative flex h-full w-full items-center justify-center gap-6 bg-gray-100 p-6">
      <StudioBackdrop />
      <div className="relative flex flex-col items-center gap-2">
        <span className="micro-label">Asli</span>
        <div className="relative rounded-sm bg-white shadow-sm" style={{ width: lw, height: lh }}>
          <canvas ref={leftRef} className="absolute inset-0 h-full w-full" aria-label="Foto asli" role="img" />
        </div>
      </div>
      <div className="relative flex flex-col items-center gap-2">
        <span className="micro-label">Hasil</span>
        {frame}
      </div>
    </div>
  );
}
