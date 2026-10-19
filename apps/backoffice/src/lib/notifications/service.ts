import "server-only";
import { optionalServerEnv } from "@/lib/env";
import { dispatchDueNotifications } from "./dispatcher";
import { LineMessagingNotifier } from "./line-notifier";
import { MockNotifier } from "./notifier";
import { createSupabaseNotificationStore } from "./persistence/supabase-notification-store";
import type { DispatchSummary } from "./types";

export type DispatchOutcome =
  | { status: "ok"; summary: DispatchSummary; notifier: string }
  | { status: "not_configured"; reason: string };

/** mock ใช้เฉพาะ dev/test เท่านั้น: ไม่มีทางส่งจริง จึงไม่ถูกนับว่าส่งถึงกลุ่มใน production */
const DEV_MOCK_TARGET = "mock-group";

/**
 * ส่งรายการค้างทั้งหมดหนึ่งรอบ
 * - มี credentials ของ LINE -> ส่งจริงเข้ากลุ่มที่กำหนด
 * - ไม่มี credentials และไม่ใช่ production -> ใช้ mock (ไม่มีการส่งจริง)
 * - ไม่มี credentials ใน production -> ไม่ทำอะไร และไม่ทำเครื่องหมายว่าส่งแล้ว
 */
export async function dispatchNotificationsNow(): Promise<DispatchOutcome> {
  const token = optionalServerEnv.lineChannelAccessToken;
  const groupId = optionalServerEnv.lineGroupId;
  const baseUrl = optionalServerEnv.appBaseUrl;
  const isProduction = optionalServerEnv.nodeEnv === "production";

  if (!baseUrl) {
    return { status: "not_configured", reason: "ยังไม่ได้ตั้งค่า APP_BASE_URL" };
  }

  let notifier: LineMessagingNotifier | MockNotifier;
  let target: string;
  if (token && groupId) {
    notifier = new LineMessagingNotifier({ channelAccessToken: token });
    target = groupId;
  } else if (isProduction) {
    return { status: "not_configured", reason: "ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN และ LINE_GROUP_ID" };
  } else {
    notifier = new MockNotifier();
    target = DEV_MOCK_TARGET;
  }

  const summary = await dispatchDueNotifications({
    store: createSupabaseNotificationStore(),
    notifier,
    target,
    adminBaseUrl: baseUrl,
  });
  return { status: "ok", summary, notifier: notifier.name };
}
