/** ผลลัพธ์ของ service: สำเร็จพร้อมข้อมูล หรือไม่สำเร็จพร้อมข้อความที่แสดงให้ผู้ใช้ */
export type ServiceResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** state ของ Server Action ที่ใช้กับ useActionState ฝั่ง client */
export interface ActionState {
  step?: "phone" | "otp";
  /** เบอร์ที่ปิดบังไม่ได้ ใช้ส่งต่อไปขั้นยืนยัน OTP (เบอร์ของผู้ใช้เอง) */
  phone?: string;
  error?: string;
  success?: string;
}
