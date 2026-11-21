import { NextRequest, NextResponse } from "next/server";
import {
  ORGANIZER_COOKIE,
  SESSION_SECONDS,
  checkPassword,
  createSession,
  organizerLock,
  safeNext,
} from "@/lib/organizer-auth";

// POST /api/organizer/login — the login form posts here; answers are redirects, so it works without JavaScript
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const next = safeNext(form?.get("next"));
  const back = (error: string) => {
    const query = new URLSearchParams({ error, next });
    return new NextResponse(null, { status: 303, headers: { Location: `/organizer/login?${query}` } });
  };

  if (organizerLock() === "locked") return back("config");
  const password = form?.get("password");
  if (typeof password !== "string" || !(await checkPassword(password)))
    return back("password");

  // Keep the session on the browser's host even when Next normalizes the server URL.
  const response = new NextResponse(null, { status: 303, headers: { Location: next } });
  // Allow plain HTTP only for a deliberately configured loopback preview.
  const localHttpPreview = process.env.ORGANIZER_LOCAL_PREVIEW === "1" &&
    request.nextUrl.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(request.nextUrl.hostname);
  response.cookies.set(ORGANIZER_COOKIE, await createSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !localHttpPreview,
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return response;
}
