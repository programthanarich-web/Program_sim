import { NextResponse, type NextRequest } from "next/server";

/**
 * หลังบ้าน: ทุกหน้าใต้ /admin ต้องมี session (ยกเว้นหน้าเข้าสู่ระบบ)
 * การตรวจสิทธิ์พนักงานจริงทำซ้ำใน services/admin ทุกครั้ง
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login" || !pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.getAll().some(({ name }) => /^sb-.+-auth-token/.test(name));
  if (!hasSession) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
