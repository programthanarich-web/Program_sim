-- =====================================================================
-- ชุดทดสอบค่ารับเงิน (ทดสอบแยก รันต่อท้ายใน run.sh)
-- =====================================================================
begin;
\o /dev/null

select tests.as_superuser();
insert into auth.users (id, email) values
  ('f0000000-0000-4000-8000-000000000001', 'admin@pay.local'),
  ('f0000000-0000-4000-8000-000000000002', 'staff@pay.local'),
  ('f0000000-0000-4000-8000-0000000000c1', 'cust@pay.local');
update public.profiles set role = 'admin' where id = 'f0000000-0000-4000-8000-000000000001';
update public.profiles set role = 'staff' where id = 'f0000000-0000-4000-8000-000000000002';

select tests.as_user('f0000000-0000-4000-8000-000000000002');
select tests.denied('พนักงานแก้ค่ารับเงินไม่ได้',
  $q$select public.admin_save_payment_receiving('กสิกร', 'บจก. ตัวอย่าง', '123-4-56789-0', null)$q$);

select tests.as_user('f0000000-0000-4000-8000-0000000000c1');
select tests.denied('ลูกค้าแก้ค่ารับเงินไม่ได้',
  $q$select public.admin_save_payment_receiving('กสิกร', 'บจก. ตัวอย่าง', '1234567890', null)$q$);

select tests.as_user('f0000000-0000-4000-8000-000000000001');
select tests.denied('เลขบัญชีสั้นเกินไปถูกปฏิเสธ',
  $q$select public.admin_save_payment_receiving('กสิกร', 'ชื่อ', '12345', null)$q$);
select tests.denied('เลขบัญชีมีตัวอักษรถูกปฏิเสธ',
  $q$select public.admin_save_payment_receiving('กสิกร', 'ชื่อ', '12345abc90', null)$q$);
select tests.denied('path QR ที่ไม่ใช่รูปแบบที่กำหนดถูกปฏิเสธ',
  $q$select public.admin_save_payment_receiving('กสิกร', 'ชื่อ', '1234567890', '../secret.jpg')$q$);

select public.admin_save_payment_receiving('กสิกรไทย', 'บจก. โปรแกรมธนารีช', '123-4-56789-0',
  'qr/a1b2c3d4-0000-4000-8000-000000000001.png');

select tests.expect_value('แอดมินบันทึกเลขบัญชีได้ (เก็บเฉพาะตัวเลขและขีด)',
  $q$select value #>> '{}' from public.settings where key = 'payment.account_number'$q$, '123-4-56789-0');

select tests.expect_value('ลูกค้าเห็นเลขบัญชีผ่าน get_public_settings',
  $q$select public.get_public_settings() ->> 'payment.account_number'$q$, '123-4-56789-0');
select tests.expect_value('ลูกค้าเห็นชื่อธนาคารผ่าน get_public_settings',
  $q$select public.get_public_settings() ->> 'payment.bank_name'$q$, 'กสิกรไทย');
select tests.expect_value('path ของ QR ไม่ถูกเปิดเผยผ่าน get_public_settings',
  $q$select (public.get_public_settings() ? 'payment.qr_storage_path')::text$q$, 'false');

select tests.as_anon();
select tests.hidden('anon อ่านตาราง settings ไม่ได้', 'select key from public.settings');
select tests.denied('anon บันทึกค่ารับเงินไม่ได้',
  $q$select public.admin_save_payment_receiving('x', 'y', '1234567890', null)$q$);

select tests.as_user('f0000000-0000-4000-8000-000000000002');
select tests.expect_value('พนักงานอ่าน path ของ QR ได้ (สำหรับแสดงภาพในหลังบ้าน)',
  $q$select value #>> '{}' from public.settings where key = 'payment.qr_storage_path'$q$,
  'qr/a1b2c3d4-0000-4000-8000-000000000001.png');

select tests.as_user('f0000000-0000-4000-8000-000000000001');
select public.admin_save_payment_receiving('กสิกรไทย', 'บจก. โปรแกรมธนารีช', '1234567890', null);
select tests.expect_value('บันทึกโดยไม่แก้ QR คงค่า path เดิม',
  $q$select value #>> '{}' from public.settings where key = 'payment.qr_storage_path'$q$,
  'qr/a1b2c3d4-0000-4000-8000-000000000001.png');

select tests.as_superuser();
\o
select id, case when passed then 'PASS' else 'FAIL' end as result, name, detail
from tests.results order by id;

do $$
declare v_total integer; v_failed integer;
begin
  select count(*), count(*) filter (where not passed) into v_total, v_failed from tests.results;
  if v_failed > 0 then
    raise exception 'ชุดทดสอบค่ารับเงินไม่ผ่าน % จาก % รายการ', v_failed, v_total;
  end if;
  raise notice 'payment receiving: ผ่านทั้งหมด % รายการ', v_total;
end;
$$;

rollback;
