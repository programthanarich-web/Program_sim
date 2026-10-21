import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { PaymentAdapterError } from "./errors";

const HEX_64 = /^[0-9a-f]{64}$/i;

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hmacSha256Hex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

/** เปรียบเทียบลายเซ็นแบบ constant-time; ค่าที่ไม่ใช่ hex 64 ตัวถือว่าไม่ผ่าน */
export function verifyHmacSha256Hex(secret: string, message: string, signatureHex: string): boolean {
  if (!HEX_64.test(signatureHex)) return false;
  const expected = Buffer.from(hmacSha256Hex(secret, message), "hex");
  const given = Buffer.from(signatureHex, "hex");
  return timingSafeEqual(expected, given);
}

export const WEBHOOK_TOLERANCE_SECONDS = 300;

/** กัน replay: timestamp ต้องอยู่ในช่วงที่ยอมรับได้รอบเวลาปัจจุบัน */
export function assertFreshTimestamp(
  timestampSeconds: string | undefined,
  now: Date,
  toleranceSeconds = WEBHOOK_TOLERANCE_SECONDS,
): void {
  if (!timestampSeconds || !/^\d{1,12}$/.test(timestampSeconds)) {
    throw new PaymentAdapterError("malformed_webhook", "missing or malformed timestamp");
  }
  const skew = Math.abs(now.getTime() / 1000 - Number(timestampSeconds));
  if (skew > toleranceSeconds) {
    throw new PaymentAdapterError("stale_webhook", "webhook timestamp outside tolerance");
  }
}
