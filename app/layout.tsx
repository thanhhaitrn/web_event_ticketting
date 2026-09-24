import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quản Lý Sự Kiện & Giá Vé",
  description: "Công cụ BTC tạo sự kiện, quản lý khu vực ghế và thiết lập giá vé.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Manrope:wght@500;600;700;800&family=IBM+Plex+Mono:wght@600&display=swap"
        />
      </head>
      <body>
        <nav className="topnav">
          <div className="topnav-inner">
            <a href="/" className="brand">
              Ticketweb <span className="dot">BTC</span>
            </a>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
