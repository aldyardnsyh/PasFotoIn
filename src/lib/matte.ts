/**
 * Pasca-proses hasil seleksi subjek (matte) agar lebih bersih.
 *
 * Urutan operasi (dari kasar ke halus):
 * 1. Buang pulau kecil (bercak noise yang terpisah dari subjek)
 * 2. Isi lubang kecil di dalam subjek
 * 3. Median filter pada alfa: menghapus bercak 1-2 px yang menempel di tepi
 *    (ini penyebab utama "garis tipis pixelated" di area rambut)
 * 4. Kurva alfa adaptif: kontras tepi dinaikkan agar semi-transparan samar
 *    menjadi transparan penuh, sementara tepi kuat tetap lembut
 * 5. Defringe: buang piksel campuran warna latar di tepi
 * 6. Feather: haluskan tepi
 *
 * Semua operasi bekerja pada typed arrays murni agar jalan juga di Web Worker.
 */

export type MatteOptions = {
  /** 0..100: buang pulau dengan area di bawah persentase ini relatif terhadap komponen terbesar. */
  cleanIslands: number;
  /** 0..100: isi lubang (background terkepung) di bawah ambang ini. */
  fillHoles: number;
  /** 0..8 px: kerutkan tepi untuk membuang piksel campuran warna latar (halo). */
  edgeShrink: number;
  /** 0..8 px: haluskan tepi. */
  edgeFeather: number;
  /** 0..3 px: radius median filter untuk membersihkan bercak kecil di tepi. 0 = mati. */
  speckleClean: number;
  /**
   * 0..100: kekuatan kurva alfa. Nilai >0 menaikkan kontras alfa sehingga
   * piksel samar (alfa rendah) menjadi transparan penuh, menghilangkan
   * sisa tipis warna latar di sekitar rambut.
   */
  alphaContrast: number;
  /**
   * Radius guided filter (0..12 px). 0 = mati.
   *
   * Guided filter memakai tepi warna RGB sebagai pemandu sehingga alfa mengikuti
   * detail asli foto, bukan blok hasil upscale model. Ini yang membuat tepi
   * rambut tampak halus dan tidak "pixelated". Direkomendasikan 4-8 px.
   */
  guideRadius: number;
  /**
   * Sensitivitas guided filter (0.0001..0.05). Makin kecil, makin ketat
   * mengikuti tepi RGB (bisa ikut noise warna), makin besar makin halus.
   */
  guideEps: number;
  /**
   * Radius area tebal yang dipadatkan (0..40 px). 0 = mati.
   *
   * Menyelesaikan masalah pakaian gelap yang ikut transparan: model kadang
   * memberi alpha sebagian pada area LUAS (jas hitam mirip latar gelap).
   * Area tidak-pasti yang lebih tebal dari radius ini dianggap salah deteksi
   * dan dipadatkan, sementara tepi tipis (rambut) dibiarkan.
   */
  solidifyRadius: number;
  /** 0..100: seberapa penuh alpha dipadatkan pada area tebal. */
  solidifyStrength: number;
};

/**
 * Pengaturan default: sangat ringan, sadar detail.
 *
 * Prinsipnya: model sudah menghasilkan mask yang cukup baik, tugas pasca-proses
 * hanya bereskan sisa bercak. Terlalu agresif = detail dekat tepi hilang.
 */
export const DEFAULT_MATTE: MatteOptions = {
  cleanIslands: 15,
  fillHoles: 35,
  edgeShrink: 0,
  edgeFeather: 0.4,
  speckleClean: 0,
  alphaContrast: 8,
  guideRadius: 5,
  guideEps: 0.01,
  solidifyRadius: 8,
  solidifyStrength: 70,
};

export const MATTE_OFF: MatteOptions = {
  cleanIslands: 0,
  fillHoles: 0,
  edgeShrink: 0,
  edgeFeather: 0,
  speckleClean: 0,
  alphaContrast: 0,
  guideRadius: 0,
  guideEps: 0,
  solidifyRadius: 0,
  solidifyStrength: 0,
};

