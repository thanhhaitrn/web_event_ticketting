import { NextRequest, NextResponse } from "next/server";

// Chưa có tài khoản, nên người mua được nhận diện bằng một id ngẫu nhiên trong cookie.
const COOKIE = "venu_buyer";

export function buyerIdOf(request: NextRequest): string | undefined {
  return request.cookies.get(COOKIE)?.value;
}

/** gắn id mới vào phản hồi khi trình duyệt chưa có */
export function rememberBuyer(response: NextResponse, buyerId: string) {
  response.cookies.set(COOKIE, buyerId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
