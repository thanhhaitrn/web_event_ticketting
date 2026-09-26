"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import SiteToggle from "@/components/SiteToggle";

export default function OrganizerNav() {
  const pathname = usePathname();
  const onLanding = pathname === "/organizer";

  return (
    <header className="org-nav">
      <div className="org-nav-inner">
        <Link href="/organizer" className="brand org-brand">
          <BrandMark size={24} />
          <span className="org-wordmark">
            venu <em>cho ban tổ chức</em>
          </span>
        </Link>

        <div className="nav-spacer" />

        <div className="org-nav-actions">
          {onLanding ? (
            <>
              <Link href="/organizer/events" className="org-btn outline">
                Đăng nhập
              </Link>
              <Link href="/organizer/events" className="org-btn solid">
                Đăng ký
              </Link>
            </>
          ) : null}
          <SiteToggle />
        </div>
      </div>
    </header>
  );
}
