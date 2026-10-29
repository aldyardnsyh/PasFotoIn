/**
 * Baris hak cipta untuk seluruh halaman aplikasi.
 *
 * Teks diambil dari `src/lib/copyright.ts` supaya sama dengan tag meta di
 * layout dan tidak perlu diubah terpisah per halaman.
 */
import { COPYRIGHT_TEXT } from "../lib/copyright";

/**
 * Baris hak cipta.
 *
 * `inline` merender elemen sebaris (span) agar bisa digabung dengan teks lain
 * dalam satu baris footer. Tanpa `inline`, komponen ini merender paragraf
 * sendiri untuk footer bertumpuk.
 *
 * `align` menentukan penempatan teks, `compact` mengecilkan ukuran untuk
 * bilah kerja yang sempit seperti editor.
 */
export default function CopyrightNotice({
  align = "start",
  compact = false,
  inline = false,
}: {
  align?: "start" | "end" | "center";
  compact?: boolean;
  inline?: boolean;
}) {
  const perataan =
    align === "end" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const ukuran = compact ? "text-[10.5px] leading-4" : "text-[11px] leading-4";

  if (inline) {
    return <span className={`${ukuran} text-gray-500`}>{COPYRIGHT_TEXT}</span>;
  }

  return <p className={`${perataan} ${ukuran} text-gray-500`}>{COPYRIGHT_TEXT}</p>;
}
