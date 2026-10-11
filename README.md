# PasFotoIn

Editor foto berbasis browser untuk mengubah rasio dan latar. Semua proses berjalan di perangkat pengguna. Tidak ada unggahan, tidak ada server, tidak ada akun.

Dibuat untuk kebutuhan pas foto Indonesia: preset dalam sentimeter, pemisahan subjek otomatis, dan lembar cetak A4 siap potong.

---

## Masalah yang diselesaikan

Satu foto sering dibutuhkan dalam banyak ukuran: feed 4:5, story 9:16, thumbnail 16:9, foto produk 1:1, atau pas foto 3x4 untuk berkas resmi. Alat yang ada umumnya berat, meminta login, atau menaruh watermark.

PasFotoIn membuka area unggah sebagai halaman pertama, bukan halaman pemasaran.

---

## Kemampuan

### Rasio dan ukuran

- 9 preset umum: 1:1, 4:5, 3:4, 2:3, 9:16, 16:9, 4:3, 3:2, 21:9
- 4 preset dokumen Indonesia dalam sentimeter: 2x3, 3x4, 4x6, 6x9
- 5 preset internasional mengikuti ICAO Doc 9303: Paspor 35x45 mm, AS 51x51 mm, China 33x48 mm, Malaysia 35x50 mm, PAN India 25x35 mm
- 7 preset media sosial dan 1 preset marketplace
- Ukuran kustom dan piksel langsung
- Pemilih resolusi 300 DPI (cetak) atau 600 DPI (portal digital sesuai ICAO)

Preset dokumen menyimpan ukuran fisik dalam milimeter, sehingga piksel dihitung dari sumber yang benar: `piksel = (mm / 25.4) × dpi`.

### Pemisahan subjek

Model segmentasi berjalan di perangkat lewat Web Worker. Tiga tingkat kualitas: 42 MB, 84 MB, dan 168 MB. Model diunduh sekali lalu disimpan di cache peramban.

Pasca-proses matte bekerja dalam delapan tahap:

1. Buang pulau kecil dengan proteksi radius 24 px untuk helai rambut
2. Isi lubang yang terkepung subjek
3. Median filter sadar-detail (melewati area transisi)
4. Kurva alfa sadar-detail
5. Padatkan area tebal yang salah transparan, mis. pakaian gelap
6. Guided filter menyelaraskan alfa dengan tepi warna asli
7. Erosi sadar-detail
8. Defringe dan feather ringan

Prinsipnya: perapian menyesuaikan model. Model terbaik memakai perapian paling ringan karena mask-nya sudah halus.

### Latar belakang

Warna solid, 12 preset gradien, blur dari foto itu sendiri, transparan, atau gambar sendiri. Tersedia warna latar resmi Indonesia: Merah `#D32F2F`, Biru `#0B57D0`, Putih, dan Abu Studio.

Palet lima warna dominan diekstrak otomatis dari foto. Ada color picker, input hex, dan pipet layar bila peramban mendukung EyeDropper API.

### Koreksi warna

- Enam slider: eksposur, kontras, sorotan, bayangan, saturasi, suhu
- White balance otomatis dengan estimasi gray-world
- Histogram 256 bin dalam mode Cahaya dan RGB
- Garis levels yang bisa ditarik langsung di grafik, plus slider manual untuk titik hitam, gamma, dan titik putih
- Auto Levels dan Auto Warna dengan kekuatan lembut
- Perjelas detail: unsharp mask pada luminance, clarity, dan denoise ringan

Semua koreksi bersifat non-destruktif dan tersimpan di proyek.

### Ekspor

- PNG, JPEG, dan WebP dengan kualitas 40 sampai 100
- Ukuran dari preset, skala 1x/2x/3x, atau piksel kustom
- Perkiraan ukuran file dihitung dari encode pratinjau
- Salin ke clipboard sebagai PNG
- Batch ZIP dengan progress dan tombol batalkan
- Lembar cetak A4 pada 300 DPI, berisi puluhan salinan dengan garis potong

Metadata EXIF tidak ikut diekspor, sehingga lokasi pengambilan foto tidak tersimpan.

### Lainnya

- Riwayat undo/redo global 60 langkah, mencakup pengaturan, pemrosesan gambar, dan penghapusan foto
- Pintasan keyboard lengkap
- Persistensi lokal: pengaturan dan metadata proyek di localStorage, blob gambar di IndexedDB
- Tampilan responsif: panel kanan di desktop, bottom sheet di ponsel

