import { NextRequest, NextResponse } from "next/server";
import { ORGANIZER_COOKIE } from "@/lib/organizer-auth";

// POST /api/organizer/logout
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(
    new URL("/organizer", request.url),
    303,
  );
  response.cookies.delete(ORGANIZER_COOKIE);
  return response;
}
