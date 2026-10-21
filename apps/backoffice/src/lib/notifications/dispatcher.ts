import { PermanentNotificationError, renderNotification } from "./render";
import type { DispatchSummary, Notifier, NotificationStore } from "./types";

/** เวลารอก่อนลองใหม่ ตามจำนวนครั้งที่พยายามแล้ว (วินาที) */
export const RETRY_BACKOFF_SECONDS = [60, 300, 900, 3600] as const;

export function backoffSeconds(attempt: number): number {
  const index = Math.min(Math.max(attempt, 1), RETRY_BACKOFF_SECONDS.length) - 1;
  return RETRY_BACKOFF_SECONDS[index];
}

export interface DispatchDeps {
  store: NotificationStore;
  notifier: Notifier;
  /** ปลายทาง เช่น groupId ของ LINE */
  target: string;
  /** ฐาน URL ของหลังบ้าน ใช้สร้างลิงก์ในข้อความ */
  adminBaseUrl: string;
  batchSize?: number;
}

/**
 * ส่งรายการแจ้งเตือนที่ถึงกำหนดหนึ่งชุด
 * - ไม่ throw ถ้าการส่งรายการหนึ่งล้มเหลว; ทุกรายการจะถูกบันทึกผลเสมอ
 * - ถ้าข้อความสร้างไม่ได้ (payload ผิด) จะ mark failed ทันทีและไม่ลองใหม่
 */
export async function dispatchDueNotifications(deps: DispatchDeps): Promise<DispatchSummary> {
  const rows = await deps.store.claim(deps.batchSize ?? 20);
  const summary: DispatchSummary = { claimed: rows.length, sent: 0, retried: 0, failed: 0 };

  for (const row of rows) {
    let text: string;
    try {
      text = renderNotification(row, deps.adminBaseUrl);
    } catch (error) {
      const message = error instanceof PermanentNotificationError ? error.message : "render failed";
      await deps.store.complete(row.id, { outcome: "failed", error: message });
      summary.failed += 1;
      continue;
    }

    let result;
    try {
      result = await deps.notifier.send({ retryKey: row.retry_key, to: deps.target, text });
    } catch {
      result = { ok: false as const, retryable: true, error: "notifier threw" };
    }

    if (result.ok) {
      await deps.store.complete(row.id, { outcome: "sent", providerMessageId: result.providerMessageId });
      summary.sent += 1;
    } else if (result.retryable) {
      await deps.store.complete(row.id, {
        outcome: "retry",
        error: result.error,
        retryAfterSeconds: result.retryAfterSeconds ?? backoffSeconds(row.attempts),
      });
      summary.retried += 1;
    } else {
      await deps.store.complete(row.id, { outcome: "failed", error: result.error });
      summary.failed += 1;
    }
  }

  return summary;
}
