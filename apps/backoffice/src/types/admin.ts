export type StaffRole = "staff" | "admin";

export interface StaffUser {
  id: string;
  email: string;
  role: StaffRole;
}

/** ผลลัพธ์ของ admin server action: ข้อความภาษาไทยเสมอ */
export type AdminActionState = { ok: boolean; message: string; url?: string } | null;
