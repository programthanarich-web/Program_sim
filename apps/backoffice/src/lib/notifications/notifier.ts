import { randomUUID } from "node:crypto";
import type { Notifier, SendRequest, SendResult } from "./types";

/**
 * Mock notifier: ใช้เมื่อยังไม่มี credentials ของ LINE (dev/test เท่านั้น)
 * จำลองพฤติกรรมที่สำคัญของ LINE คือ retry key เดิมจะไม่ส่งข้อความซ้ำ
 * ไม่มี token และไม่เรียกเครือข่าย
 */
export class MockNotifier implements Notifier {
  readonly name = "mock";
  readonly delivered: SendRequest[] = [];
  /** จำลองความล้มเหลวชั่วคราวจำนวนหนึ่งครั้ง (สำหรับทดสอบ retry) */
  transientFailures = 0;
  private readonly acceptedKeys = new Set<string>();

  async send(request: SendRequest): Promise<SendResult> {
    if (this.transientFailures > 0) {
      this.transientFailures -= 1;
      return { ok: false, retryable: true, error: "mock transient failure" };
    }
    if (this.acceptedKeys.has(request.retryKey)) {
      return { ok: true, providerMessageId: null };
    }
    this.acceptedKeys.add(request.retryKey);
    this.delivered.push(request);
    return { ok: true, providerMessageId: `mock-${randomUUID()}` };
  }
}
