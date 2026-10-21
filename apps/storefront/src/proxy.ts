import { NextResponse, type NextRequest } from "next/server";

/**
 * หน้าบ้านลูกค้า: ตรวจ cookie แบบ optimistic เฉพาะหน้าที่ต้องล็อกอิน
 * การตรวจสิทธิ์จริงทำซ้ำฝั่ง server ทุกครั้ง (services/customer-auth)
 * Supabase เก็บ session ใน cookie ชื่อ sb-<project-ref>-auth-token
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsLogin = pathname === "/packages" || pathname.startsWith("/packages/") || pathname.startsWith("/orders");
  if (!needsLogin) return NextResponse.next();

  const hasSession = request.cookies.getAll().some(({ name }) => /^sb-.+-auth-token/.test(name));
  if (!hasSession) {
    return NextResponse.redirect(new URL("/verify-phone", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/packages/:path*", "/orders/:path*", "/orders"],
};
