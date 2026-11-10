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
    const url = new URL("/organizer/login", request.url);
    url.searchParams.set("error", error);
    url.searchParams.set("next", next);
    return NextResponse.redirect(url, 303);
  };

  if (organizerLock() === "locked") return back("config");
  const password = form?.get("password");
  if (typeof password !== "string" || !(await checkPassword(password)))
    return back("password");

  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(ORGANIZER_COOKIE, await createSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return response;
}
