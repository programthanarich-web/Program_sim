-- =====================================================================
-- Admin operations: ผลการสมัคร, outbox การแจ้งเตือน, กฎการปิดงาน, RPC ของผู้ดูแล
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) notification_logs ทำหน้าที่เป็น outbox ของการแจ้งเตือน
-- ---------------------------------------------------------------------
alter table public.notification_logs
  add column dedupe_key text unique check (char_length(dedupe_key) between 1 and 200),
  -- payload เก็บเฉพาะข้อมูลที่ไม่ใช่ข้อมูลส่วนบุคคล (ดูเงื่อนไขด้านล่าง)
  add column payload jsonb not null default '{}'::jsonb check (
    jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 2048
  ),
  add column next_attempt_at timestamptz not null default now(),
  add column first_attempt_at timestamptz,
  add column sent_at timestamptz,
  add column max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  -- X-Line-Retry-Key: ใช้เลขเดิมตลอดการส่งซ้ำ เพื่อให้ LINE ไม่ส่งซ้ำ
  add column retry_key uuid not null default gen_random_uuid(),
  add constraint notification_logs_payload_no_pii check (
    not (payload ?| array['phone', 'email', 'name', 'full_name', 'address', 'storage_path', 'slip'])
  ),
  add constraint notification_logs_template_known check (
    template in ('payment_received', 'signup_queue', 'signup_result')
  );

create index notification_logs_due_idx
  on public.notification_logs (next_attempt_at)
  where status = 'queued';

-- ---------------------------------------------------------------------
-- 2) signup_results: ผลการสมัคร (บันทึกโดยพนักงาน ยืนยันโดยผู้ดูแลคนละคน)
-- ---------------------------------------------------------------------
create type public.signup_outcome as enum ('success', 'failed', 'needs_info');

create table public.signup_results (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  outcome public.signup_outcome not null,
  note text not null check (char_length(btrim(note)) between 1 and 1000),
  recorded_by uuid not null references public.profiles (id) on delete restrict,
  recorded_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles (id) on delete restrict,
  confirmed_at timestamptz,
  confirm_note text check (confirm_note is null or char_length(confirm_note) <= 1000),
  check ((confirmed_by is null) = (confirmed_at is null)),
  check (confirmed_by is null or confirmed_by <> recorded_by)
);

-- มีผลการสมัคร "สำเร็จ" ที่ยืนยันแล้วได้เพียงรายการเดียวต่อคำสั่งซื้อ
create unique index signup_results_confirmed_success_uidx
  on public.signup_results (order_id)
  where confirmed_at is not null and outcome = 'success';
-- รอยืนยันได้ทีละหนึ่งรายการต่อคำสั่งซื้อ
create unique index signup_results_open_uidx
  on public.signup_results (order_id)
  where confirmed_at is null;

-- รายการที่ยืนยันแล้วแก้ไม่ได้ (ประวัติการยืนยันต้องคงอยู่)
create or replace function public.signup_results_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ไม่อนุญาตให้ลบผลการสมัคร' using errcode = 'P0001';
  end if;
  if old.confirmed_at is not null then
    raise exception 'ผลการสมัครที่ยืนยันแล้วแก้ไขไม่ได้' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger signup_results_guard before update or delete on public.signup_results
  for each row execute function public.signup_results_guard();
create trigger signup_results_audit after insert or update on public.signup_results
  for each row execute function public.write_audit_log();

alter table public.signup_results enable row level security;
revoke all on public.signup_results from anon, authenticated;
grant select on public.signup_results to authenticated;
create policy signup_results_staff_select on public.signup_results
  for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------
-- 3) กฎการปิดงาน: activated ต้องมีผลสมัคร "สำเร็จ" ที่ผู้ดูแลยืนยันแล้ว
-- ---------------------------------------------------------------------
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

  -- ปิดงาน (activated) ได้ก็ต่อเมื่อผู้ดูแลยืนยันผลการสมัครว่าสำเร็จแล้ว
  if new.order_status = 'activated' and not exists (
       select 1 from public.signup_results s
       where s.order_id = new.id
         and s.outcome = 'success'
         and s.confirmed_at is not null
     )
  then
    raise exception 'ต้องให้ผู้ดูแลระบบยืนยันผลการสมัครว่าสำเร็จก่อนปิดงาน'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Trigger สร้างการแจ้งเตือนลง outbox (อยู่ในธุรกรรมเดียวกับการเปลี่ยนสถานะ)