---

## Privasi

Foto diproses di peramban dan tidak dikirim ke mana pun. Untuk memastikan, buka tab Network di DevTools saat mengekspor. Tidak akan ada permintaan yang memuat data gambar.

Pengecualian: fitur pemisahan subjek mengunduh berkas model (42 sampai 168 MB) sekali dari `staticimgly.com`. Foto tetap tidak diunggah.

Data yang disimpan hanya di perangkat: pengaturan, metadata proyek, dan blob gambar di IndexedDB. Maksimum 20 proyek, kedaluwarsa 14 hari. Tombol hapus semua data tersedia di halaman Tentang.

---

## Teknologi

| Lapisan | Pilihan |
| --- | --- |
| Framework | Next.js 16 (App Router), TypeScript, output statis |
| Styling | Tailwind CSS v4 dengan token desain di `globals.css` |
| State | Zustand dengan riwayat snapshot immutable |
| Ikon | lucide-react |
| Segmentasi | `@imgly/background-removal` di Web Worker |
| Gestur | `@use-gesture/react` |
| Pemilih warna | react-colorful |
| Penyimpanan blob | idb-keyval di atas IndexedDB |
| ZIP | fflate |
| Notifikasi | sonner |
| Uji | Vitest dan Playwright |

Tidak ada API route, tidak ada database, tidak ada environment variable.

---

## Menjalankan

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

### Skrip

| Perintah | Kegunaan |
| --- | --- |
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi |
| `npm run start` | Jalankan hasil build |
| `npm run lint` | ESLint |
| `npm test` | Unit test Vitest |
| `npm run test:e2e` | E2E test Playwright |

E2E test memakai server produksi di port 3100. Jalankan `npm run build` lebih dulu.

---

## Struktur proyek

```
src/
  app/
    layout.tsx            # font, metadata, Toaster
    page.tsx              # beranda: dropzone dan daftar proyek
    editor/page.tsx       # shell editor: bilah atas, pintasan, autosave
    about/page.tsx        # privasi, cara kerja, batas, data lokal
    globals.css           # token desain dan kelas komponen
  components/
    ui/ConfirmDialog.tsx  # modal konfirmasi dengan portal
    Logo.tsx
    editor/
      Canvas.tsx              # kanvas, drag, zoom, pinch, mode bandingkan
      Inspector.tsx           # wadah 4 tab
      RatioPicker.tsx         # preset rasio dan dokumen
      TransformPanel.tsx      # zoom, rotasi, flip
      BackgroundPicker.tsx    # warna, gradien, blur, transparan, gambar
      AdjustPanel.tsx         # cahaya dan warna
      HistogramPanel.tsx      # grafik, levels, auto
      EnhancePanel.tsx        # perjelas detail
      FrameSheetPanel.tsx     # bingkai dan lembar cetak A4
      RemoveBackgroundPanel.tsx
      ExportDialog.tsx
      ExportPanel.tsx
      Filmstrip.tsx
      ProjectThumb.tsx
      Dropzone.tsx
      AddPhotosButton.tsx
      DeletePhotoButton.tsx
      ExportTab.tsx
  lib/
    geometry.ts           # tipe data, baseScale, clampTransform
    render.ts             # satu pipeline untuk pratinjau dan ekspor
    matte.ts              # sembilan tahap pasca-proses matte
    separate.ts           # klien worker + preload model
    separate.worker.ts    # inferensi ONNX di thread terpisah
    export.ts             # ukuran target, perkiraan, unduh
    export-batch.ts       # batch ZIP
    export.worker.ts      # ekspor di worker
    sheet.ts              # tata letak lembar A4
    histogram.ts          # analisis dan koreksi tonal
    adjust.ts             # LUT penyesuaian per kanal
    enhance.ts            # penajaman pada luminance
    palette.ts            # ekstraksi warna dominan
    presets.ts            # data preset rasio
    storage.ts            # localStorage dan IndexedDB
    bitmap.ts             # decode pratinjau terbatas
    color.ts              # konversi hex dan RGB
    toast.tsx             # notifikasi berikon
  store/
    editor.ts             # state editor dan riwayat undo/redo
tests/
  unit/                   # Vitest
  e2e/                    # Playwright
  fixtures/photo.png      # gambar uji sintetis
```

