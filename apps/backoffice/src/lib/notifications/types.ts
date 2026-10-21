// ชนิดข้อมูลของการแจ้งเตือน (outbox ใน notification_logs)

export type NotificationTemplate = "payment_received" | "signup_queue" | "signup_result";

export type SignupOutcome = "success" | "failed" | "needs_info";

/** ข้อมูลที่อนุญาตให้อยู่ใน payload: ไม่มีเบอร์ อีเมล ชื่อ หรือ path ของสลิป */
export interface OrderNotificationPayload {
  order_id: string;
  order_number: number;
  package_name: string;
  amount_thb: number;
}

export interface SignupResultPayload extends OrderNotificationPayload {
  outcome: SignupOutcome;
}

/** แถวที่ worker หยิบมาส่ง (ตรงกับคอลัมน์ที่ claim_notifications คืนค่า) */
export interface NotificationRow {
  id: string;
  template: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
  retry_key: string;
}

export interface SendRequest {
  /** ใช้ค่านี้เดิมทุกครั้งที่ส่งซ้ำ เพื่อให้ LINE ไม่ส่งข้อความซ้ำ */
  retryKey: string;
  to: string;
  text: string;
}

export type SendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; retryable: boolean; retryAfterSeconds?: number; error: string };

export interface Notifier {
  readonly name: string;
  send(request: SendRequest): Promise<SendResult>;
}

export type CompleteInput =
  | { outcome: "sent"; providerMessageId: string | null }
  | { outcome: "retry"; error: string; retryAfterSeconds: number }
  | { outcome: "failed"; error: string };

export interface NotificationStore {
  claim(limit: number): Promise<NotificationRow[]>;
  complete(id: string, input: CompleteInput): Promise<void>;
}

export interface DispatchSummary {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
}
