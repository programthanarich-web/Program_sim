/**
 * ตรวจและแปลงเบอร์มือถือไทยให้อยู่ในรูปแบบ 0XXXXXXXXX (10 หลัก)
 * รองรับ: 0812345678, 081-234-5678, +66812345678, 66812345678
 * คืนค่า null ถ้าไม่ใช่เบอร์มือถือไทยที่ถูกต้อง (06, 08, 09)
 *
 * ไฟล์นี้ไม่มี server-only เพื่อให้ใช้ตรวจรูปแบบฝั่ง client ได้ด้วย
 */
export function normalizeThaiPhone(input: string): string | null {
  let digits = input.replace(/[\s-]/g, "");

  if (digits.startsWith("+66")) {
    digits = `0${digits.slice(3)}`;
  } else if (digits.startsWith("66") && digits.length === 11) {
    digits = `0${digits.slice(2)}`;
  }

  return /^0[689]\d{8}$/.test(digits) ? digits : null;
}

/** ปิดบังเบอร์ เช่น 081-XXX-X678 เพื่อแสดงผลโดยไม่เปิดเผยเบอร์เต็ม */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}-XXX-X${phone.slice(-3)}`;
}

/** แปลงเบอร์ไทย 0XXXXXXXXX เป็นรูปแบบ E.164 (+66XXXXXXXXX) ที่ Supabase Phone Auth ใช้ */
export function toE164Thai(phone: string): string {
  return `+66${phone.slice(1)}`;
}
