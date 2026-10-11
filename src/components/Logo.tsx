/**
 * Wordmark PasFotoIn dengan mark presisi (bingkai foto + tanda pangkas).
 * Diadaptasi dari logo Stitch (logo_icon_pasfotoin), versi ringkas untuk header.
 */
export default function Logo({ size = 24, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden focusable="false">
        <defs>
          <linearGradient id="pfi-blue" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>
        <rect x="24" y="24" width="464" height="464" rx="108" fill="#ffffff" stroke="#e0e7ff" strokeWidth="10" />
        <rect x="136" y="96" width="240" height="320" rx="28" fill="#eff6ff" stroke="#93c5fd" strokeWidth="8" />
        <ellipse cx="256" cy="204" rx="46" ry="52" fill="url(#pfi-blue)" />
        <path d="M174 380 C174 290, 204 278, 256 278 C308 278, 338 290, 338 380 Z" fill="url(#pfi-blue)" />
        <path d="M256 278 L266 312 L256 360 L246 312 Z" fill="#ffffff" opacity="0.95" />
        <path d="M104 156 L104 120 C104 104 116 92 132 92 L168 92" fill="none" stroke="#2563eb" strokeWidth="22" strokeLinecap="round" />
        <path d="M344 92 L380 92 C396 92 408 104 408 120 L408 156" fill="none" stroke="#2563eb" strokeWidth="22" strokeLinecap="round" />
        <path d="M104 356 L104 392 C104 408 116 420 132 420 L168 420" fill="none" stroke="#2563eb" strokeWidth="22" strokeLinecap="round" />
        <path d="M344 420 L380 420 C396 420 408 408 408 392 L408 356" fill="none" stroke="#2563eb" strokeWidth="22" strokeLinecap="round" />
      </svg>
      {withWordmark && <span className="text-[15px] font-semibold tracking-tight text-gray-900">PasFotoIn</span>}
    </span>
  );
}
