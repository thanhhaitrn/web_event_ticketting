import { NextResponse, type NextRequest } from "next/server";
import { ORGANIZER_COOKIE, isOrganizer } from "@/lib/organizer-auth";

// writes only organizers may make; buyers' /api/orders and /api/seats stay open
const GUARDED_API = [
  "/api/events",
  "/api/zones",
  "/api/shows",
  "/api/phases",
  "/api/prices",
  "/api/uploads",
];
const READS = ["GET", "HEAD", "OPTIONS"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const api = pathname.startsWith("/api/");
  if (
    api &&
    (READS.includes(request.method) ||
      !GUARDED_API.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
  ) {
    return NextResponse.next();
  }
  if (await isOrganizer(request.cookies.get(ORGANIZER_COOKIE)?.value))
    return NextResponse.next();

  if (api) {
    return NextResponse.json(
      { error: "Cần đăng nhập ban tổ chức để thay đổi dữ liệu." },
      { status: 401 },
    );
  }
  const login = new URL("/organizer/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/organizer/events/:path*", "/api/:path*"],
};
