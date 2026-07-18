import type { Metadata } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
import "./globals.css";

// Be Vietnam Pro: bộ chữ thiết kế riêng cho tiếng Việt — dấu rõ, hợp ngữ cảnh sản phẩm.
// next/font tự host font (không gọi ra CDN ngoài lúc chạy) → hợp yêu cầu on-premise.
const beVietnam = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Mono cho các chip thông số (BTU, dB) — đọc như chỉ số máy đo.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Trợ lý tư vấn máy lạnh — Điện Máy Xanh (demo)",
  description:
    "Trợ lý tư vấn máy lạnh theo diện tích phòng và ngân sách, gợi ý từ dữ liệu sản phẩm thật.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="vi"
      className={`${beVietnam.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
