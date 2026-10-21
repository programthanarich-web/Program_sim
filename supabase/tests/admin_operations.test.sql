-- =====================================================================
-- ชุดทดสอบ admin operations: ผลการสมัคร, กฎการปิดงาน, แพ็กเกจ/ส่วนลด,
-- outbox การแจ้งเตือน และ worker (ทดสอบแยกจาก permissions.test.sql)
-- ทั้งไฟล์รันใน transaction เดียวและ ROLLBACK เมื่อจบ
-- =====================================================================

begin;
\o /dev/null

-- ---------------------------------------------------------------------
-- S0: ข้อมูลตั้งต้น
-- ---------------------------------------------------------------------
select tests.as_superuser();

insert into auth.users (id, email) values
  ('d0000000-0000-4000-8000-000000000001', 'admin1@ops.local'),
  ('d0000000-0000-4000-8000-000000000002', 'admin2@ops.local'),
  ('d0000000-0000-4000-8000-000000000003', 'staff@ops.local'),
  ('d0000000-0000-4000-8000-0000000000c1', 'cust@ops.local');

update public.profiles set role = 'admin' where id in
  ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002');
update public.profiles set role = 'staff' where id = 'd0000000-0000-4000-8000-000000000003';
update public.profiles set phone = '0811112222' where id = 'd0000000-0000-4000-8000-0000000000c1';

insert into public.packages (id, code, name, speed_mbps, price_thb, duration_days, is_active)
values ('e0000000-0000-4000-8000-000000000001', 'ops-100', 'Ops 100', 100, 399, 30, true);

-- ---------------------------------------------------------------------
-- S1: ลูกค้าสั่งซื้อและแจ้งชำระ แล้วพนักงานอนุมัติ
-- ---------------------------------------------------------------------
select tests.as_user('d0000000-0000-4000-8000-0000000000c1');
select public.create_order('e0000000-0000-4000-8000-000000000001', null);
select tests.as_superuser();
select tests.save('ops_order', (select id from public.orders
  where customer_id = 'd0000000-0000-4000-8000-0000000000c1'
  order by created_at desc limit 1));
select tests.as_user('d0000000-0000-4000-8000-0000000000c1');

select public.submit_payment(
  tests.id('ops_order'), 'bank_transfer', 'OPSREF0001', 399,
  'd0000000-0000-4000-8000-0000000000c1/b2000000-0000-4000-8000-000000000001.jpg',
  repeat('a', 64), 'image/jpeg', 1000);

-- ลูกค้าไม่เห็นตาราง payments โดยตรง จึงดึง id หลังสลับเป็นพนักงาน
select tests.as_user('d0000000-0000-4000-8000-000000000003');
select tests.as_superuser();
select tests.save('ops_payment', (select id from public.payments where order_id = tests.id('ops_order')));
select tests.as_user('d0000000-0000-4000-8000-000000000003');
select public.review_payment(tests.id('ops_payment'), 'approve', null);

select tests.expect_value('พนักงานอนุมัติการชำระ: คำสั่งซื้อเข้าสู่ processing',
  $q$select order_status::text from public.orders where id = tests.id('ops_order')$q$, 'processing');

select tests.expect_count('อนุมัติการชำระ: เกิดรายการแจ้งเตือนรับเงิน 1 รายการ',
  $q$select id from public.notification_logs where dedupe_key = 'payment_received:' || tests.id('ops_payment')::text$q$, 1);
select tests.expect_count('เข้าคิวสมัคร: เกิดรายการแจ้งเตือนงานรอสมัคร 1 รายการ',
  $q$select id from public.notification_logs where dedupe_key = 'signup_queue:' || tests.id('ops_order')::text$q$, 1);
select tests.expect_value('แจ้งเตือนไม่มีข้อมูลส่วนบุคคล (payload ไม่มีเบอร์)',
  $q$select (not exists (select 1 from public.notification_logs
     where order_id = tests.id('ops_order') and payload::text like '%0811112222%'))::text$q$, 'true');

-- ---------------------------------------------------------------------
-- S2: กฎการปิดงาน และลำดับการยืนยันผลการสมัคร
-- ---------------------------------------------------------------------
select tests.denied('พนักงานปิดงานโดยตรงไม่ได้ (ยังไม่มีการยืนยัน)',
  $q$select public.transition_order_status(tests.id('ops_order'), 'activated', 'ลอง')$q$);

