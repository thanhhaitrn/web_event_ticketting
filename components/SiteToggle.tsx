"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteToggle() {
  const pathname = usePathname();
  const onOrganizer = pathname.startsWith("/organizer");

  return (
    <div className="site-toggle" role="group" aria-label="Chọn phiên bản trang">
      <Link
        href="/"
        className={`st-opt ${onOrganizer ? "" : "active"}`}
        aria-current={onOrganizer ? undefined : "page"}
      >
        Người hâm mộ
      </Link>
      <Link
        href="/organizer"
        className={`st-opt ${onOrganizer ? "active" : ""}`}
        aria-current={onOrganizer ? "page" : undefined}
      >
        Ban tổ chức
      </Link>
    </div>
  );
}
