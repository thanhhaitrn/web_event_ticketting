import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import SiteToggle from "@/components/SiteToggle";
import FanAuthButtons from "@/components/FanAuthButtons";

export default function ViewerLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="site site-fans">
      <header className="topnav">
        <div className="topnav-inner">
          <Link href="/" className="brand">
            <BrandMark size={24} />
            venu
          </Link>

          <form className="search" action="/" method="get" role="search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input type="search" name="q" placeholder="Tìm sự kiện, địa điểm..." aria-label="Tìm sự kiện" />
          </form>

          <div className="nav-spacer" />

          <div className="nav-actions">
            <FanAuthButtons />
            <SiteToggle />
          </div>
        </div>
      </header>

      {children}

      <footer className="footer">
        <div className="footer-inner">
          <Link href="/" className="brand brand-stack">
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
        <div className="footer-bottom">© 2026 venu — Nền tảng sự kiện &amp; quản lý giá vé.</div>
      </footer>
    </div>
  );
}
