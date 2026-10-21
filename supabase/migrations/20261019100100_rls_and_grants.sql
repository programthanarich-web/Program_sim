-- =====================================================================
-- ProgramThanarich | Migration 0002: Row Level Security และสิทธิ์ (grants)
--
-- ตารางทุกตารางใน schema public เปิด RLS
-- บทบาท:
--   anon          : ดูแพ็กเกจที่เปิดขายได้เท่านั้น
--   customer      : ดูโปรไฟล์และคำสั่งซื้อของตัวเอง, แก้ชื่อของตัวเอง
--                   (ไม่เห็นการชำระเงิน สลิป การแจ้งเตือน ประวัติ หรือการตั้งค่าภายใน)
--   staff         : ดูคำสั่งซื้อ/การชำระเงิน/สลิปทั้งหมด, ตรวจสลิป, เปลี่ยนสถานะผ่าน RPC
--   admin         : ทุกอย่างของ staff + จัดการแพ็กเกจ ส่วนลด การตั้งค่า บทบาทผู้ใช้ และคืนเงิน
--   service_role  : bypass RLS (ใช้เฉพาะโค้ด server เท่านั้น ห้ามส่งไป browser)
--
-- การเขียนคำสั่งซื้อ/การชำระเงิน/สลิป ทำผ่านฟังก์ชัน RPC (migration 0003) เท่านั้น
-- ไม่มี policy INSERT/UPDATE/DELETE ให้ตารางเหล่านี้สำหรับ authenticated
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) เปิด RLS ทุกตาราง
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.packages enable row level security;
alter table public.discount_codes enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.slips enable row level security;
alter table public.order_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notification_logs enable row level security;
alter table public.settings enable row level security;

-- ป้องกันตารางใหม่ที่สร้างภายหลังเปิดให้ anon/authenticated โดยอัตโนมัติ
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Policies
-- ---------------------------------------------------------------------

-- profiles
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_staff on public.profiles
  for select to authenticated
  using (public.is_staff());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());   -- trigger guard_profile_update จำกัดคอลัมน์ที่แก้ได้

create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- packages: ทุกคนดูแพ็กเกจที่เปิดขาย, staff ดูทั้งหมด, admin จัดการ
create policy packages_public_select on public.packages
  for select to anon, authenticated
  using (is_active);

create policy packages_staff_select on public.packages
  for select to authenticated
  using (public.is_staff());

create policy packages_admin_write on public.packages
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- discount_codes: เฉพาะพนักงานขึ้นไป (ลูกค้าใช้รหัสผ่าน create_order เท่านั้น)
create policy discount_codes_staff_select on public.discount_codes
  for select to authenticated
  using (public.is_staff());

create policy discount_codes_admin_write on public.discount_codes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- orders: ลูกค้าเห็นเฉพาะของตัวเอง, staff เห็นทั้งหมด, ไม่มี policy เขียน
create policy orders_select_owner_or_staff on public.orders
  for select to authenticated
  using (customer_id = auth.uid() or public.is_staff());

-- payments / slips / order_events / notification_logs: เฉพาะ staff ขึ้นไปเท่านั้น
create policy payments_select_staff on public.payments
  for select to authenticated
  using (public.is_staff());

create policy slips_select_staff on public.slips
  for select to authenticated
  using (public.is_staff());

create policy order_events_select_staff on public.order_events
  for select to authenticated
  using (public.is_staff());

create policy notification_logs_select_staff on public.notification_logs
  for select to authenticated
  using (public.is_staff());

-- audit_logs: admin เท่านั้น
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (public.is_admin());

-- settings: staff อ่านได้, admin จัดการ (ลูกค้าอ่านค่า public ผ่าน get_public_settings)
create policy settings_staff_select on public.settings
  for select to authenticated
  using (public.is_staff());

create policy settings_admin_write on public.settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 3) Table grants (defense in depth: ต้องมีทั้งสิทธิ์ตารางและ policy)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on public.packages to anon;
grant select, insert, update, delete on public.packages to authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.discount_codes to authenticated;
grant select, insert, update, delete on public.settings to authenticated;
grant select on public.orders to authenticated;
grant select on public.payments to authenticated;
grant select on public.slips to authenticated;
grant select on public.order_events to authenticated;
grant select on public.notification_logs to authenticated;
grant select on public.audit_logs to authenticated;

-- ไม่ให้สิทธิ์ตารางเหล่านี้กับ anon เลย และ authenticated ทำ INSERT/UPDATE/DELETE กับ orders/payments/slips ไม่ได้

-- ---------------------------------------------------------------------
-- 4) Helper functions: ให้ authenticated เรียกได้ (ใช้ใน policy)
-- ---------------------------------------------------------------------
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;