select tests.denied('พนักงานบันทึกผลโดยไม่มีหมายเหตุไม่ได้',
  $q$select public.record_signup_result(tests.id('ops_order'), 'needs_info', '   ')$q$);

select public.record_signup_result(tests.id('ops_order'), 'needs_info', 'รอเลขบัตรประชาชนจากลูกค้า');
select tests.as_superuser();
select tests.save('ops_result_1', (select id from public.signup_results where order_id = tests.id('ops_order')));
select tests.as_user('d0000000-0000-4000-8000-000000000003');

select tests.denied('บันทึกซ้ำขณะยังมีผลรอยืนยัน',
  $q$select public.record_signup_result(tests.id('ops_order'), 'success', 'ซ้ำ')$q$);
select tests.denied('พนักงานยืนยันผลเองไม่ได้',
  $q$select public.confirm_signup_result(tests.id('ops_result_1'), 'เอง')$q$);

select tests.as_user('d0000000-0000-4000-8000-000000000001');
select public.confirm_signup_result(tests.id('ops_result_1'), 'รับทราบ');

select tests.expect_value('ยืนยัน needs_info แล้ว คำสั่งซื้อยังอยู่ระหว่างดำเนินการ',
  $q$select order_status::text from public.orders where id = tests.id('ops_order')$q$, 'processing');

select public.record_signup_result(tests.id('ops_order'), 'success', 'เปิดใช้งานแล้ว');
select tests.as_superuser();
select tests.save('ops_result_2', (select id from public.signup_results
  where order_id = tests.id('ops_order') and outcome = 'success'));
select tests.as_user('d0000000-0000-4000-8000-000000000001');

select tests.denied('ผู้บันทึกยืนยันผลของตัวเองไม่ได้ (แม้เป็น admin)',
  $q$select public.confirm_signup_result(tests.id('ops_result_2'), 'เอง')$q$);

select tests.as_user('d0000000-0000-4000-8000-000000000002');
select tests.denied('ยังปิดงานโดยตรงไม่ได้ แม้เป็น admin (ยังไม่มีการยืนยันผลสำเร็จ)',
  $q$select public.transition_order_status(tests.id('ops_order'), 'activated', 'ลอง')$q$);

select public.confirm_signup_result(tests.id('ops_result_2'), 'ตรวจแล้ว');

select tests.expect_value('admin คนที่สองยืนยันผลสำเร็จ: คำสั่งซื้อเป็น activated',
  $q$select order_status::text from public.orders where id = tests.id('ops_order')$q$, 'activated');

select tests.denied('ผลที่ยืนยันแล้วยืนยันซ้ำไม่ได้',
  $q$select public.confirm_signup_result(tests.id('ops_result_2'), 'ซ้ำ')$q$);

select tests.as_superuser();
select tests.denied('ผลที่ยืนยันแล้วแก้ไขไม่ได้ (แม้ superuser)',
  $q$update public.signup_results set note = 'แก้' where id = tests.id('ops_result_2')$q$);
select tests.denied('ผลที่ยืนยันแล้วลบไม่ได้',
  $q$delete from public.signup_results where id = tests.id('ops_result_2')$q$);

select tests.expect_count('audit log บันทึกการเปลี่ยนแปลงผลสมัคร (insert 2 + confirm 2)',
  $q$select id from public.audit_logs where table_name = 'signup_results'$q$, 4);

-- ---------------------------------------------------------------------
-- S3: สิทธิ์การเข้าถึงผลการสมัคร
-- ---------------------------------------------------------------------
select tests.as_user('d0000000-0000-4000-8000-0000000000c1');
select tests.hidden('ลูกค้าไม่เห็นผลการสมัคร', 'select id from public.signup_results');

select tests.as_anon();
select tests.hidden('anon ไม่เห็นผลการสมัคร', 'select id from public.signup_results');
select tests.denied('anon บันทึกผลการสมัครไม่ได้',
  $q$select public.record_signup_result(tests.id('ops_order'), 'success', 'x')$q$);

