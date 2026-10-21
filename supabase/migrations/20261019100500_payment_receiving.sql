-- =====================================================================
-- ค่ารับเงิน: ชื่อธนาคาร ชื่อบัญชี เลขบัญชี และ QR รับเงิน
-- admin แก้ได้ผ่าน RPC (ตรวจรูปแบบค่า) ลูกค้าอ่านได้เฉพาะ 3 ค่าแรกผ่าน get_public_settings
-- path ของไฟล์ QR เป็นค่าภายใน (ไม่ public) และไฟล์อยู่ใน bucket payment-qr ที่ private
-- =====================================================================

create or replace function public.admin_save_payment_receiving(
  p_bank_name text,
  p_account_name text,
  p_account_number text,
  p_qr_storage_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bank text := btrim(coalesce(p_bank_name, ''));
  v_name text := btrim(coalesce(p_account_name, ''));
  v_number text := btrim(coalesce(p_account_number, ''));
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น' using errcode = '42501';
  end if;
  if char_length(v_bank) not between 1 and 80 then
    raise exception 'ต้องระบุชื่อธนาคาร (ไม่เกิน 80 ตัวอักษร)' using errcode = 'P0001';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'ต้องระบุชื่อบัญชี (ไม่เกิน 120 ตัวอักษร)' using errcode = 'P0001';
  end if;
  -- เลขบัญชีไทย: ตัวเลข 10–15 หลัก อาจมีขีดคั่น
  if v_number !~ '^[0-9]([0-9-]{8,18})[0-9]$' or length(regexp_replace(v_number, '-', '', 'g')) not between 10 and 15 then
    raise exception 'เลขบัญชีไม่ถูกต้อง (ตัวเลข 10–15 หลัก อาจมีขีดคั่น)' using errcode = 'P0001';
  end if;
  if p_qr_storage_path is not null
     and p_qr_storage_path !~ '^qr/[0-9a-f-]{36}\.(jpg|png|webp)$' then
    raise exception 'path ของไฟล์ QR ไม่ถูกต้อง' using errcode = 'P0001';
  end if;

  insert into public.settings (key, value, is_public, description, updated_by) values
    ('payment.bank_name', to_jsonb(v_bank), true, 'ชื่อธนาคารสำหรับรับเงิน', auth.uid()),
    ('payment.account_name', to_jsonb(v_name), true, 'ชื่อบัญชีรับเงิน', auth.uid()),
    ('payment.account_number', to_jsonb(v_number), true, 'เลขบัญชีรับเงิน', auth.uid())
  on conflict (key) do update
    set value = excluded.value, is_public = excluded.is_public,
        updated_by = excluded.updated_by, updated_at = now();

  if p_qr_storage_path is not null then
    insert into public.settings (key, value, is_public, description, updated_by)
    values ('payment.qr_storage_path', to_jsonb(p_qr_storage_path), false, 'path ของไฟล์ QR รับเงิน (ภายใน)', auth.uid())
    on conflict (key) do update
      set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  end if;

  return jsonb_build_object('bank_name', v_bank, 'account_name', v_name, 'account_number', v_number);
end;
$$;

revoke execute on function public.admin_save_payment_receiving(text, text, text, text) from public, anon;
grant execute on function public.admin_save_payment_receiving(text, text, text, text) to authenticated;
