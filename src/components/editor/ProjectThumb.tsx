"use client";

/**
 * Pratinjau proyek dari IndexedDB.
 *
 * Thumbnail disimpan terpisah dari foto sumber (kecil, JPEG) sehingga daftar
 * riwayat bisa menampilkan pratinjau nyata tanpa memuat foto berukuran penuh.
 * Bila thumbnail tidak ada (proyek lama atau sudah dihapus), tampilkan ikon
 * netral — bukan kotak kosong yang membingungkan.
 */
import { useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { loadThumbnail } from "../../lib/storage";

export default function ProjectThumb({ projectId, name }: { projectId: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    loadThumbnail(projectId).then((blob) => {
      if (!alive) return;
      if (!blob) {
        setMissing(true);
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId]);

  if (url) {
    return (
      /* Thumbnail object-URL lokal, tidak bisa dioptimasi next/image */
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={`Pratinjau ${name}`}
        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
      />
    );
  }

  return (
    <span className={`flex h-full w-full items-center justify-center ${missing ? "text-gray-300" : "text-gray-200"}`}>
      <ImageIcon size={26} strokeWidth={1.5} aria-hidden />
    </span>
  );
}
