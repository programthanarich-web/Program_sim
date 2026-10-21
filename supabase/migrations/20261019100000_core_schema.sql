-- =====================================================================
-- ProgramThanarich | Migration 0001: core schema
--
-- หลักการ:
--  * ทุกตารางใช้ UUID primary key และมี foreign key ชัดเจน
--  * ราคา/ส่วนลด/ยอดรวม ณ เวลาสั่งซื้อถูก snapshot ไว้ในตาราง orders และล็อกหลังสร้าง
--  * สถานะคำสั่งซื้อ (order_status) แยกจากสถานะการชำระเงิน (payments.status) และสลิป (slips.status)
--  * ประวัติการเปลี่ยนแปลงเขียนอัตโนมัติด้วย trigger (order_events / audit_logs) และแก้ไข/ลบไม่ได้
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------
create type public.user_role as enum ('customer', 'staff', 'admin');
create type public.order_status as enum ('pending', 'processing', 'activated', 'cancelled');
create type public.payment_status as enum ('pending_review', 'verified', 'rejected', 'refunded');
create type public.payment_method as enum ('bank_transfer', 'promptpay');
create type public.slip_status as enum ('pending_review', 'approved', 'rejected');
create type public.discount_type as enum ('fixed', 'percent');
create type public.notification_channel as enum ('sms', 'email', 'line');
create type public.notification_status as enum ('queued', 'sent', 'failed');

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- profiles: 1 แถวต่อ auth.users (PK ใช้ UUID เดียวกับ auth user)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text unique check (phone ~ '^0[689][0-9]{8}$'),
  full_name text check (char_length(full_name) between 1 and 120),
  role public.user_role not null default 'customer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- packages: แคตตาล็อกแพ็กเกจ (ราคาปัจจุบัน; คำสั่งซื้อเก็บ snapshot แยก)
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name text not null check (char_length(name) between 1 and 80),
  speed_mbps integer not null check (speed_mbps between 1 and 10000),
  -- null = ไม่จำกัดปริมาณข้อมูล
  data_quota_gb integer check (data_quota_gb is null or data_quota_gb >= 0),
  price_thb numeric(12, 2) not null check (price_thb >= 0),
  duration_days integer not null check (duration_days between 1 and 3650),
  description text check (char_length(description) <= 300),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index packages_catalog_idx on public.packages (is_active, sort_order);

-- discount_codes: รหัสส่วนลด (ค่าจริงถูก snapshot ลง orders ตอนใช้งาน)
create table public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,32}$'),
  discount_type public.discount_type not null,
  discount_value numeric(12, 2) not null check (discount_value > 0),
  check (discount_type <> 'percent' or discount_value <= 100),
  -- null = ไม่จำกัดจำนวนครั้ง (นับคำสั่งซื้อที่ไม่ได้ยกเลิก)
  max_uses integer check (max_uses is null or max_uses > 0),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  check (valid_until is null or valid_until > valid_from),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- orders: คำสั่งซื้อ พร้อม snapshot ราคาและส่วนลด ณ เวลาสั่งซื้อ
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  package_id uuid not null references public.packages (id) on delete restrict,

  -- snapshot ของแพ็กเกจ (ล็อกหลังสร้าง)
  package_code_snapshot text not null,
  package_name_snapshot text not null,
  speed_mbps_snapshot integer not null,
  data_quota_gb_snapshot integer,
  duration_days_snapshot integer not null,

  -- snapshot ราคาและส่วนลด (ล็อกหลังสร้าง)
  unit_price_thb numeric(12, 2) not null check (unit_price_thb >= 0),
  discount_code_snapshot text,
  discount_type_snapshot public.discount_type,
  discount_value_snapshot numeric(12, 2),
  discount_amount_thb numeric(12, 2) not null default 0 check (discount_amount_thb >= 0),
  total_thb numeric(12, 2) not null check (total_thb >= 0),

  -- สถานะการสมัครแพ็กเกจ (แยกจากสถานะการชำระเงิน)
  order_status public.order_status not null default 'pending',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (discount_amount_thb <= unit_price_thb),
  check (total_thb = unit_price_thb - discount_amount_thb),
  check ((discount_code_snapshot is null) = (discount_type_snapshot is null)),
  check ((discount_code_snapshot is null) = (discount_value_snapshot is null))
);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_status_idx on public.orders (order_status, created_at desc);
create index orders_discount_idx on public.orders (discount_code_snapshot)
  where discount_code_snapshot is not null;

