import "server-only";
import { createSupabaseAuthClient } from "@/lib/supabase/server-auth";
import type { ServiceResult } from "@pt/shared/types";
import type { StaffRole, StaffUser } from "@/types/admin";

/**
 * สิทธิ์ผู้ดูแลอ้างอิงจาก profiles.role ของผู้ใช้ที่ล็อกอิน (ไม่มีตาราง admin_users แล้ว)
 * อ่านด้วย session ของผู้ใช้เอง จึงผ่าน RLS ตามสิทธิ์จริง
 */
export async function getCurrentStaff(): Promise<StaffUser | null> {
  const db = await createSupabaseAuthClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;

  const { data: profile } = await db
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;
  const role = profile.role as string;
  if (role !== "staff" && role !== "admin") return null;

  return { id: user.id, email: user.email ?? "", role: role as StaffRole };
}

/** ใช้ในทุก Server Action และ Server Component ของ admin (ไม่พึ่งแค่การซ่อนหน้า) */
export async function requireStaff(): Promise<StaffUser> {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("ไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ");
  return staff;
}

export async function requireAdmin(): Promise<StaffUser> {
  const staff = await requireStaff();
  if (staff.role !== "admin") throw new Error("เฉพาะผู้ดูแลระบบเท่านั้น");
  return staff;
}

export async function signInAdmin(email: string, password: string): Promise<ServiceResult> {
  const db = await createSupabaseAuthClient();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  }

  const staff = await getCurrentStaff();
  if (!staff) {
    await db.auth.signOut();
    return { ok: false, error: "บัญชีนี้ไม่มีสิทธิ์เข้าถึงระบบผู้ดูแล" };
  }
  return { ok: true, data: undefined };
}

export async function signOutAdmin(): Promise<void> {
  const db = await createSupabaseAuthClient();
  await db.auth.signOut();
}