const FG_THRESHOLD = 16;

type Components = {
  labels: Int32Array;
  areas: number[];
  touchesEdge: boolean[];
};

/** Labeling 4-konektivitas untuk piksel yang cocok `match`. */
function label(mask: Uint8Array, w: number, h: number, match: (v: number) => boolean): Components {
  const n = w * h;
  const labels = new Int32Array(n).fill(-1);
  const areas: number[] = [];
  const touchesEdge: boolean[] = [];
  const stack = new Int32Array(n);

  for (let start = 0; start < n; start++) {
    if (labels[start] !== -1 || !match(mask[start])) continue;
    const id = areas.length;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = id;
    let area = 0;
    let edge = false;
    while (sp > 0) {
      const p = stack[--sp];
      area++;
      const x = p % w;
      const y = (p / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      if (x > 0 && labels[p - 1] === -1 && match(mask[p - 1])) {
        labels[p - 1] = id;
        stack[sp++] = p - 1;
      }
      if (x < w - 1 && labels[p + 1] === -1 && match(mask[p + 1])) {
        labels[p + 1] = id;
        stack[sp++] = p + 1;
      }
      if (y > 0 && labels[p - w] === -1 && match(mask[p - w])) {
        labels[p - w] = id;
        stack[sp++] = p - w;
      }
      if (y < h - 1 && labels[p + w] === -1 && match(mask[p + w])) {
        labels[p + w] = id;
        stack[sp++] = p + w;
      }
    }
    areas.push(area);
    touchesEdge.push(edge);
  }
  return { labels, areas, touchesEdge };
}

/**
 * Min filter separable (erosi), SADAR DETAIL.
 *
 * Masalah versi sebelumnya: erosi diterapkan merata, sehingga mengikis tepi
 * tipis (rambut, telinga) sebanyak radius piksel. Sekarang piksel yang berada
 * di zona transisi halus tidak dierosi, sehingga detail tipis tetap utuh
 * sementara tepi tebal (badan) tetap dikikis untuk membuang halo warna latar.
 */
function erodeAlpha(alpha: Float32Array, w: number, h: number, r: number, protectDetail = 0.6): Float32Array {
  if (r <= 0) return alpha;

  // Masker detail: area dengan variasi alfa tinggi = detail halus.
  const protect = new Uint8Array(alpha.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      let lo = alpha[p];
      let hi = alpha[p];
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const v = alpha[yy * w + xx];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      if ((hi - lo) / 255 > 0.3 * protectDetail) protect[p] = 1;
    }
  }

  const tmp = new Float32Array(alpha.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = alpha[row + x];
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let i = x0; i <= x1; i++) {
        const v = alpha[row + i];
        if (v < m) m = v;
      }
      tmp[row + x] = m;
    }
  }
  const out = new Float32Array(alpha.length);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const p = y * w + x;
      // Detail halus: pertahankan alfa asli, jangan dierosi.
      if (protect[p]) {
        out[p] = alpha[p];
        continue;
      }
      let m = tmp[p];
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let i = y0; i <= y1; i++) {
        const v = tmp[i * w + x];
        if (v < m) m = v;
      }
      out[p] = m;
    }
  }
  return out;
}

/**
 * Median filter pada alfa, SADAR KONTEKS.
 *
 * Masalah pada versi sebelumnya: median diterapkan merata ke seluruh gambar.
 * Median 5x5 (radius 2) menghapus semua struktur lebih tipis dari 5 piksel -
 * termasuk helai rambut dan tepi telinga. Itu sebabnya detail halus hilang.
 *
 * Solusi: hitung "masker detail" dari gradien alfa lokal. Piksel yang berada di
 * area transisi tajam (kemungkinan besar detail halus seperti rambut) DILEWATI,
 * sementara piksel di area solid (badan, latar) tetap dibersihkan.
 *
 * `protectDetail` 0..1 mengatur seberapa agresif perlindungan ini.
 */