-- payments: การแจ้งชำระเงินหนึ่งครั้ง (มีสถานะการชำระเงินของตัวเอง)
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  method public.payment_method not null,
  amount_thb numeric(12, 2) not null check (amount_thb > 0),
  -- เก็บแบบ normalize แล้ว (พิมพ์ใหญ่ ไม่มีช่องว่าง) เพื่อให้ตรวจซ้ำได้แม่นยำ
  reference_no text not null check (reference_no ~ '^[A-Z0-9]{6,40}$'),
  status public.payment_status not null default 'pending_review',
  rejection_reason text,
  reviewed_by uuid references public.profiles (id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- เลขอ้างอิงใช้ได้ครั้งเดียว (ยกเว้นรายการที่ถูกปฏิเสธ จึงแจ้งใหม่ได้)
create unique index payments_reference_active_uidx
  on public.payments (reference_no) where status <> 'rejected';
-- คำสั่งซื้อหนึ่งรายการมีการแจ้งชำระที่ยังเปิดอยู่ได้ทีละรายการ
create unique index payments_one_open_per_order_uidx
  on public.payments (order_id) where status in ('pending_review', 'verified');
create index payments_order_idx on public.payments (order_id, created_at desc);

-- slips: ไฟล์สลิปที่อัปโหลดไปยัง Storage (เก็บ path และ hash ไม่เก็บไฟล์ในตาราง)
create table public.slips (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments (id) on delete restrict,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  storage_bucket text not null default 'payment-slips',
  -- path ต้องขึ้นต้นด้วย <customer_id>/ เพื่อให้ลูกค้าอัปโหลดได้เฉพาะโฟลเดอร์ของตัวเอง
  storage_path text not null unique check (
    storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
    and split_part(storage_path, '/', 1) = customer_id::text
  ),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  status public.slip_status not null default 'pending_review',
  reviewed_by uuid references public.profiles (id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
-- ไฟล์เดียวกัน (hash เดียวกัน) ใช้แจ้งชำระได้ครั้งเดียว ยกเว้นที่ถูกปฏิเสธ
create unique index slips_file_sha256_active_uidx
  on public.slips (file_sha256) where status <> 'rejected';

-- order_events: timeline ของคำสั่งซื้อ (append-only)
create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  actor_id uuid references public.profiles (id) on delete restrict,
  event_type text not null check (event_type in (
    'order_created', 'order_status_changed',
    'payment_submitted', 'payment_status_changed',
    'slip_uploaded', 'slip_status_changed'
  )),
  from_value text,
  to_value text,
  reason text,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

-- audit_logs: ประวัติการแก้ไขตารางตั้งค่า/แพ็กเกจ/ส่วนลด/profile (append-only)
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  -- ไม่ผูก FK เพื่อให้บันทึกยังอยู่แม้ผู้กระทำจะถูกลบ
  actor_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_table_idx on public.audit_logs (table_name, created_at desc);

-- notification_logs: บันทึกการส่งการแจ้งเตือน (เขียนโดย server เท่านั้น)
create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  channel public.notification_channel not null,
  template text not null check (char_length(template) between 1 and 60),
  -- เก็บเฉพาะเบอร์/อีเมลที่ปิดบังแล้ว ไม่เก็บค่าเต็ม
  recipient_masked text not null,
  status public.notification_status not null default 'queued',
  attempts integer not null default 0 check (attempts >= 0),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notification_logs_order_idx on public.notification_logs (order_id);

-- settings: ค่าตั้งระบบแบบ key/value
create table public.settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$'),
  value jsonb not null,
  -- is_public = ลูกค้าที่ล็อกอินแล้วอ่านได้ผ่าน get_public_settings() เท่านั้น
  is_public boolean not null default false,
  description text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  -- ห้ามมี secret ในตารางนี้ที่เปิดเป็น public
  check (not (is_public and key like 'secret.%'))
);

-- ---------------------------------------------------------------------
-- Helper functions (ใช้ทั้งใน trigger และ RLS policy)
-- ---------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('staff', 'admin'), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

-- ---------------------------------------------------------------------
-- Trigger functions
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- สร้าง profile อัตโนมัติเมื่อมีผู้ใช้ใหม่ใน auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ผู้ใช้ทั่วไปแก้ role / is_active / phone ของตัวเองไม่ได้
-- (service role และการรันโดยตรงในฐานข้อมูลไม่มี auth.uid() จึงไม่ถูกจำกัดที่นี่)
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and not public.is_admin()
     and row(new.role, new.is_active, new.phone) is distinct from row(old.role, old.is_active, old.phone)
  then
    raise exception 'ไม่มีสิทธิ์แก้ไขบทบาท สถานะ หรือเบอร์โทรของผู้ใช้'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- บันทึกประวัติการแก้ไขตารางตั้งค่า (audit trail)
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_logs (table_name, record_id, action, actor_id, old_data, new_data)
  values (
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'key'),
    tg_op,
    auth.uid(),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end;
$$;

-- ตารางแบบ append-only: แก้ไขหรือลบไม่ได้แม้จะเป็นเจ้าของตาราง
create or replace function public.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ตาราง % เป็นแบบ append-only ไม่อนุญาตให้ %', tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

-- ล็อกราคาและข้อมูลแพ็กเกจของคำสั่งซื้อหลังสร้าง
create or replace function public.forbid_order_snapshot_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
       old.customer_id, old.package_id, old.package_code_snapshot, old.package_name_snapshot,
       old.speed_mbps_snapshot, old.data_quota_gb_snapshot, old.duration_days_snapshot,
       old.unit_price_thb, old.discount_code_snapshot, old.discount_type_snapshot,
       old.discount_value_snapshot, old.discount_amount_thb, old.total_thb
     ) is distinct from row(
       new.customer_id, new.package_id, new.package_code_snapshot, new.package_name_snapshot,
       new.speed_mbps_snapshot, new.data_quota_gb_snapshot, new.duration_days_snapshot,
       new.unit_price_thb, new.discount_code_snapshot, new.discount_type_snapshot,
       new.discount_value_snapshot, new.discount_amount_thb, new.total_thb
     )
  then
    raise exception 'ไม่สามารถแก้ไขราคาหรือข้อมูลแพ็กเกจของคำสั่งซื้อที่สร้างแล้ว'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ตรวจการเปลี่ยนสถานะคำสั่งซื้อให้เป็นไปตามลำดับที่กำหนด
create or replace function public.validate_order_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.order_status is not distinct from old.order_status then
    return new;
  end if;

  if not (
       (old.order_status = 'pending' and new.order_status in ('processing', 'cancelled'))
    or (old.order_status = 'processing' and new.order_status in ('activated', 'cancelled'))
  ) then
    raise exception 'ไม่อนุญาตให้เปลี่ยนสถานะคำสั่งซื้อจาก % เป็น %', old.order_status, new.order_status
      using errcode = 'P0001';
  end if;

  -- เริ่มดำเนินการได้ก็ต่อเมื่อมีการชำระเงินที่ยืนยันแล้วเท่านั้น
  if new.order_status = 'processing' and not exists (
       select 1 from public.payments p
       where p.order_id = new.id and p.status = 'verified'
     )
  then
    raise exception 'ต้องมีการชำระเงินที่ยืนยันแล้วก่อนเริ่มดำเนินการ'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ตรวจการเปลี่ยนสถานะการชำระเงิน และล็อกยอด/อ้างอิง
create or replace function public.validate_payment_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(old.order_id, old.customer_id, old.method, old.amount_thb, old.reference_no)
     is distinct from row(new.order_id, new.customer_id, new.method, new.amount_thb, new.reference_no)
  then
    raise exception 'ไม่อนุญาตให้แก้ไขยอดหรือเลขอ้างอิงของการชำระเงิน'
      using errcode = 'P0001';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if not (
       (old.status = 'pending_review' and new.status in ('verified', 'rejected'))
    or (old.status = 'verified' and new.status = 'refunded')
  ) then
    raise exception 'ไม่อนุญาตให้เปลี่ยนสถานะการชำระเงินจาก % เป็น %', old.status, new.status
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ตรวจการเปลี่ยนสถานะสลิป และล็อกไฟล์
create or replace function public.validate_slip_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(old.payment_id, old.customer_id, old.storage_path, old.file_sha256, old.size_bytes)
     is distinct from row(new.payment_id, new.customer_id, new.storage_path, new.file_sha256, new.size_bytes)
  then
    raise exception 'ไม่อนุญาตให้แก้ไขข้อมูลไฟล์สลิป'
      using errcode = 'P0001';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if not (old.status = 'pending_review' and new.status in ('approved', 'rejected')) then
    raise exception 'ไม่อนุญาตให้เปลี่ยนสถานะสลิปจาก % เป็น %', old.status, new.status
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- สลิปต้องเป็นของเจ้าของการชำระเงินเดียวกันเท่านั้น
create or replace function public.check_slip_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_customer uuid;
begin
  select p.customer_id into v_payment_customer
  from public.payments p where p.id = new.payment_id;

  if v_payment_customer is distinct from new.customer_id then
    raise exception 'สลิปต้องเป็นของเจ้าของการชำระเงินเดียวกัน'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- บันทึก timeline ของคำสั่งซื้อ
create or replace function public.log_order_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(current_setting('app.change_reason', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, actor_id, event_type, to_value)
    values (new.id, auth.uid(), 'order_created', new.order_status::text);
  elsif new.order_status is distinct from old.order_status then
    insert into public.order_events (order_id, actor_id, event_type, from_value, to_value, reason)
    values (new.id, auth.uid(), 'order_status_changed',
            old.order_status::text, new.order_status::text, v_reason);
  end if;
  return null;
end;
$$;

create or replace function public.log_payment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(current_setting('app.change_reason', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, actor_id, event_type, to_value, reason)
    values (new.order_id, auth.uid(), 'payment_submitted', new.status::text, null);
  elsif new.status is distinct from old.status then
    insert into public.order_events (order_id, actor_id, event_type, from_value, to_value, reason)
    values (new.order_id, auth.uid(), 'payment_status_changed',
            old.status::text, new.status::text, v_reason);
  end if;
  return null;
end;
$$;

create or replace function public.log_slip_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(current_setting('app.change_reason', true), '');
  v_order_id uuid;
begin
  select p.order_id into v_order_id from public.payments p where p.id = new.payment_id;

  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, actor_id, event_type, to_value)
    values (v_order_id, auth.uid(), 'slip_uploaded', new.status::text);
  elsif new.status is distinct from old.status then
    insert into public.order_events (order_id, actor_id, event_type, from_value, to_value, reason)
    values (v_order_id, auth.uid(), 'slip_status_changed',
            old.status::text, new.status::text, v_reason);
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- updated_at
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger packages_set_updated_at before update on public.packages
  for each row execute function public.set_updated_at();
create trigger discount_codes_set_updated_at before update on public.discount_codes
  for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create trigger notification_logs_set_updated_at before update on public.notification_logs
  for each row execute function public.set_updated_at();
create trigger settings_set_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- auth -> profiles
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ป้องกันการยกระดับสิทธิ์
create trigger profiles_guard_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- การตั้งค่า แพ็กเกจ ส่วนลด และ profile ถูกบันทึก audit
create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function public.write_audit_log();
create trigger packages_audit after insert or update or delete on public.packages
  for each row execute function public.write_audit_log();
create trigger discount_codes_audit after insert or update or delete on public.discount_codes
  for each row execute function public.write_audit_log();
create trigger settings_audit after insert or update or delete on public.settings
  for each row execute function public.write_audit_log();

-- คำสั่งซื้อ: ล็อกราคา, ตรวจการเปลี่ยนสถานะ, บันทึก timeline
create trigger orders_lock_snapshot before update on public.orders
  for each row execute function public.forbid_order_snapshot_change();
create trigger orders_validate_transition before update of order_status on public.orders
  for each row execute function public.validate_order_transition();
create trigger orders_log_change after insert or update of order_status on public.orders
  for each row execute function public.log_order_change();

-- การชำระเงินและสลิป
create trigger payments_validate_transition before update on public.payments
  for each row execute function public.validate_payment_transition();
create trigger payments_log_change after insert or update of status on public.payments
  for each row execute function public.log_payment_change();
create trigger slips_check_owner before insert on public.slips
  for each row execute function public.check_slip_owner();
create trigger slips_validate_transition before update on public.slips
  for each row execute function public.validate_slip_transition();
create trigger slips_log_change after insert or update of status on public.slips
  for each row execute function public.log_slip_change();

-- ตาราง append-only
create trigger order_events_no_update before update or delete on public.order_events
  for each row execute function public.forbid_mutation();
create trigger order_events_no_truncate before truncate on public.order_events
  for each statement execute function public.forbid_mutation();
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.forbid_mutation();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.forbid_mutation();
