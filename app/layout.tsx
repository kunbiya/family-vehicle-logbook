import type { Metadata } from "next";
import "./globals.css";
import { BusyProvider } from "./busy-layer";

export const metadata: Metadata = {
  title: "차량 운행·정비 관리",
  description: "가족이 함께 사용하는 차량 운행 및 정비 관리 대시보드",
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased"><BusyProvider>{children}</BusyProvider></body>
    </html>
  );
}