-- ---------------------------------------------------------------------
create or replace function public.enqueue_payment_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'verified' and old.status is distinct from 'verified' then
    insert into public.notification_logs
      (order_id, channel, template, recipient_masked, dedupe_key, payload)
    select o.id, 'line', 'payment_received', 'กลุ่ม LINE ผู้ดูแล',
           'payment_received:' || new.id::text,
           jsonb_build_object(
             'order_id', o.id,
             'order_number', o.order_number,
             'package_name', o.package_name_snapshot,
             'amount_thb', new.amount_thb
           )
    from public.orders o
    where o.id = new.order_id
    on conflict (dedupe_key) do nothing;
  end if;
  return null;
end;
$$;

create trigger payments_enqueue_notification after update of status on public.payments
  for each row execute function public.enqueue_payment_notification();

create or replace function public.enqueue_signup_queue_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_status = 'processing' and old.order_status is distinct from 'processing' then
    insert into public.notification_logs
      (order_id, channel, template, recipient_masked, dedupe_key, payload)
    values (
      new.id, 'line', 'signup_queue', 'กลุ่ม LINE ผู้ดูแล',
      'signup_queue:' || new.id::text,
      jsonb_build_object(
        'order_id', new.id,
        'order_number', new.order_number,
        'package_name', new.package_name_snapshot,
        'amount_thb', new.total_thb
      )
    )
    on conflict (dedupe_key) do nothing;
  end if;
  return null;
end;
$$;

create trigger orders_enqueue_signup_notification after update of order_status on public.orders
  for each row execute function public.enqueue_signup_queue_notification();

-- ---------------------------------------------------------------------
-- 5) RPC ของผู้ดูแล (ทุกฟังก์ชันตรวจสิทธิ์ภายในเอง)
-- ---------------------------------------------------------------------

-- พนักงานบันทึกผลการสมัคร (คำสั่งซื้อต้องอยู่ระหว่างดำเนินการ)
create or replace function public.record_signup_result(
  p_order_id uuid,
  p_outcome public.signup_outcome,
  p_note text
)
returns public.signup_results
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_result public.signup_results;
begin
  if not public.is_staff() then
    raise exception 'เฉพาะพนักงานเท่านั้น' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'ต้องระบุหมายเหตุผลการสมัคร' using errcode = 'P0001';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ไม่พบคำสั่งซื้อ' using errcode = 'P0001';
  end if;
  if v_order.order_status <> 'processing' then
    raise exception 'บันทึกผลได้เฉพาะคำสั่งซื้อที่กำลังดำเนินการ' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.signup_results
    where order_id = p_order_id and confirmed_at is null
  ) then
    raise exception 'มีผลการสมัครที่รอยืนยันอยู่แล้ว' using errcode = 'P0001';
  end if;

  insert into public.signup_results (order_id, outcome, note, recorded_by)
  values (p_order_id, p_outcome, btrim(p_note), auth.uid())
  returning * into v_result;

  return v_result;
end;
$$;

-- ผู้ดูแลยืนยันผลการสมัคร (คนละคนกับผู้บันทึก) เมื่อสำเร็จจะปิดงานให้ทันที
create or replace function public.confirm_signup_result(
  p_result_id uuid,
  p_note text default null
)
returns public.signup_results
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_result public.signup_results;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่ยืนยันผลการสมัครได้' using errcode = '42501';
  end if;

  select * into v_result from public.signup_results where id = p_result_id for update;
  if not found then
    raise exception 'ไม่พบผลการสมัคร' using errcode = 'P0001';
  end if;
  if v_result.confirmed_at is not null then
    raise exception 'ผลการสมัครนี้ได้รับการยืนยันแล้ว' using errcode = 'P0001';
  end if;
  if v_result.recorded_by = v_uid then
    raise exception 'ผู้ยืนยันต้องไม่ใช่ผู้บันทึกผลเดียวกัน' using errcode = '42501';
  end if;

  update public.signup_results
  set confirmed_by = v_uid,
      confirmed_at = now(),
      confirm_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_result_id
  returning * into v_result;

  if v_result.outcome = 'success' then
    update public.orders set order_status = 'activated'
    where id = v_result.order_id and order_status = 'processing';
    if not found then
      raise exception 'คำสั่งซื้อไม่ได้อยู่ในสถานะดำเนินการ' using errcode = 'P0001';
    end if;
  end if;

  return v_result;
