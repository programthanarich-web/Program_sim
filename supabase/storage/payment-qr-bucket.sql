-- =====================================================================
-- bucket สำหรับ QR รับเงิน (private, 1 MB, เฉพาะรูปภาพ)
-- รันใน Supabase SQL Editor ยังไม่ได้ทดสอบกับโปรเจกต์ Supabase จริง
-- ไม่มี policy ให้ anon/authenticated: เซิร์ฟเวอร์ใช้ service role อัปโหลดและสร้างลิงก์ชั่วคราว
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-qr', 'payment-qr', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
