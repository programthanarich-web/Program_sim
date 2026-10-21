import { NextResponse, type NextRequest } from "next/server";
import { optionalServerEnv } from "@/lib/env";
import { verifyLineSignature } from "@/lib/notifications/line-signature";


/**
 * รับ webhook จาก LINE Platform
 * - ตรวจ x-line-signature กับ body ดิบก่อนทำอะไรทั้งสิ้น
 * - ระบบนี้ใช้ webhook เพื่อรู้ groupId ตอนตั้งค่า (เมื่อบอทถูกเชิญเข้ากลุ่ม) เท่านั้น
 * - ไม่มีการเก็บข้อความของผู้ใช้
 */
export async function POST(request: NextRequest) {
  const secret = optionalServerEnv.lineChannelSecret;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const valid = verifyLineSignature(rawBody, request.headers.get("x-line-signature"), secret);
  if (!valid) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  if (optionalServerEnv.nodeEnv !== "production") {
    // ใช้ตอนตั้งค่าเท่านั้น: ดู groupId ของกลุ่มที่บอทเข้าร่วม
    const parsed = JSON.parse(rawBody) as { events?: Array<{ type?: string; source?: { type?: string; groupId?: string } }> };
    for (const event of parsed.events ?? []) {
      if (event.type === "join" && event.source?.type === "group") {
        console.info("[line] bot joined group, groupId =", event.source.groupId);
      }
    }
  }

  return NextResponse.json({});
}