end;
$$;

-- บันทึกแพ็กเกจ (เพิ่มใหม่หรือแก้ไข) ราคาใหม่ไม่กระทบคำสั่งซื้อเดิมเพราะมี snapshot
create or replace function public.admin_save_package(
  p_id uuid,
  p_code text,
  p_name text,
  p_speed_mbps integer,
  p_data_quota_gb integer,
  p_price_thb numeric,
  p_duration_days integer,
  p_description text,
  p_is_active boolean,
  p_sort_order integer
)
returns public.packages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.packages;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.packages (code, name, speed_mbps, data_quota_gb, price_thb,
      duration_days, description, is_active, sort_order, created_by)
    values (lower(btrim(p_code)), btrim(p_name), p_speed_mbps, p_data_quota_gb, p_price_thb,
      p_duration_days, nullif(btrim(coalesce(p_description, '')), ''), p_is_active,
      coalesce(p_sort_order, 0), auth.uid())
    returning * into v_row;
  else
    update public.packages
    set code = lower(btrim(p_code)),
        name = btrim(p_name),
        speed_mbps = p_speed_mbps,
        data_quota_gb = p_data_quota_gb,
        price_thb = p_price_thb,
        duration_days = p_duration_days,
        description = nullif(btrim(coalesce(p_description, '')), ''),
        is_active = p_is_active,
        sort_order = coalesce(p_sort_order, 0)
    where id = p_id
    returning * into v_row;
    if not found then
      raise exception 'ไม่พบแพ็กเกจ' using errcode = 'P0001';
    end if;
  end if;
  return v_row;
exception
  when unique_violation then
    raise exception 'รหัสแพ็กเกจนี้ถูกใช้แล้ว' using errcode = 'P0001';
end;
$$;

create or replace function public.admin_save_discount(
  p_id uuid,
  p_code text,
  p_discount_type public.discount_type,
  p_discount_value numeric,
  p_max_uses integer,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_is_active boolean
)
returns public.discount_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.discount_codes;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.discount_codes (code, discount_type, discount_value, max_uses,
      valid_from, valid_until, is_active)
    values (upper(btrim(p_code)), p_discount_type, p_discount_value, p_max_uses,
      coalesce(p_valid_from, now()), p_valid_until, p_is_active)
    returning * into v_row;
  else
    update public.discount_codes
    set code = upper(btrim(p_code)),
        discount_type = p_discount_type,
        discount_value = p_discount_value,
        max_uses = p_max_uses,
        valid_from = coalesce(p_valid_from, valid_from),
        valid_until = p_valid_until,
        is_active = p_is_active
    where id = p_id
    returning * into v_row;
    if not found then
      raise exception 'ไม่พบรหัสส่วนลด' using errcode = 'P0001';
    end if;
  end if;
  return v_row;
exception
  when unique_violation then
    raise exception 'รหัสส่วนลดนี้ถูกใช้แล้ว' using errcode = 'P0001';
end;
$$;

