// Ports: สิ่งที่ adapter ต้องการจากภายนอก (orders, database, storage)
// adapter ไม่ import โค้ดของ orders โดยตรง ฝั่ง orders เป็นคนเติม implementation

import type { SlipMime } from "@pt/shared/payments/slip-file";
import type { Satang } from "./types";

export interface ExpectedPayment {
  paymentId: string;
  reference: string;
  /** ยอดที่ระบบคาดหวังจาก snapshot ของคำสั่งซื้อ ไม่ใช่ยอดจาก client */
  amount: Satang;
  currency: "THB";
  /** provider payment id ที่ผูกไว้ตอนสร้าง intent (null ถ้ายังไม่ผูก) */
  providerPaymentId: string | null;
}

export interface PaymentLookup {
  findByReference(reference: string): Promise<ExpectedPayment | null>;
}

export interface ConfirmedPayment {
  paymentId: string;
  providerId: string;
  providerPaymentId: string;
  amount: Satang;
  currency: "THB";
  reference: string;
  paidAt: Date | null;
}

/** ฝั่ง orders รับผลการชำระที่ยืนยันแล้ว แล้วเปลี่ยนสถานะเอง */
export interface PaymentSink {
  onPaymentConfirmed(payment: ConfirmedPayment): Promise<void>;
}

export type WebhookRegistration = "new" | "retry" | "already_handled" | "in_progress" | "payload_mismatch";

export interface WebhookEventStore {
  register(input: {
    provider: string;
    eventId: string;
    eventType: string;
    payloadSha256: string;
  }): Promise<WebhookRegistration>;
  complete(provider: string, eventId: string, status: "processed" | "rejected" | "failed"): Promise<void>;
}

export interface SlipStorage {
  put(path: string, bytes: Uint8Array, mime: SlipMime): Promise<void>;
  remove(path: string): Promise<void>;
}
