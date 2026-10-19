import "server-only";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`ไม่พบ environment variable: ${name} (ดูตัวอย่างได้ที่ไฟล์ .env.example)`);
  }
  return value;
}

/**
 * หน้าบ้านใช้ค่าชุดนี้เท่านั้น ไม่มี LINE และไม่มีค่าของหลังบ้าน
 * service role key ใช้เฉพาะงานฝั่ง server ที่ยังต้องข้าม RLS (อัปโหลดสลิป, บันทึกเบอร์ลงโปรไฟล์, สร้างลิงก์ QR)
 * ห้ามเพิ่ม prefix NEXT_PUBLIC_ ให้ตัวแปรเหล่านี้เด็ดขาด
 */
export const serverEnv = {
  get supabaseUrl() {
    return requireEnv("SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return requireEnv("SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey() {
    return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
};