-- ผู้ดูแลสั่งส่งซ้ำรายการที่ล้มเหลว (ใช้ retry_key เดิมถ้ายังอยู่ในช่วง 24 ชั่วโมง)
create or replace function public.admin_retry_notification(p_id uuid)
returns public.notification_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.notification_logs;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น' using errcode = '42501';
  end if;

  select * into v_row from public.notification_logs where id = p_id for update;
  if not found then
    raise exception 'ไม่พบรายการแจ้งเตือน' using errcode = 'P0001';
  end if;
  if v_row.status <> 'failed' then
    raise exception 'ส่งซ้ำได้เฉพาะรายการที่ล้มเหลว' using errcode = 'P0001';
  end if;

  update public.notification_logs
  set status = 'queued',
      attempts = 0,
      next_attempt_at = now(),
      last_error = null,
      -- เกิน 24 ชั่วโมงแล้ว LINE จะไม่ถือว่าเป็นการส่งซ้ำเดิม จึงออก key ใหม่
      retry_key = case when first_attempt_at < now() - interval '23 hours'
                       then gen_random_uuid() else retry_key end,
      first_attempt_at = null
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) ฟังก์ชันสำหรับ worker ส่งแจ้งเตือน (service_role เท่านั้น)
-- ---------------------------------------------------------------------

-- จองรายการที่ถึงเวลาส่ง พร้อม lease 3 นาที (ป้องกัน worker สองตัวหยิบรายการเดียวกัน)
create or replace function public.claim_notifications(p_limit integer)
returns setof public.notification_logs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select id from public.notification_logs
    where status = 'queued'
      and next_attempt_at <= now()
      and attempts < max_attempts
    order by next_attempt_at
    for update skip locked
    limit greatest(least(p_limit, 50), 1)
  )
  update public.notification_logs n
  set attempts = n.attempts + 1,
      next_attempt_at = now() + interval '3 minutes',
      first_attempt_at = coalesce(n.first_attempt_at, now())
  from due
  where n.id = due.id
  returning n.*;
end;
$$;

-- ผลการส่ง: sent | retry (พร้อมวินาทีที่รอ) | failed
create or replace function public.complete_notification(
  p_id uuid,
  p_outcome text,
  p_provider_message_id text,
  p_error text,
  p_retry_after_seconds integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome = 'sent' then
    update public.notification_logs
    set status = 'sent', sent_at = now(), provider_message_id = p_provider_message_id,
        last_error = null
    where id = p_id;
  elsif p_outcome = 'retry' then
    update public.notification_logs
    set status = case when attempts >= max_attempts then 'failed'::public.notification_status
                      else 'queued'::public.notification_status end,
        next_attempt_at = now() + make_interval(secs => greatest(coalesce(p_retry_after_seconds, 60), 1)),
        last_error = left(p_error, 500)
    where id = p_id;
  elsif p_outcome = 'failed' then
    update public.notification_logs
    set status = 'failed', last_error = left(p_error, 500)
    where id = p_id;
  else
    raise exception 'ผลการส่งไม่ถูกต้อง' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 7) สิทธิ์ของฟังก์ชันใหม่: ปิดจาก public/anon ทั้งหมดก่อน แล้วค่อยให้เฉพาะที่จำเป็น
-- ---------------------------------------------------------------------
revoke execute on function
  public.record_signup_result(uuid, public.signup_outcome, text),
  public.confirm_signup_result(uuid, text),
  public.admin_save_package(uuid, text, text, integer, integer, numeric, integer, text, boolean, integer),
  public.admin_save_discount(uuid, text, public.discount_type, numeric, integer, timestamptz, timestamptz, boolean),
  public.admin_retry_notification(uuid),
  public.claim_notifications(integer),
  public.complete_notification(uuid, text, text, text, integer),
  public.enqueue_payment_notification(),
  public.enqueue_signup_queue_notification(),
  public.signup_results_guard()
from public, anon;

grant execute on function
  public.record_signup_result(uuid, public.signup_outcome, text),
  public.confirm_signup_result(uuid, text),
  public.admin_save_package(uuid, text, text, integer, integer, numeric, integer, text, boolean, integer),
  public.admin_save_discount(uuid, text, public.discount_type, numeric, integer, timestamptz, timestamptz, boolean),
  public.admin_retry_notification(uuid)
to authenticated;

grant execute on function
  public.claim_notifications(integer),
  public.complete_notification(uuid, text, text, text, integer)
to service_role;

revoke execute on function
  public.claim_notifications(integer),
  public.complete_notification(uuid, text, text, text, integer)
from authenticated;
