import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import OrganizerNav from "@/components/OrganizerNav";

export default function OrganizerLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="site site-organizer">
      <OrganizerNav />

      {children}

      <footer className="footer">
        <div className="footer-inner">
          <Link href="/organizer" className="brand brand-stack">
            <BrandMark size={26} />
            <span>
              venu
              <em>concert ticket booking</em>
            </span>
          </Link>
          <nav className="footer-col">
            <Link href="/organizer">Giới thiệu</Link>
          </nav>
          <nav className="footer-col">
            <a href="https://github.com/thanhhaitrn/web_event_ticketting">Mã nguồn</a>
          </nav>
        </div>
        <div className="footer-bottom">© 2026 venu — Công cụ quản lý sự kiện &amp; giá vé cho ban tổ chức.</div>
      </footer>
    </div>
  );
}