function medianAlpha(alpha: Float32Array, w: number, h: number, r: number, protectDetail = 0.75): Float32Array {
  if (r <= 0) return alpha;
  const out = new Float32Array(alpha.length);
  const size = (r * 2 + 1) * (r * 2 + 1);
  const buf = new Float32Array(size);

  // Masker detail: 1 = lindungi (jangan median), 0 = boleh dibersihkan.
  // Deteksi dari variasi alfa di jendela 3x3: transisi tajam = detail halus.
  const detail = new Float32Array(alpha.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      let lo = alpha[p];
      let hi = alpha[p];
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const v = alpha[yy * w + xx];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      // Variasi besar = area transisi = lindungi.
      detail[p] = (hi - lo) / 255;
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      // Di area transisi, pertahankan nilai asli sesuai kekuatan perlindungan.
      if (detail[p] * protectDetail > 0.5) {
        out[p] = alpha[p];
        continue;
      }
      let k = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -r; dx <= r; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          buf[k++] = alpha[yy * w + xx];
        }
      }
      const sorted = buf.subarray(0, k).slice().sort();
      const mid = k >> 1;
      out[p] = k % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
  }
  return out;
}

/**
 * Kurva alfa yang SADAR DETAIL.
 *
 * Masalah versi sebelumnya: kurva diterapkan merata dengan cut-off rendah
 * (sampai α<70 dipotong). Rambut tipis justru punya alfa rendah, sehingga ikut
 * terhapus. Sekarang cut-off dibatasi dan hanya berlaku di area NON-transisi.
 *
 * Prinsip: hanya paksa transparan piksel yang BENAR-BENAR samar (α sangat rendah)
 * di area solid, dan jangan sentuh piksel di zona transisi.
 */
function contrastAlpha(alpha: Float32Array, strength: number, w: number, h: number): Float32Array {
  if (strength <= 0) return alpha;
  const s = Math.min(1, strength / 100);
  // Cut-off dijaga tetap rendah agar rambut tipis (α 20-80) tidak terhapus.
  const low = s * 0.12 * 255;
  const high = 255 - s * 0.06 * 255;
  const span = Math.max(1, high - low);
  const out = new Float32Array(alpha.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const v = alpha[p];

      // Deteksi area transisi (gradien besar) - jangan diubah di sana.
      let lo = v;
      let hi = v;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const q = alpha[yy * w + xx];
          if (q < lo) lo = q;
          if (q > hi) hi = q;
        }
      }
      const variation = (hi - lo) / 255;
      // Di area transisi halus, pertahankan nilai asli (biarkan guided filter yang urus).
      if (variation > 0.25) {
        out[p] = v;
        continue;
      }

      let t = (v - low) / span;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      out[p] = (t * t * (3 - 2 * t)) * 255;
    }
  }
  return out;
}

/**
 * Padatkan area yang seharusnya solid, TAPI pertahankan area transisi tipis.
 *
 * Masalah yang diselesaikan: model kadang memberi alpha sebagian (mis. 180-230)
 * pada area LUAS yang sebenarnya bagian dari subjek, kasus paling umum adalah
 * jas hitam atau kemeja gelap yang warnanya mirip latar. Akibatnya latar baru
 * "menembus" pakaian.
 *
 * Cara membedakannya dari tepi halus yang benar (rambut):
 * - Tepi halus = area tidak-pasti yang TIPIS (beberapa piksel).
 * - Area salah = area tidak-pasti yang TEBAL (ratusan piksel).
 *
 * Pendekatan morfologi:
 * 1. Ambil masker "tidak pasti" (alpha antara low..high).
 * 2. Erosi masker itu dengan radius besar. Area tipis HABIS, area tebal bertahan.
 * 3. Area yang bertahan = salah deteksi → naikkan alpha mendekati penuh.
 * 4. Dilasi hasilnya sedikit agar tepi area tebal ikut diperbaiki.
 *
 * Dengan cara ini, jas hitam kembali solid tanpa mengorbankan rambut tipis.
 */
