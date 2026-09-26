import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Venu — Sự kiện & vé",
  description: "Khám phá sự kiện, và công cụ cho ban tổ chức quản lý khu vực ghế, giá vé.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- This root layout is shared by every App Router page. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
