-- =====================================================================
-- สร้าง bucket สำหรับสลิป (รันใน Supabase SQL Editor หลัง migration)
-- ยังไม่ได้ทดสอบกับโปรเจกต์ Supabase จริง; ตรวจผลใน Dashboard หลังรัน
-- bucket ต้อง private และไม่มี policy ให้ anon/authenticated
-- การอัปโหลดทำโดยเซิร์ฟเวอร์ด้วย service role หลังตรวจชนิดและขนาดไฟล์แล้ว
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-slips',
  'payment-slips',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