function solidifyRegions(
  alpha: Float32Array,
  rgb: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
  strength: number,
): Float32Array {
  if (radius <= 0 || strength <= 0) return alpha;
  const n = w * h;
  const s = Math.min(1, strength / 100);

  // 1. Masker tidak-pasti: alpha yang tidak jelas (bukan background, bukan solid).
  const uncertain = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    uncertain[i] = alpha[i] > 40 && alpha[i] < 235 ? 1 : 0;
  }

  // 2. Erosi masker dengan radius besar. Hanya area TEBAL yang bertahan.
  const eroded = minFilter(uncertain, w, h, radius);
  if (!eroded) return alpha;

  // 3. Dilasi balik agar area yang bertahan mencakup tepinya juga.
  const grown = dilate(eroded, w, h, radius);

  // 4. Pengaman warna: padatkan HANYA bila warna piksel mirip dengan warna
  //    piksel solid terdekat. Ini mencegah tepi blur yang sah (mis. rambut
  //    berwarna berbeda dari kulit) ikut dipadatkan.
  //
  //    Caranya: untuk setiap piksel yang akan dipadatkan, cari rata-rata warna
  //    piksel alpha>=250 di sekitarnya. Bila selisih warna kecil, berarti piksel
  //    ini memang bagian dari objek (mis. lipatan jas), bukan tepi transisi.
  const solidMean = localSolidMean(rgb, alpha, w, h, radius);

  const out = new Float32Array(alpha);
  for (let i = 0; i < n; i++) {
    if (!grown[i]) continue;
    const v = out[i];
    if (v >= 250) continue;

    // Bila ada rujukan warna solid di sekitar, bandingkan.
    const p = i * 4;
    const ref = solidMean[i];
    if (ref) {
      const dr = rgb[p] - ref[0];
      const dg = rgb[p + 1] - ref[1];
      const db = rgb[p + 2] - ref[2];
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      // Selisih warna > 55: kemungkinan tepi transisi yang sah, jangan padatkan.
      if (dist > 55) continue;
    }

    // Dorong ke arah nilai penuh. Kekuatan mengatur seberapa agresif.
    out[i] = Math.min(255, v + (255 - v) * s);
  }
  return out;
}

/**
 * Rata-rata warna piksel SOLID (alpha >= 250) di sekitar tiap piksel.
 * Dipakai sebagai rujukan untuk menilai apakah piksel tidak-pasti memang
 * bagian dari objek yang sama. Mengembalikan null untuk piksel tanpa rujukan.
 */
function localSolidMean(
  rgb: Uint8ClampedArray,
  alpha: Float32Array,
  w: number,
  h: number,
  radius: number,
): ([number, number, number] | null)[] {
  const n = w * h;
  // Sampel pada cincin radius: cukup 8 titik untuk kecepatan.
  const offsets: [number, number][] = [
    [-radius, 0],
    [radius, 0],
    [0, -radius],
    [0, radius],
    [-radius, -radius],
    [radius, radius],
    [-radius, radius],
    [radius, -radius],
  ];
  const result: ([number, number, number] | null)[] = new Array(n).fill(null);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let count = 0;
      for (const [dx, dy] of offsets) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
        const q = yy * w + xx;
        if (alpha[q] < 250) continue;
        const pq = q * 4;
        sr += rgb[pq];
        sg += rgb[pq + 1];
        sb += rgb[pq + 2];
        count++;
      }
      if (count > 0) {
        const mean: [number, number, number] = [sr / count, sg / count, sb / count];
        result[y * w + x] = mean;
      }
    }
  }
  return result;
}

/** Min filter (erosi) pada masker biner, memakai dua pass separable. */
function minFilter(mask: Uint8Array, w: number, h: number, r: number): Uint8Array | null {
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = 1;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let i = x0; i <= x1; i++) {
        if (mask[row + i] === 0) {
          m = 0;
          break;
        }
      }
      tmp[row + x] = m;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 1;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let i = y0; i <= y1; i++) {
        if (tmp[i * w + x] === 0) {
          m = 0;
          break;
        }
      }
      out[y * w + x] = m;
    }
  }
  // Bila tidak ada piksel yang bertahan, tidak ada yang perlu diperbaiki.
  let any = false;
  for (let i = 0; i < out.length; i++) {
    if (out[i]) {
      any = true;
      break;
    }
  }
  return any ? out : null;
}

