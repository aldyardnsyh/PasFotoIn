import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

/**
 * Plus Jakarta Sans: typeface geometris humanis dengan terminal lembut.
 * Terasa modern dan ramah, tapi tetap rapi di ukuran kecil, cocok untuk
 * antarmuka alat kerja tanpa terlihat generik.
 */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono-code",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PasFotoIn, Ubah rasio dan latar foto",
  description:
    "Ubah rasio dan latar foto langsung di browser. Preset pas foto resmi Indonesia, hapus latar otomatis, siap cetak. Foto tidak pernah diunggah.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${jakarta.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <Toaster
          position="bottom-right"
          visibleToasts={3}
          closeButton
          gap={10}
          toastOptions={{
            classNames: {
              toast:
                "group flex w-full items-start gap-3 rounded-xl border border-gray-200 bg-white p-3.5 shadow-lg",
              title: "text-[13px] font-semibold text-gray-900",
              description: "text-[12px] leading-5 text-gray-600",
              closeButton:
                "!left-auto !right-2 !top-2 !h-6 !w-6 !rounded-md !border-gray-200 !bg-white !text-gray-400 hover:!text-gray-900",
              actionButton: "!h-7 !rounded-lg !bg-primary-600 !px-2.5 !text-[11.5px] !font-semibold !text-white",
              cancelButton: "!h-7 !rounded-lg !bg-gray-100 !px-2.5 !text-[11.5px] !font-medium !text-gray-600",
              success: "!border-l-[3px] !border-l-success",
              error: "!border-l-[3px] !border-l-danger",
              warning: "!border-l-[3px] !border-l-warning",
              info: "!border-l-[3px] !border-l-primary-600",
            },
          }}
        />
      </body>
    </html>
  );
}
