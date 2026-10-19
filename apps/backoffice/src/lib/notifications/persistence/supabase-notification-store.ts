import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { CompleteInput, NotificationRow, NotificationStore } from "../types";

/**
 * outbox ผ่านฟังก์ชัน claim_notifications / complete_notification (service_role เท่านั้น)
 * ไม่ส่งค่าใดๆ ที่เป็นความลับออกจากฟังก์ชันนี้
 */
export function createSupabaseNotificationStore(): NotificationStore {
  return {
    async claim(limit: number): Promise<NotificationRow[]> {
      const db = createSupabaseServiceClient();
      const { data, error } = await db.rpc("claim_notifications", { p_limit: limit });
      if (error) throw new Error("claim_notifications failed");
      return (data ?? []) as NotificationRow[];
    },

    async complete(id: string, input: CompleteInput): Promise<void> {
      const db = createSupabaseServiceClient();
      const params =
        input.outcome === "sent"
          ? { p_id: id, p_outcome: "sent", p_provider_message_id: input.providerMessageId, p_error: null, p_retry_after_seconds: null }
          : input.outcome === "retry"
            ? { p_id: id, p_outcome: "retry", p_provider_message_id: null, p_error: input.error, p_retry_after_seconds: input.retryAfterSeconds }
            : { p_id: id, p_outcome: "failed", p_provider_message_id: null, p_error: input.error, p_retry_after_seconds: null };
      const { error } = await db.rpc("complete_notification", params);
      if (error) throw new Error("complete_notification failed");
    },
  };
}