/** Dilasi masker biner, memakai dua pass separable. */
function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = 0;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let i = x0; i <= x1; i++) {
        if (mask[row + i] === 1) {
          m = 1;
          break;
        }
      }
      tmp[row + x] = m;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 0;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let i = y0; i <= y1; i++) {
        if (tmp[i * w + x] === 1) {
          m = 1;
          break;
        }
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

/** Box blur separable pada alfa (feather). Radius dalam piksel. */
function blurAlpha(alpha: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return alpha;
  const tmp = new Float32Array(alpha.length);
  const win = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += alpha[row + Math.min(w - 1, Math.max(0, i))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / win;
      const add = alpha[row + Math.min(w - 1, x + r + 1)];
      const sub = alpha[row + Math.max(0, x - r)];
      sum += add - sub;
    }
  }
  const out = new Float32Array(alpha.length);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += tmp[Math.min(h - 1, Math.max(0, i)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / win;
      const add = tmp[Math.min(h - 1, y + r + 1) * w + x];
      const sub = tmp[Math.max(0, y - r) * w + x];
      sum += add - sub;
    }
  }
  return out;
}

/**
 * Guided filter pada kanal alfa, memakai gambar RGB sebagai pemandu.
 *
 * Ini teknik paling berpengaruh untuk kualitas tepi rambut. Alasannya:
 * model menghasilkan mask pada resolusi rendah (biasanya 1024 px) lalu di-upscale
 * ke ukuran foto asli, sehingga muncul blok/blok kecil (pixelated). Guided filter
 * mengoreksi alfa agar mengikuti tepi warna RGB asli yang beresolusi penuh.
 *
 * Rumus (He, Sun, Tang 2010) dengan jendela kotak radius r:
 *   a = cov(I, p) / (var(I) + eps),  b = mean(p) - a * mean(I)
 *   q = mean(a) * I + mean(b)
 * Untuk alfa satu kanal, I = luminance RGB, p = alfa.
 *
 * `eps` mengatur seberapa kuat tepi RGB diikuti; nilai kecil = ikut tepi lebih ketat.
 */
function guidedFilterAlpha(rgb: Uint8ClampedArray, alpha: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  if (r <= 0) return alpha;
  const n = w * h;

  // Pemandu: luminance (persepsi mata, Rec.709).
  const guide = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    guide[i] = (0.2126 * rgb[p] + 0.7152 * rgb[p + 1] + 0.0722 * rgb[p + 2]) / 255;
  }
  // Alfa dinormalkan ke 0..1 agar konsisten dengan pemandu.
  const p0 = new Float32Array(n);
  for (let i = 0; i < n; i++) p0[i] = alpha[i] / 255;

  const mean = (src: Float32Array) => boxMean(src, w, h, r);
  const meanI = mean(guide);
  const meanP = mean(p0);

  // Kovarians dan varians dihitung dari rata-rata hasil kali.
  const ip = new Float32Array(n);
  const ii = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ip[i] = guide[i] * p0[i];
    ii[i] = guide[i] * guide[i];
  }
  const meanIP = mean(ip);
  const meanII = mean(ii);

  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const cov = meanIP[i] - meanI[i] * meanP[i];
    const varI = meanII[i] - meanI[i] * meanI[i];
    const ai = cov / (Math.max(0, varI) + eps);
    a[i] = ai;
    b[i] = meanP[i] - ai * meanI[i];
  }

  const meanA = mean(a);
  const meanB = mean(b);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const q = meanA[i] * guide[i] + meanB[i];
    out[i] = Math.max(0, Math.min(1, q)) * 255;
  }
  return out;
}

