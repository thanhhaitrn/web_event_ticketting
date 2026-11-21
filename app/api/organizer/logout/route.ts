import { NextResponse } from "next/server";
import { ORGANIZER_COOKIE } from "@/lib/organizer-auth";

// POST /api/organizer/logout
export async function POST() {
  const response = new NextResponse(null, { status: 303, headers: { Location: "/organizer" } });
  response.cookies.delete(ORGANIZER_COOKIE);
  return response;
}
