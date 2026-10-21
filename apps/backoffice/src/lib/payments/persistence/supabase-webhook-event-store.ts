import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { PaymentAdapterError } from "@pt/shared/payments/errors";
import type { WebhookEventStore, WebhookRegistration } from "../ports";

const TABLE = "payment_webhook_events";
const UNIQUE_VIOLATION = "23505";

/**
 * บันทึก webhook ลงตาราง payment_webhook_events (ใช้ service role บนเซิร์ฟเวอร์เท่านั้น)
 * ตารางมี unique (provider, event_id) ดังนั้นการแข่งกันระหว่างสอง request จะมีผู้ชนะเพียงรายเดียว
 */
export function createSupabaseWebhookEventStore(): WebhookEventStore {
  return {
    async register({ provider, eventId, eventType, payloadSha256 }): Promise<WebhookRegistration> {
      const db = createSupabaseServiceClient();
      const insert = await db.from(TABLE).insert({
        provider,
        event_id: eventId,
        event_type: eventType,
        payload_sha256: payloadSha256,
        status: "received",
      });
      if (!insert.error) return "new";
      if (insert.error.code !== UNIQUE_VIOLATION) {
        throw new PaymentAdapterError("provider_error", "failed to record webhook event");
      }

      const existing = await db
        .from(TABLE)
        .select("status, payload_sha256")
        .eq("provider", provider)
        .eq("event_id", eventId)
        .single();
      if (existing.error || !existing.data) {
        throw new PaymentAdapterError("provider_error", "failed to read existing webhook event");
      }
      const row = existing.data as { status: string; payload_sha256: string };

      if (row.payload_sha256 !== payloadSha256) return "payload_mismatch";
      if (row.status === "processed" || row.status === "rejected") return "already_handled";
      if (row.status === "received") return "in_progress";

      // failed: claim ใหม่ด้วยเงื่อนไข status = failed เพื่อให้มีผู้ประมวลผลเพียงรายเดียว
      const claimed = await db
        .from(TABLE)
        .update({ status: "received", processed_at: null })
        .eq("provider", provider)
        .eq("event_id", eventId)
        .eq("status", "failed")
        .select("id");
      if (claimed.error) {
        throw new PaymentAdapterError("provider_error", "failed to claim webhook event");
      }
      return claimed.data && claimed.data.length > 0 ? "retry" : "in_progress";
    },

    async complete(provider, eventId, status) {
      const db = createSupabaseServiceClient();
      const { error } = await db
        .from(TABLE)
        .update({ status, processed_at: new Date().toISOString() })
        .eq("provider", provider)
        .eq("event_id", eventId);
      if (error) {
        throw new PaymentAdapterError("provider_error", "failed to complete webhook event");
      }
    },
  };
}
