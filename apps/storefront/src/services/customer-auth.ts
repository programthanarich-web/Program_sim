import "server-only";
import { createSupabaseAuthClient } from "@/lib/supabase/server-auth";
import { toE164Thai } from "@pt/shared/phone";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ServiceResult } from "@pt/shared/types";

/**
 * ส่ง OTP ผ่าน Supabase Phone Auth
 * ต้องเปิด Phone provider และตั้ง SMS provider ใน Supabase ก่อน (ยังไม่ได้ทดสอบกับโปรเจกต์จริง)
 * การจำกัดความถี่การส่ง SMS ใช้ค่าจาก Supabase Auth rate limits
 */
export async function requestCustomerOtp(phone: string): Promise<ServiceResult> {
  const db = await createSupabaseAuthClient();
  const { error } = await db.auth.signInWithOtp({
    phone: toE164Thai(phone),
    options: { shouldCreateUser: true },
  });
  if (error) {
    console.error("[customer-auth] ส่ง OTP ไม่สำเร็จ:", error.message);
    return { ok: false, error: "ส่งรหัสไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }
  return { ok: true, data: undefined };
}

/** ตรวจรหัส OTP สร้าง session แล้วบันทึกเบอร์ลงโปรไฟล์ (ฝั่ง server ด้วย service role) */
export async function verifyCustomerOtp(phone: string, code: string): Promise<ServiceResult> {
  const db = await createSupabaseAuthClient();
  const { data, error } = await db.auth.verifyOtp({
    phone: toE164Thai(phone),
    token: code,
    type: "sms",
  });
  if (error || !data.user) {
    return { ok: false, error: "รหัสไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่" };
  }

  const { error: profileError } = await createSupabaseServiceClient()
    .from("profiles")
    .update({ phone })
    .eq("id", data.user.id);

  if (profileError) {
    await db.auth.signOut();
    if (profileError.code === "23505") {
      return { ok: false, error: "เบอร์นี้ถูกใช้กับบัญชีอื่นแล้ว กรุณาติดต่อทีมงาน" };
    }
    console.error("[customer-auth] บันทึกเบอร์ไม่สำเร็จ:", profileError.message);
    return { ok: false, error: "ไม่สามารถบันทึกเบอร์ได้ กรุณาลองใหม่อีกครั้ง" };
  }
  return { ok: true, data: undefined };
}

export interface CustomerSession {
  id: string;
  phone: string;
}

/** ลูกค้าที่ล็อกอินและยืนยันเบอร์แล้วเท่านั้น คืน null ถ้าไม่ใช่ */
export async function getCustomerSession(): Promise<CustomerSession | null> {
  const db = await createSupabaseAuthClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;

  const { data: profile } = await db
    .from("profiles")
    .select("role, is_active, phone")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active || profile.role !== "customer" || !profile.phone) {
    return null;
  }
  return { id: user.id, phone: profile.phone as string };
}

export async function signOutCustomer(): Promise<void> {
  const db = await createSupabaseAuthClient();
  await db.auth.signOut();
}
