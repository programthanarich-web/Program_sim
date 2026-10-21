import { sha256Hex } from "@pt/shared/payments/crypto";

/** hash ของ body ดิบ ใช้ตรวจว่า event id เดิมถูกส่งมาพร้อมเนื้อหาเดิมหรือไม่ */
export function payloadSha256(rawBody: string): string {
  return sha256Hex(rawBody);
}