select tests.as_user('d0000000-0000-4000-8000-000000000003');
select tests.expect_count('พนักงานเห็นผลการสมัคร',
  $q$select id from public.signup_results$q$, 2);
select tests.denied('พนักงานเขียนตาราง signup_results โดยตรงไม่ได้',
  $q$insert into public.signup_results (order_id, outcome, note, recorded_by)
     values (tests.id('ops_order'), 'failed', 'x', 'd0000000-0000-4000-8000-000000000003')$q$);
select tests.denied('พนักงานบันทึกผลกลุ่มเดิมหลังปิดงานไม่ได้',
  $q$select public.record_signup_result(tests.id('ops_order'), 'failed', 'ย้อนหลัง')$q$);

-- ---------------------------------------------------------------------
-- S4: แพ็กเกจและส่วนลด (เฉพาะ admin แก้ไขได้)
-- ---------------------------------------------------------------------
select tests.denied('พนักงานบันทึกแพ็กเกจไม่ได้',
  $q$select public.admin_save_package(null, 'staff-x', 'X', 10, null, 1, 30, null, true, 0)$q$);

select tests.as_user('d0000000-0000-4000-8000-000000000001');
select public.admin_save_package(null, 'NEW-200', 'New 200', 200, null, 499, 30, 'ทดสอบ', true, 5);
select tests.expect_value('admin เพิ่มแพ็กเกจได้ และรหัสถูก normalize เป็นตัวพิมพ์เล็ก',
  $q$select code from public.packages where name = 'New 200'$q$, 'new-200');
select tests.denied('รหัสแพ็กเกจซ้ำถูกปฏิเสธ',
  $q$select public.admin_save_package(null, 'ops-100', 'Dup', 10, null, 1, 30, null, true, 0)$q$);
select tests.denied('ราคาติดลบถูกปฏิเสธ (CHECK)',
  $q$select public.admin_save_package(null, 'neg-1', 'Neg', 10, null, -1, 30, null, true, 0)$q$);

select public.admin_save_discount(null, 'vip20', 'percent', 20, 10, null, null, true);
select tests.expect_value('ส่วนลดใหม่ถูก normalize เป็นตัวพิมพ์ใหญ่',
  $q$select code from public.discount_codes where discount_value = 20$q$, 'VIP20');
select tests.denied('ส่วนลดเปอร์เซ็นต์เกิน 100 ถูกปฏิเสธ',
  $q$select public.admin_save_discount(null, 'OVER', 'percent', 150, null, null, null, true)$q$);

select tests.as_user('d0000000-0000-4000-8000-000000000003');
select tests.denied('พนักงานบันทึกส่วนลดไม่ได้',
  $q$select public.admin_save_discount(null, 'STAFF1', 'fixed', 10, null, null, null, true)$q$);

select tests.as_anon();
select tests.denied('anon บันทึกแพ็กเกจไม่ได้',
  $q$select public.admin_save_package(null, 'anon-1', 'A', 10, null, 1, 30, null, true, 0)$q$);

-- ---------------------------------------------------------------------
-- S5: outbox และ worker (service_role เท่านั้น)
-- ---------------------------------------------------------------------
select tests.as_user('d0000000-0000-4000-8000-000000000001');
select tests.denied('admin เรียก claim_notifications ตรงไม่ได้ (service only)',
  $q$select count(*) from public.claim_notifications(10)$q$);

select tests.as_superuser();
insert into public.notification_logs (channel, template, recipient_masked, dedupe_key, payload)
values ('line', 'signup_result', 'กลุ่มทดสอบ', 'test:failed-1', '{"order_number": 1}');
select tests.denied('payload ที่มีข้อมูลส่วนบุคคลถูกปฏิเสธ',
  $q$insert into public.notification_logs (channel, template, recipient_masked, dedupe_key, payload)
     values ('line', 'signup_result', 'กลุ่ม', 'test:pii', '{"phone": "0811112222"}')$q$);
select tests.denied('template ที่ไม่รู้จักถูกปฏิเสธ',
  $q$insert into public.notification_logs (channel, template, recipient_masked, dedupe_key, payload)
     values ('line', 'unknown_template', 'กลุ่ม', 'test:bad-template', '{}')$q$);