/** Rata-rata kotak separable pada array float satu kanal. */
function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const win = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[row + Math.min(w - 1, Math.max(0, i))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / win;
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += tmp[Math.min(h - 1, Math.max(0, i)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / win;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * Haluskan kanal alfa dengan warna RGB di-unpremultiply agar tepi tidak berwarna latar lama.
 * Piksel tepi yang alpha-nya dinaikkan diisi warna dari piksel solid terdekat (dilasi warna).
 */
function decontaminate(rgb: Uint8ClampedArray, alpha: Float32Array, w: number, h: number, r: number) {
  if (r <= 0) return;
  const srcA = new Float32Array(alpha);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const a = alpha[p];
      // Hanya piksel tepi (semi transparan) yang diwarnai ulang dari piksel alfa tertinggi di sekitarnya.
      if (a <= 8 || a >= 248) continue;
      let best = -1;
      let bestA = a;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const q = yy * w + xx;
          if (srcA[q] > bestA) {
            bestA = srcA[q];
            best = q;
          }
        }
      }
      if (best >= 0 && bestA > a) {
        const sp = best * 4;
        const dp = p * 4;
        // Warna piksel solid terdekat dipakai; alfa tetap.
        rgb[dp] = rgb[sp];
        rgb[dp + 1] = rgb[sp + 1];
        rgb[dp + 2] = rgb[sp + 2];
      }
    }
  }
}

/** ImageData baru; di lingkungan tanpa ImageData (uji Node) kembalikan objek setara. */
function newImageData(w: number, h: number): ImageData {
  if (typeof ImageData !== "undefined") return new ImageData(w, h);
  return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h } as unknown as ImageData;
}

