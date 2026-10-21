-- =====================================================================
-- ProgramThanarich | Migration 0003: ฟังก์ชันธุรกิจ (RPC)
--
-- ทุกฟังก์ชันเป็น SECURITY DEFINER + search_path ว่าง และตรวจบทบาทเองภายในฟังก์ชัน
-- ราคาและส่วนลดคำนวณในฐานข้อมูล (ไม่รับค่าจาก client)
-- =====================================================================

-- ---------------------------------------------------------------------
-- create_order: ลูกค้าสั่งซื้อแพ็กเกจ (ราคาอ่านจากแคตตาล็อกในฐานข้อมูล)
-- ---------------------------------------------------------------------
create or replace function public.create_order(
  p_package_id uuid,
  p_discount_code text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pkg public.packages;
  v_code text := nullif(upper(btrim(coalesce(p_discount_code, ''))), '');
  v_disc public.discount_codes;
  v_disc_type public.discount_type;
  v_disc_value numeric(12, 2);
  v_amount numeric(12, 2) := 0;
  v_pending integer;
  v_used integer;
  v_order public.orders;
begin
  if v_uid is null or public.current_user_role() is distinct from 'customer' then
    raise exception 'เฉพาะลูกค้าที่เข้าสู่ระบบเท่านั้นที่สั่งซื้อได้' using errcode = '42501';
  end if;

  select * into v_pkg from public.packages where id = p_package_id and is_active;
  if not found then
    raise exception 'แพ็กเกจนี้ไม่พร้อมให้บริการ' using errcode = 'P0001';
  end if;

  select count(*) into v_pending
  from public.orders where customer_id = v_uid and order_status = 'pending';
  if v_pending >= 3 then
    raise exception 'มีคำสั่งซื้อที่รอดำเนินการครบ 3 รายการแล้ว' using errcode = 'P0001';
  end if;

  if v_code is not null then
    -- lock แถวส่วนลดเพื่อกันการใช้เกินจำนวนเมื่อมีคำขอพร้อมกัน
    select * into v_disc from public.discount_codes
    where code = v_code and is_active
    for update;
    if not found then
      raise exception 'รหัสส่วนลดไม่ถูกต้องหรือหมดอายุ' using errcode = 'P0001';
    end if;
    if now() < v_disc.valid_from
       or (v_disc.valid_until is not null and now() > v_disc.valid_until)
    then
      raise exception 'รหัสส่วนลดไม่ถูกต้องหรือหมดอายุ' using errcode = 'P0001';
    end if;

    if v_disc.max_uses is not null then
      select count(*) into v_used from public.orders
      where discount_code_snapshot = v_code and order_status <> 'cancelled';
      if v_used >= v_disc.max_uses then
        raise exception 'รหัสส่วนลดนี้ถูกใช้ครบจำนวนแล้ว' using errcode = 'P0001';
      end if;
    end if;

    v_disc_type := v_disc.discount_type;
    v_disc_value := v_disc.discount_value;
    v_amount := case
      when v_disc_type = 'percent' then round(v_pkg.price_thb * v_disc_value / 100, 2)
      else least(v_disc_value, v_pkg.price_thb)
    end;
  end if;

  insert into public.orders (
    customer_id, package_id,
    package_code_snapshot, package_name_snapshot, speed_mbps_snapshot,
    data_quota_gb_snapshot, duration_days_snapshot,
    unit_price_thb,
    discount_code_snapshot, discount_type_snapshot, discount_value_snapshot,
    discount_amount_thb, total_thb
  ) values (
    v_uid, v_pkg.id,
    v_pkg.code, v_pkg.name, v_pkg.speed_mbps,
    v_pkg.data_quota_gb, v_pkg.duration_days,
    v_pkg.price_thb,
    v_code, v_disc_type, v_disc_value,
    v_amount, v_pkg.price_thb - v_amount
  )
  returning * into v_order;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------
-- cancel_my_order: ลูกค้ายกเลิกคำสั่งซื้อของตัวเองที่ยังรอดำเนินการ
-- ---------------------------------------------------------------------

-- ปิดการแจ้งชำระเงินที่ยังรอตรวจ (ใช้ภายในเท่านั้น)
create or replace function public.release_open_payments(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.slips s
  set status = 'rejected', reviewed_at = now()
  from public.payments p
  where s.payment_id = p.id
    and p.order_id = p_order_id
    and p.status = 'pending_review'
    and s.status = 'pending_review';

  update public.payments
  set status = 'rejected', rejection_reason = p_reason, reviewed_at = now()
  where order_id = p_order_id and status = 'pending_review';
end;
$$;

create or replace function public.cancel_my_order(p_order_id uuid, p_reason text default 'ลูกค้ายกเลิกคำสั่งซื้อ')
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
begin
  if v_uid is null or public.current_user_role() is distinct from 'customer' then
    raise exception 'เฉพาะลูกค้าที่เข้าสู่ระบบเท่านั้น' using errcode = '42501';
  end if;

  select * into v_order from public.orders
  where id = p_order_id and customer_id = v_uid
  for update;
  if not found then
    raise exception 'ไม่พบคำสั่งซื้อ' using errcode = 'P0001';
  end if;
  if v_order.order_status <> 'pending' then
    raise exception 'ยกเลิกได้เฉพาะคำสั่งซื้อที่รอดำเนินการเท่านั้น' using errcode = 'P0001';
  end if;

  perform set_config('app.change_reason', coalesce(p_reason, ''), true);
  perform public.release_open_payments(p_order_id, coalesce(p_reason, 'ลูกค้ายกเลิกคำสั่งซื้อ'));

  update public.orders set order_status = 'cancelled' where id = p_order_id
  returning * into v_order;

  perform set_config('app.change_reason', '', true);
  return v_order;
end;
$$;

-- ---------------------------------------------------------------------
-- submit_payment: ลูกค้าแจ้งชำระเงิน พร้อมสลิปที่อัปโหลดไว้แล้วใน Storage
-- ---------------------------------------------------------------------
create or replace function public.submit_payment(
  p_order_id uuid,
  p_method public.payment_method,
  p_reference_no text,
  p_amount_thb numeric,
  p_storage_path text,
  p_file_sha256 text,
  p_mime_type text,
  p_size_bytes integer
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_ref text := upper(regexp_replace(btrim(coalesce(p_reference_no, '')), '[\s-]+', '', 'g'));
  v_payment public.payments;
  v_constraint text;
begin
  if v_uid is null or public.current_user_role() is distinct from 'customer' then
    raise exception 'เฉพาะลูกค้าที่เข้าสู่ระบบเท่านั้น' using errcode = '42501';
  end if;

  -- ไม่ระบุว่าคำสั่งซื้อของคนอื่นมีอยู่หรือไม่ (ตอบเหมือนกับไม่พบ)
  select * into v_order from public.orders
  where id = p_order_id and customer_id = v_uid;
  if not found then
    raise exception 'ไม่พบคำสั่งซื้อ' using errcode = 'P0001';
  end if;
  if v_order.order_status <> 'pending' then
    raise exception 'คำสั่งซื้อนี้ไม่อยู่ในสถานะรอชำระเงิน' using errcode = 'P0001';
  end if;
  if p_amount_thb is distinct from v_order.total_thb then
    raise exception 'ยอดชำระไม่ตรงกับยอดคำสั่งซื้อ' using errcode = 'P0001';
  end if;
  if v_ref !~ '^[A-Z0-9]{6,40}$' then
    raise exception 'เลขอ้างอิงการโอนไม่ถูกต้อง' using errcode = 'P0001';
  end if;

  begin
    insert into public.payments (order_id, customer_id, method, amount_thb, reference_no)
    values (v_order.id, v_uid, p_method, v_order.total_thb, v_ref)
    returning * into v_payment;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'payments_reference_active_uidx' then
      raise exception 'เลขอ้างอิงการโอนนี้เคยถูกใช้แล้ว' using errcode = 'P0001';
    elsif v_constraint = 'payments_one_open_per_order_uidx' then
      raise exception 'มีการแจ้งชำระเงินที่รอตรวจสอบอยู่แล้ว' using errcode = 'P0001';
    else
      raise;
    end if;
  end;

  begin
    insert into public.slips (payment_id, customer_id, storage_path, file_sha256, mime_type, size_bytes)
    values (v_payment.id, v_uid, p_storage_path, lower(p_file_sha256), p_mime_type, p_size_bytes);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'slips_file_sha256_active_uidx' then
        raise exception 'สลิปนี้เคยถูกใช้แจ้งชำระเงินแล้ว' using errcode = 'P0001';
      end if;
      raise exception 'ไฟล์สลิปนี้ถูกบันทึกแล้ว' using errcode = 'P0001';
    when check_violation then
      raise exception 'ข้อมูลไฟล์สลิปไม่ถูกต้อง' using errcode = 'P0001';
  end;

  return v_payment;
end;
$$;

-- ---------------------------------------------------------------------
-- review_payment: staff/admin ตรวจสลิปและยืนยันหรือปฏิเสธการชำระเงิน
-- ---------------------------------------------------------------------
create or replace function public.review_payment(
  p_payment_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_payment public.payments;
begin
  if not public.is_staff() then
    raise exception 'เฉพาะพนักงานเท่านั้น' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'การตัดสินใจไม่ถูกต้อง' using errcode = 'P0001';
  end if;
  if p_decision = 'reject' and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'ต้องระบุเหตุผลเมื่อปฏิเสธการชำระเงิน' using errcode = 'P0001';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'ไม่พบรายการชำระเงิน' using errcode = 'P0001';
  end if;
  if v_payment.status <> 'pending_review' then
    raise exception 'รายการนี้ได้รับการตรวจสอบแล้ว' using errcode = 'P0001';
  end if;

  perform set_config('app.change_reason', coalesce(p_reason, ''), true);

  update public.payments
  set status = case when p_decision = 'approve'
                    then 'verified'::public.payment_status
                    else 'rejected'::public.payment_status end,
      rejection_reason = case when p_decision = 'reject' then p_reason end,
      reviewed_by = v_uid,
      reviewed_at = now()
  where id = p_payment_id
  returning * into v_payment;

  update public.slips
  set status = case when p_decision = 'approve'
                    then 'approved'::public.slip_status
                    else 'rejected'::public.slip_status end,
      reviewed_by = v_uid,
      reviewed_at = now()
  where payment_id = p_payment_id;

  -- เมื่อยืนยันการชำระเงินแล้ว คำสั่งซื้อที่รอชำระจะเข้าสู่ขั้นดำเนินการ
  if p_decision = 'approve' then
    update public.orders set order_status = 'processing'
    where id = v_payment.order_id and order_status = 'pending';
  end if;

  perform set_config('app.change_reason', '', true);
  return v_payment;
end;
$$;

-- ---------------------------------------------------------------------
-- transition_order_status: staff/admin เปลี่ยนสถานะคำสั่งซื้อ
-- ---------------------------------------------------------------------
create or replace function public.transition_order_status(
  p_order_id uuid,
  p_to public.order_status,
  p_reason text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_order public.orders;
begin
  if v_role is null or v_role not in ('staff', 'admin') then
    raise exception 'เฉพาะพนักงานเท่านั้น' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ไม่พบคำสั่งซื้อ' using errcode = 'P0001';
  end if;

  perform set_config('app.change_reason', coalesce(p_reason, ''), true);

  if p_to = 'cancelled' then
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception 'ต้องระบุเหตุผลในการยกเลิกคำสั่งซื้อ' using errcode = 'P0001';
    end if;
    if v_order.order_status = 'processing' and v_role <> 'admin' then
      raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่ยกเลิกคำสั่งซื้อที่กำลังดำเนินการ' using errcode = '42501';
    end if;
    perform public.release_open_payments(p_order_id, p_reason);
  end if;

  update public.orders set order_status = p_to where id = p_order_id
  returning * into v_order;

  perform set_config('app.change_reason', '', true);
  return v_order;
end;
$$;

-- ---------------------------------------------------------------------
-- refund_payment: admin คืนเงินการชำระที่ยืนยันแล้ว (ต้องระบุเหตุผล)
-- ---------------------------------------------------------------------
create or replace function public.refund_payment(p_payment_id uuid, p_reason text)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'ต้องระบุเหตุผลในการคืนเงิน' using errcode = 'P0001';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'ไม่พบรายการชำระเงิน' using errcode = 'P0001';
  end if;
  if v_payment.status <> 'verified' then
    raise exception 'คืนเงินได้เฉพาะรายการที่ยืนยันแล้วเท่านั้น' using errcode = 'P0001';
  end if;

  perform set_config('app.change_reason', p_reason, true);
  update public.payments set status = 'refunded' where id = p_payment_id
  returning * into v_payment;
  perform set_config('app.change_reason', '', true);

  return v_payment;
end;
$$;

-- ---------------------------------------------------------------------
-- my_orders: ลูกค้าดูสรุปคำสั่งซื้อของตัวเอง (ไม่เปิดตารางการชำระเงินโดยตรง)
-- ---------------------------------------------------------------------
create or replace function public.my_orders()
returns table (
  order_id uuid,
  order_number bigint,
  package_name text,
  total_thb numeric,
  status public.order_status,
  latest_payment_status public.payment_status,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    o.order_number,
    o.package_name_snapshot,
    o.total_thb,
    o.order_status,
    (select p.status from public.payments p
     where p.order_id = o.id order by p.created_at desc limit 1),
    o.created_at
  from public.orders o
  where o.customer_id = auth.uid()
  order by o.created_at desc
$$;

-- ---------------------------------------------------------------------
-- get_public_settings: ค่าที่ตั้งเป็น public เท่านั้น (เช่น บัญชีรับโอน)
-- ---------------------------------------------------------------------
create or replace function public.get_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
  from public.settings s
  where s.is_public
$$;

-- ---------------------------------------------------------------------
-- Grants ของฟังก์ชัน RPC
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

-- ฟังก์ชันช่วยที่ใช้ใน RLS policy ต้องเรียกได้โดย authenticated
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;

grant execute on function public.create_order(uuid, text) to authenticated;
grant execute on function public.cancel_my_order(uuid, text) to authenticated;
grant execute on function public.submit_payment(uuid, public.payment_method, text, numeric, text, text, text, integer) to authenticated;
grant execute on function public.review_payment(uuid, text, text) to authenticated;
grant execute on function public.transition_order_status(uuid, public.order_status, text) to authenticated;
grant execute on function public.refund_payment(uuid, text) to authenticated;
grant execute on function public.my_orders() to authenticated;
grant execute on function public.get_public_settings() to authenticated;

-- ฟังก์ชันภายในไม่เปิดให้เรียกจาก API
-- (release_open_payments ถูกเรียกจากฟังก์ชันอื่นที่เป็น SECURITY DEFINER เท่านั้น)