---

## Catatan teknis

**Kenapa inferensi di Web Worker.** Menjalankan ONNX di thread utama membekukan halaman selama puluhan detik. Setelah dipindah ke worker dan header `crossOriginIsolated` diaktifkan untuk multithreading WASM, waktu proses turun dari 65 detik ke 30 detik tanpa pernah memblokir antarmuka.

**Kenapa bitmap pratinjau dibatasi 2048 px.** Foto 12 MP butuh sekitar 48 MB sebagai `ImageBitmap` dan lambat digambar ulang setiap frame. Dengan pratinjau 2048 px, memori turun ke 16 MB dan drag tetap responsif. Blob sumber tetap utuh sehingga ekspor memakai resolusi penuh.

**Kenapa levels non-destruktif.** Auto Levels versi pertama mengubah blob langsung, sehingga tidak bisa dibatalkan dan hasilnya terlalu agresif. Sekarang nilai levels disimpan di `edit.adjust` sebagai bagian dari proyek: bisa di-undo, ikut ke ekspor, dan foto asli tidak tersentuh.

**Kenapa enhance memakai delta, bukan rasio.** Versi pertama menerapkan perubahan luminance sebagai rasio. Bila hasil perhitungan turun ke nilai kecil, rasio menjadi ekstrem dan piksel berubah menjadi hitam. Sekarang perubahan diterapkan sebagai penambahan delta yang dibatasi 42 level.

**Kenapa preset menyimpan ID, bukan sekadar rasio.** 2x3 cm, 4x6 cm, dan 6x9 cm semuanya berasio 2:3. Tanpa `presetId`, memilih salah satu menandai ketiganya aktif sekaligus.

---

## Batas

- Maksimum 40 MB per berkas, 50 berkas per sesi
- Sisi terpanjang ekspor maksimum 8192 px
- Mode Regang sengaja tidak tersedia agar foto tidak terdistorsi
- Undo/redo disimpan di memori saja, tidak dipersist
- Format masuk: JPEG, PNG, WebP, AVIF, GIF (frame pertama), HEIC bila didukung peramban

---

## Kontribusi

Jalankan `npm test` dan `npm run test:e2e` sebelum mengirim perubahan. Konvensi pesan commit memakai format `<type>(<scope>): <deskripsi>` dengan tipe `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `style`, `build`, atau `ci`.

Rincian fitur, spesifikasi layar, dan hasil riset standar ukuran ada di `PasFotoIn - Breakdown Fitur untuk Redesign.md`.

---

## Lisensi

Hak cipta © 2026 PogungSoftwareHouseTeam (PSHT).

Proyek ini dilisensikan di bawah **GNU General Public License v3.0** (GPL-3.0).

Artinya Anda bebas memakai, mempelajari, memodifikasi, dan mendistribusikan kode ini, dengan syarat:

- **Menyertakan atribusi** kepada PogungSoftwareHouseTeam (PSHT) sebagai pemilik hak cipta asli
- **Karya turunan tetap terbuka**. Bila Anda mendistribusikan versi modifikasi, kode sumbernya harus tersedia di bawah lisensi yang sama
- **Menandai perubahan**. Versi modifikasi harus menyatakan bahwa kode telah diubah
- **Tanpa jaminan**. Perangkat lunak disediakan apa adanya

Proyek turunan tidak boleh dijadikan produk tertutup atau proprietary.

Teks lisensi lengkap ada di berkas [LICENSE](./LICENSE).

### Lisensi dependensi

Seluruh dependensi memakai lisensi yang kompatibel dengan GPL-3.0:

| Dependensi | Lisensi |
| --- | --- |
| `@imgly/background-removal` | AGPL-3.0 (kompatibel dengan GPL-3.0) |
| `idb-keyval` | Apache-2.0 |
| `lucide-react` | ISC |
| `next`, `react`, `react-dom` | MIT |
| `zustand`, `sonner`, `fflate`, `react-colorful`, `@use-gesture/react` | MIT |

Catatan: `@imgly/background-removal` memakai AGPL-3.0, yang merupakan GPL-3.0 dengan tambahan klausa jaringan. Karena proyek ini sudah GPL-3.0, tidak ada konflik. Bila kelak ingin mengganti ke lisensi permisif seperti MIT, dependensi ini perlu diganti lebih dulu.
