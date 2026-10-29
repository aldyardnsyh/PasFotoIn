"use client";

import { useCallback, useRef } from "react";
import { useEditor } from "../../store/editor";

/**
 * Riwayat undo/redo untuk kontrol slider.
 *
 * Slider mengirim event `change` berkali-kali saat digeser. Snapshot harus
 * diambil satu kali per gestur, bukan satu kali per event.
 *
 * `onPointerDown` menandai awal gestur dan langsung mengambil snapshot, yaitu
 * keadaan SEBELUM nilai berubah. Selama gestur berjalan, perubahan diterapkan
 * tanpa snapshot baru supaya satu geseran = satu langkah undo.
 *
 * Perubahan yang tidak didahului pointerdown, misalnya slider digerakkan
 * dengan tombol panah atau nilainya diisi lewat skrip, harus tetap bisa di-undo.
 * Untuk kasus itu snapshot diambil pada handler `change` itu sendiri, sebelum
 * nilai baru diterapkan.
 */
export function useSliderHistory() {
  const dragging = useRef(false);
  const pushHistoryNow = useEditor((s) => s.pushHistoryNow);

  const onPointerDown = useCallback(() => {
    dragging.current = true;
    pushHistoryNow();
  }, [pushHistoryNow]);

  /** Tandai gestur selesai agar perubahan berikutnya dihitung sebagai gestur baru. */
  const endGesture = useCallback(() => {
    dragging.current = false;
  }, []);

  /**
   * Terapkan nilai slider.
   *
   * `apply` menerima flag commit. Flag true berarti ambil snapshot baru
   * (yakni tampilkan nilai lama, lalu terapkan nilai baru).
   */
  const change = useCallback((apply: (commit: boolean) => void) => {
    if (dragging.current) {
      // Gestur Pointer: snapshot sudah diambil saat pointerdown.
      apply(false);
    } else {
      // Perubahan di luar gestur Pointer (keyboard, pengisian nilai):
      // snapshot diambil sekarang, sebelum nilai baru diterapkan.
      apply(true);
    }
  }, []);

  return { onPointerDown, endGesture, change };
}
