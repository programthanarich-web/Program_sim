import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { PaymentAdapterError } from "@pt/shared/payments/errors";
import type { SlipStorage } from "../ports";

export const SLIP_BUCKET = "payment-slips";

/**
 * เก็บสลิปใน private bucket (ไม่มี policy ให้ anon/authenticated)
 * เรียกได้เฉพาะจากเซิร์ฟเวอร์ที่ผ่านการตรวจไฟล์แล้ว (ดู slip-submission.ts)
 */
export function createSupabaseSlipStorage(): SlipStorage {
  return {
    async put(path, bytes, mime) {
      const db = createSupabaseServiceClient();
      const { error } = await db.storage
        .from(SLIP_BUCKET)
        .upload(path, bytes, { contentType: mime, upsert: false });
      if (error) {
        throw new PaymentAdapterError("provider_error", "failed to store slip");
      }
    },
    async remove(path) {
      const db = createSupabaseServiceClient();
      await db.storage.from(SLIP_BUCKET).remove([path]);
    },
  };
}