select tests.as_user('d0000000-0000-4000-8000-000000000003', 'service_role');
select tests.expect_value('worker claim ได้รายการที่ถึงเวลา (อย่างน้อย 3 รายการ)',
  $q$select (count(*) >= 3)::text from public.claim_notifications(50)$q$, 'true');
select tests.expect_value('หลัง claim รายการเดิมไม่ถูกหยิบซ้ำทันที',
  $q$select count(*)::text from public.claim_notifications(50)$q$, '0');

select public.complete_notification(
  (select id from public.notification_logs where dedupe_key = 'test:failed-1'),
  'retry', null, 'HTTP 500', 60);
select tests.expect_value('ผลส่งแบบ retry ยังไม่ถูก mark ว่า failed เมื่อยังเหลือความพยายาม',
  $q$select status::text from public.notification_logs where dedupe_key = 'test:failed-1'$q$, 'queued');

select public.complete_notification(
  (select id from public.notification_logs where dedupe_key like 'payment_received:%'),
  'sent', 'msg-123', null, null);
select tests.expect_value('ส่งสำเร็จ: บันทึก provider message id และสถานะ sent',
  $q$select status::text || ':' || provider_message_id from public.notification_logs
     where dedupe_key like 'payment_received:%'$q$, 'sent:msg-123');

select tests.denied('ผลการส่งที่ไม่รู้จักถูกปฏิเสธ',
  $q$select public.complete_notification(tests.id('ops_order'), 'maybe', null, null, null)$q$);

select tests.as_user('d0000000-0000-4000-8000-000000000003');
select tests.denied('พนักงานส่งซ้ำรายการ failed ไม่ได้ (เฉพาะ admin)',
  $q$select public.admin_retry_notification((select id from public.notification_logs where dedupe_key = 'test:failed-1'))$q$);

select tests.as_superuser();
select public.complete_notification(
  (select id from public.notification_logs where dedupe_key = 'test:failed-1'),
  'failed', null, 'permanent', null);

select tests.as_user('d0000000-0000-4000-8000-000000000001');
select tests.expect_value('admin ส่งซ้ำรายการ failed ได้ และกลับเป็น queued',
  $q$select (public.admin_retry_notification((select id from public.notification_logs where dedupe_key = 'test:failed-1'))).status::text$q$,
  'queued');
select tests.denied('ส่งซ้ำรายการที่ไม่ได้ล้มเหลวไม่ได้',
  $q$select public.admin_retry_notification((select id from public.notification_logs where dedupe_key like 'payment_received:%'))$q$);

-- ---------------------------------------------------------------------
-- S6: สิทธิ์ตารางและฟังก์ชันใหม่
-- ---------------------------------------------------------------------
select tests.as_superuser();
select tests.expect_value('authenticated ไม่มีสิทธิ์เขียนตาราง signup_results โดยตรง',
  $q$select (has_table_privilege('authenticated', 'public.signup_results', 'INSERT')
     or has_table_privilege('authenticated', 'public.signup_results', 'UPDATE'))::text$q$, 'false');
select tests.expect_value('anon ไม่มีสิทธิ์รัน RPC ของผู้ดูแลใหม่',
  $q$select (has_function_privilege('anon', 'public.admin_save_package(uuid, text, text, integer, integer, numeric, integer, text, boolean, integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.confirm_signup_result(uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.claim_notifications(integer)', 'EXECUTE'))::text$q$, 'false');
select tests.expect_value('authenticated ไม่มีสิทธิ์รัน worker',
  $q$select (has_function_privilege('authenticated', 'public.claim_notifications(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.complete_notification(uuid, text, text, text, integer)', 'EXECUTE'))::text$q$, 'false');

-- ---------------------------------------------------------------------
-- สรุปผล
-- ---------------------------------------------------------------------
\o
select id, case when passed then 'PASS' else 'FAIL' end as result, name, detail
from tests.results order by id;

do $$
declare
  v_total integer;
  v_failed integer;
begin
  select count(*), count(*) filter (where not passed)
  into v_total, v_failed
  from tests.results;

  if v_failed > 0 then
    raise exception 'ชุดทดสอบ admin ไม่ผ่าน % จาก % รายการ', v_failed, v_total;
  end if;
  raise notice 'admin operations: ผ่านทั้งหมด % รายการ', v_total;
end;
$$;

rollback;
