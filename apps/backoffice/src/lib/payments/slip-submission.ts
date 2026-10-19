import { PaymentAdapterError } from "@pt/shared/payments/errors";
import { buildSlipStoragePath, validateSlipFile, type SlipMime } from "@pt/shared/payments/slip-file";
import type { SlipStorage } from "./ports";

export interface SlipRecord {
  paymentId: string;
  customerId: string;
  storagePath: string;
  sha256: string;
  mime: SlipMime;
  sizeBytes: number;
}

export interface SubmitSlipInput {
  customerId: string;
  paymentId: string;
  bytes: Uint8Array;
  declaredMime?: string;
}

/**
 * ทางแจ้งชำระแบบ manual review (ไม่มี API ตรวจสลิป)
 * - ตรวจไฟล์จริงจาก magic bytes และขนาด แล้วคำนวณ hash ฝั่ง server
 * - เก็บเข้า private bucket
 * - บันทึกเป็น "รอตรวจ" ผ่าน callback ที่ฝั่ง payments/orders ให้มา
 * ไม่มีการอนุมัติจากไฟล์หรือ OCR ในขั้นตอนนี้ การอนุมัติเป็นของพนักงานเท่านั้น
 */
export async function submitSlipForManualReview(
  input: SubmitSlipInput,
  deps: {
    storage: SlipStorage;
    recordPendingReview: (record: SlipRecord) => Promise<void>;
  },
): Promise<SlipRecord> {
  const validated = validateSlipFile(input.bytes, input.declaredMime);
  const storagePath = buildSlipStoragePath(input.customerId, validated.extension);

  await deps.storage.put(storagePath, input.bytes, validated.mime);

  const record: SlipRecord = {
    paymentId: input.paymentId,
    customerId: input.customerId,
    storagePath,
    sha256: validated.sha256,
    mime: validated.mime,
    sizeBytes: validated.sizeBytes,
  };

  try {
    await deps.recordPendingReview(record);
  } catch (error) {
    // บันทึกไม่สำเร็จ (เช่น hash ซ้ำ) ต้องลบไฟล์ที่เพิ่งอัปโหลดเพื่อไม่ให้ค้าง
    await deps.storage.remove(storagePath).catch(() => undefined);
    if (error instanceof PaymentAdapterError) throw error;
    throw new PaymentAdapterError("provider_error", "failed to record slip for review");
  }
  return record;
}
