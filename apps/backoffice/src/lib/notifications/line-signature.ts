import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ตรวจ header x-line-signature ของ webhook ตามเอกสาร LINE:
 * HMAC-SHA256 ของ body ดิบ ด้วย channel secret แล้วเข้ารหัส base64
 * ต้องใช้ body ก่อน parse เท่านั้น
 */
export function verifyLineSignature(rawBody: string, signatureHeader: string | null | undefined, channelSecret: string): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody, "utf8").digest();
  const given = Buffer.from(signatureHeader, "base64");
  if (given.length !== expected.length) return false;
  return timingSafeEqual(expected, given);
}