export function refineMatteData(data: ImageData, opts: MatteOptions): ImageData {
  const { width: w, height: h } = data;
  const n = w * h;
  const rgb = data.data;
  let alpha: Float32Array = new Float32Array(n);
  for (let i = 0; i < n; i++) alpha[i] = rgb[i * 4 + 3];

  // 1. Buang pulau kecil, TAPI lindungi helai rambut.
  //
  // Masalah versi sebelumnya: semua komponen kecil dibuang, termasuk helai
  // rambut yang menonjol keluar dari kepala (memang terpisah secara 4-konektivitas
  // tapi bagian dari subjek). Sekarang komponen kecil hanya dibuang bila:
  // - benar-benar kecil (di bawah ambang absolut), DAN
  // - tidak berada dekat subjek utama.
  //
  // Radius proteksi 24 px: cukup lebar untuk mencakup helai rambut yang
  // menonjol dari kepala, tapi tetap membuang bercak di sudut gambar.
  if (opts.cleanIslands > 0) {
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) mask[i] = alpha[i] > FG_THRESHOLD ? 1 : 0;
    const { labels, areas } = label(mask, w, h, (v) => v === 1);
    if (areas.length > 1) {
      let largest = 0;
      let largestId = -1;
      for (let i = 0; i < areas.length; i++) {
        if (areas[i] > largest) {
          largest = areas[i];
          largestId = i;
        }
      }
      const minArea = Math.max(24, (largest * opts.cleanIslands) / 100);

      // Tandai area dekat subjek utama. Memakai pendekatan dua tahap:
      // pertama tandai piksel subjek, lalu dilasi dengan radius besar.
      const near = new Uint8Array(n);
      const RADIUS = 24;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const p = y * w + x;
          if (labels[p] !== largestId) continue;
          const y0 = Math.max(0, y - RADIUS);
          const y1 = Math.min(h - 1, y + RADIUS);
          const x0 = Math.max(0, x - RADIUS);
          const x1 = Math.min(w - 1, x + RADIUS);
          for (let yy = y0; yy <= y1; yy++) {
            const row = yy * w;
            for (let xx = x0; xx <= x1; xx++) near[row + xx] = 1;
          }
        }
      }

      for (let i = 0; i < n; i++) {
        const id = labels[i];
        if (id < 0 || id === largestId) continue;
        // Buang hanya bila kecil DAN jauh dari subjek utama.
        if (areas[id] < minArea && !near[i]) alpha[i] = 0;
      }
    }
  }

  // 2. Isi lubang kecil yang terkepung subjek.
  if (opts.fillHoles > 0) {
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) mask[i] = alpha[i] > FG_THRESHOLD ? 1 : 0;
    const { labels, areas, touchesEdge } = label(mask, w, h, (v) => v === 0);
    let largest = 0;
    for (const a of areas) if (a > largest) largest = a;
    const maxHole = Math.max(16, (largest * opts.fillHoles) / 100);
    for (let i = 0; i < n; i++) {
      const id = labels[i];
      if (id >= 0 && !touchesEdge[id] && areas[id] <= maxHole) alpha[i] = 255;
    }
  }

  // 3. Median filter sadar-detail: bersihkan bercak di area solid,
  //    lewati area transisi (rambut, tepi telinga) agar tidak terhapus.
  if (opts.speckleClean > 0) {
    alpha = medianAlpha(alpha, w, h, Math.round(opts.speckleClean));
  }

  // 4. Kurva alfa sadar-detail: paksa transparan hanya piksel samar di area solid.
  if (opts.alphaContrast > 0) {
    alpha = contrastAlpha(alpha, opts.alphaContrast, w, h);
  }

  // 4b. Padatkan area tebal yang salah terdeteksi sebagai semi-transparan.
  // Ini menyelesaikan kasus pakaian gelap (jas hitam) yang ikut transparan
  // karena warnanya mirip latar. Area TIPIS (rambut) tidak tersentuh.
  if (opts.solidifyRadius > 0 && opts.solidifyStrength > 0) {
    alpha = solidifyRegions(alpha, rgb, w, h, Math.round(opts.solidifyRadius), opts.solidifyStrength);
  }

  // 5. Guided filter: selaraskan alfa dengan tepi warna RGB asli.
  // Dijalankan SEBELUM defringe agar pemandu masih memakai warna tepi yang asli.
  // Ini kunci utama kualitas rambut: menghilangkan blok hasil upscale model
  // sekaligus MEMPERTAHANKAN detail halus (bukan menghapusnya).
  if (opts.guideRadius > 0) {
    alpha = guidedFilterAlpha(rgb, alpha, w, h, Math.round(opts.guideRadius), opts.guideEps);
  }

  // 6. Kerutkan tepi sadar-detail: hanya tepi tebal yang dikikis,
  //    detail tipis dibiarkan agar rambut dan telinga tetap utuh.
  if (opts.edgeShrink > 0) {
    alpha = erodeAlpha(alpha, w, h, Math.round(opts.edgeShrink));
  }

  // 7. Haluskan tepi dan bersihkan warna tepi.
  if (opts.edgeFeather > 0) {
    decontaminate(rgb, alpha, w, h, Math.max(2, Math.round(opts.edgeFeather) * 2));
    alpha = blurAlpha(alpha, w, h, Math.round(opts.edgeFeather));
  }

  const out = newImageData(w, h);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    out.data[p] = rgb[p];
    out.data[p + 1] = rgb[p + 1];
    out.data[p + 2] = rgb[p + 2];
    out.data[p + 3] = Math.max(0, Math.min(255, Math.round(alpha[i])));
  }
  return out;
}

/** Terapkan pasca-proses ke blob PNG dan kembalikan PNG baru. Jalan di jendela maupun worker. */
export async function refineMatteBlob(blob: Blob, opts: MatteOptions): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(bitmap.width, bitmap.height)
        : document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const refined = refineMatteData(data, opts);
    ctx.putImageData(refined, 0, 0);
    if (canvas instanceof OffscreenCanvas) {
      return await canvas.convertToBlob({ type: "image/png" });
    }
    return await new Promise<Blob>((resolve) => (canvas as HTMLCanvasElement).toBlob((b) => resolve(b ?? blob), "image/png"));
  } finally {
    bitmap.close();
  }
}
