import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { optionalServerEnv } from "@/lib/env";
import { dispatchNotificationsNow } from "@/lib/notifications/service";


/** เรียกจากตัวตั้งเวลาภายนอก: ต้องส่ง Authorization: Bearer <NOTIFY_DISPATCH_SECRET> */
export async function POST(request: NextRequest) {
  const expected = optionalServerEnv.notifyDispatchSecret;
  if (!expected) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const given = Buffer.from(header.replace(/^Bearer /, ""));
  const want = Buffer.from(expected);
  const valid = given.length === want.length && timingSafeEqual(given, want);
  if (!valid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const outcome = await dispatchNotificationsNow();
  if (outcome.status !== "ok") {
    return NextResponse.json({ error: outcome.reason }, { status: 503 });
  }
  return NextResponse.json({ notifier: outcome.notifier, ...outcome.summary });
}
