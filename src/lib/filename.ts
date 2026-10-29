/**
 * Sanitasi nama berkas untuk unduhan dan entri arsip ZIP.
 *
 * Nama berkas berasal dari input pengguna (nama file asli, kolom rename) dan
 * dipakai sebagai nama unduhan atau entri ZIP. Nama seperti
 * `../../.ssh/authorized_keys` atau `C:\Windows\evil` berbahaya bila diteruskan
 * mentah: di dalam arsip ZIP, entri dengan `../` dapat menulis ke luar folder
 * tujuan saat diekstrak (zip-slip). Modul ini dipisah dari `export.ts` agar
 * worker hanya menarik kode kecil ini, bukan seluruh pipeline ekspor.
 */

/**
 * Bersihkan nama berkas. Selalu mengembalikan string yang aman dipakai sebagai
 * komponen path tunggal (tanpa pemisah direktori).
 *
 * Aturan:
 * - Buang komponen direktori: `/` dan `\` diganti tanda hubung.
 * - Buang awalan drive Windows (`C:`).
 * - Buang karakter kontrol dan karakter terlarang di Windows/macOS.
 * - Runtuhkan `..` agar tidak bertahan sebagai komponen path.
 * - Buang titik, spasi, dan tanda hubung di ujung nama.
 * - Batasi panjang agar aman untuk semua sistem berkas.
 */
export function safeFilename(raw: string, fallback = "foto"): string {
  const cleaned = raw
    // Buang komponen path (Unix dan Windows) dan pemisah drive.
    .replace(/[/\\]+/g, "-")
    .replace(/^[a-zA-Z]:/, "")
    // Buang karakter kontrol dan karakter terlarang di Windows/macOS.
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    // Runtuhkan deretan titik agar `..` tidak bertahan sebagai komponen path.
    .replace(/\.{2,}/g, ".")
    // Rapikan spasi dan tanda hubung berulang.
    .replace(/\s+/g, " ")
    .replace(/-{2,}/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 80)
    .trim();
  return cleaned.length > 0 ? cleaned : fallback;
}
