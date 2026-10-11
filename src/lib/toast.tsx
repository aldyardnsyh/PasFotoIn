"use client";

/**
 * Helper notifikasi dengan ikon dan warna per jenis.
 *
 * Sonner tidak menambahkan ikon secara bawaan, sehingga toast sukses dan gagal
 * terlihat sama. Helper ini menyisipkan ikon yang jelas (centang, silang,
 * peringatan, info) agar pengguna langsung tahu hasil aksinya tanpa membaca.
 */
import { toast } from "sonner";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { createElement } from "react";

type ToastOptions = Parameters<typeof toast.success>[1];

/** Ikon centang hijau. */
export function toastSuccess(message: string, options?: ToastOptions) {
  return toast.success(message, {
    ...options,
    icon: createElement(CircleCheck, { size: 18, strokeWidth: 2, className: "text-success" }),
  });
}

/** Ikon silang merah. */
export function toastError(message: string, options?: ToastOptions) {
  return toast.error(message, {
    ...options,
    icon: createElement(CircleAlert, { size: 18, strokeWidth: 2, className: "text-danger" }),
  });
}

/** Ikon segitiga kuning. */
export function toastWarning(message: string, options?: ToastOptions) {
  return toast.warning(message, {
    ...options,
    icon: createElement(TriangleAlert, { size: 18, strokeWidth: 2, className: "text-warning" }),
  });
}

/** Ikon info biru. */
export function toastInfo(message: string, options?: ToastOptions) {
  return toast.info(message, {
    ...options,
    icon: createElement(Info, { size: 18, strokeWidth: 2, className: "text-primary-600" }),
  });
}
