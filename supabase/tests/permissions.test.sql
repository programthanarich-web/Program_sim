-- =====================================================================
-- ProgramThanarich | ชุดทดสอบสิทธิ์และความสมบูรณ์ของข้อมูล
--
-- ทดสอบ: anon, ลูกค้า A, ลูกค้า B, staff, admin, service_role
-- ทั้งไฟล์รันใน transaction เดียวและ ROLLBACK เมื่อจบ
-- ถ้ามีรายการไม่ผ่าน สคริปต์จะหยุดด้วย error และ exit code ไม่เป็น 0
-- =====================================================================

begin;

-- ซ่อนผลลัพธ์ของการเรียกฟังก์ชัน harness (ผลจริงแสดงในส่วนสรุปท้ายไฟล์)
\o /dev/null

-- ---------------------------------------------------------------------
-- S0: ข้อมูลตั้งต้น (superuser)
-- ---------------------------------------------------------------------
select tests.as_superuser();

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'admin@test.local'),
  ('a0000000-0000-4000-8000-000000000002', 'staff@test.local'),
  ('a0000000-0000-4000-8000-0000000000a1', 'cust-a@test.local'),
  ('a0000000-0000-4000-8000-0000000000b1', 'cust-b@test.local');

update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000001';
update public.profiles set role = 'staff' where id = 'a0000000-0000-4000-8000-000000000002';
update public.profiles set phone = '0812345678' where id = 'a0000000-0000-4000-8000-0000000000a1';
update public.profiles set phone = '0898765432' where id = 'a0000000-0000-4000-8000-0000000000b1';

insert into public.packages (id, code, name, speed_mbps, data_quota_gb, price_thb, duration_days, is_active, sort_order) values
  ('b0000000-0000-4000-8000-000000000001', 'home-200', 'Home 200', 200, null, 599, 30, true, 1),
  ('b0000000-0000-4000-8000-000000000002', 'old-plan', 'Old Plan', 50, null, 299, 30, false, 2);

insert into public.discount_codes (code, discount_type, discount_value, max_uses, valid_from, valid_until) values
  ('SAVE100', 'fixed', 100, null, now() - interval '1 day', null),
  ('PCT10', 'percent', 10, 1, now() - interval '1 day', null),
  ('OLD50', 'fixed', 50, null, now() - interval '2 days', now() - interval '1 day');

insert into public.notification_logs (customer_id, channel, template, recipient_masked) values
  ('a0000000-0000-4000-8000-0000000000a1', 'sms', 'payment_received', '081-XXX-X678');

insert into public.settings (key, value, is_public, description) values
  ('payment.bank_name', '"กสิกรไทย"', true, 'ชื่อธนาคารสำหรับโอนเงิน'),
  ('internal.fee_rate', '0.07', false, 'อัตราค่าธรรมเนียมภายใน');

-- ---------------------------------------------------------------------
-- S1: anon (ผู้ใช้ที่ยังไม่ล็อกอิน)
-- ---------------------------------------------------------------------
select tests.as_anon();

select tests.expect_count('anon: เห็นเฉพาะแพ็กเกจที่เปิดขาย',
  'select id from public.packages', 1);
select tests.hidden('anon: ไม่เห็นคำสั่งซื้อ', 'select id from public.orders');
select tests.hidden('anon: ไม่เห็นการชำระเงิน', 'select id from public.payments');
select tests.hidden('anon: ไม่เห็นสลิป', 'select id from public.slips');
select tests.hidden('anon: ไม่เห็นประวัติคำสั่งซื้อ', 'select id from public.order_events');
select tests.hidden('anon: ไม่เห็นการแจ้งเตือน', 'select id from public.notification_logs');
select tests.hidden('anon: ไม่เห็นการตั้งค่า', 'select key from public.settings');
select tests.hidden('anon: ไม่เห็น audit log', 'select id from public.audit_logs');
select tests.hidden('anon: ไม่เห็นโปรไฟล์', 'select id from public.profiles');
select tests.hidden('anon: ไม่เห็นรหัสส่วนลด', 'select id from public.discount_codes');
select tests.denied('anon: สั่งซื้อไม่ได้',
  $q$select public.create_order('b0000000-0000-4000-8000-000000000001', null)$q$);
select tests.denied('anon: เพิ่มแพ็กเกจไม่ได้',
  $q$insert into public.packages (code, name, speed_mbps, price_thb, duration_days)
     values ('hack-1', 'Hack', 1, 0, 1)$q$);
select tests.denied('anon: เรียกดูการตั้งค่าไม่ได้',
  $q$select public.get_public_settings()$q$);

-- ---------------------------------------------------------------------
-- S2: ลูกค้า A สั่งซื้อ (ตรวจ snapshot ราคาและส่วนลด)
-- ---------------------------------------------------------------------
select tests.as_user('a0000000-0000-4000-8000-0000000000a1');

select tests.expect_count('ลูกค้า A: ยังไม่มีคำสั่งซื้อ',
  'select id from public.orders', 0);
select tests.expect_count('ลูกค้า A: เห็นโปรไฟล์ตัวเองเท่านั้น',
  'select id from public.profiles', 1);
select tests.denied('ลูกค้า A: สั่งซื้อแพ็กเกจที่ปิดขายไม่ได้',
  $q$select public.create_order('b0000000-0000-4000-8000-000000000002', null)$q$);
select tests.ok('ลูกค้า A: สั่งซื้อพร้อมส่วนลดแบบจำนวนเงิน (fixed)',
  $q$select public.create_order('b0000000-0000-4000-8000-000000000001', 'save100')$q$);
select tests.ok('ลูกค้า A: สั่งซื้อพร้อมส่วนลดแบบเปอร์เซ็นต์ (ใช้ได้ 1 ครั้ง)',
  $q$select public.create_order('b0000000-0000-4000-8000-000000000001', 'PCT10')$q$);

select tests.as_superuser();
select tests.save('order_a1', (select id from public.orders
  where customer_id = 'a0000000-0000-4000-8000-0000000000a1' order by order_number asc limit 1));
select tests.save('order_a2', (select id from public.orders
  where customer_id = 'a0000000-0000-4000-8000-0000000000a1' order by order_number desc limit 1));

select tests.expect_value('snapshot: ยอดรวมแบบ fixed = ราคา - ส่วนลด',
  $q$select total_thb::text from public.orders where id = tests.id('order_a1')$q$, '499.00');
select tests.expect_value('snapshot: ราคาต่อหน่วยถูกอ่านจากแคตตาล็อก',
  $q$select unit_price_thb::text from public.orders where id = tests.id('order_a1')$q$, '599.00');
select tests.expect_value('snapshot: ส่วนลดเปอร์เซ็นต์คำนวณในฐานข้อมูล',
  $q$select total_thb::text from public.orders where id = tests.id('order_a2')$q$, '539.10');
select tests.expect_value('snapshot: เก็บชื่อแพ็กเกจไว้ในคำสั่งซื้อ',
  $q$select package_name_snapshot from public.orders where id = tests.id('order_a1')$q$, 'Home 200');

-- ---------------------------------------------------------------------
-- S3: ลูกค้า B สั่งซื้อ และทดสอบเงื่อนไขส่วนลด
-- ---------------------------------------------------------------------
select tests.as_user('a0000000-0000-4000-8000-0000000000b1');

select tests.denied('ลูกค้า B: ใช้รหัส PCT10 ซ้ำเกินจำนวนครั้งไม่ได้',
  $q$select public.create_order('b0000000-0000-4000-8000-000000000001', 'PCT10')$q$);
select tests.denied('ลูกค้า B: ใช้รหัสที่หมดอายุไม่ได้',
  $q$select public.create_order('b0000000-0000-4000-8000-000000000001', 'OLD50')$q$);
select tests.denied('ลูกค้า B: ใช้รหัสที่ไม่มีอยู่ไม่ได้',
  $q$select public.create_order('b0000000-0000-4000-8000-000000000001', 'NOPE')$q$);
select tests.ok('ลูกค้า B: สั่งซื้อพร้อมรหัส SAVE100',
  $q$select public.create_order('b0000000-0000-4000-8000-000000000001', 'SAVE100')$q$);
select tests.ok('ลูกค้า B: สั่งซื้อแบบไม่มีส่วนลด',
  $q$select public.create_order('b0000000-0000-4000-8000-000000000001', null)$q$);

select tests.as_superuser();
select tests.save('order_b1', (select id from public.orders
  where customer_id = 'a0000000-0000-4000-8000-0000000000b1' order by order_number asc limit 1));
select tests.save('order_b2', (select id from public.orders
  where customer_id = 'a0000000-0000-4000-8000-0000000000b1' order by order_number desc limit 1));

-- ---------------------------------------------------------------------
-- S4: ลูกค้า A แจ้งชำระเงินและทดสอบขอบเขตของข้อมูล
-- ---------------------------------------------------------------------
select tests.as_user('a0000000-0000-4000-8000-0000000000a1');

select tests.expect_count('ลูกค้า A: เห็นเฉพาะคำสั่งซื้อของตัวเอง (2 รายการ)',
  'select id from public.orders', 2);
select tests.denied('ลูกค้า A: แก้ราคาคำสั่งซื้อตรงๆ ไม่ได้',
  $q$update public.orders set unit_price_thb = 1, total_thb = 1, discount_amount_thb = 598
     where id = tests.id('order_a1')$q$);
select tests.denied('ลูกค้า A: เปลี่ยนสถานะคำสั่งซื้อเองไม่ได้',
  $q$update public.orders set order_status = 'processing' where id = tests.id('order_a1')$q$);
select tests.denied('ลูกค้า A: สร้างแถว orders ตรงๆ ไม่ได้',
  $q$insert into public.orders (customer_id, package_id, package_code_snapshot, package_name_snapshot,
       speed_mbps_snapshot, duration_days_snapshot, unit_price_thb, total_thb)
     values (auth.uid(), 'b0000000-0000-4000-8000-000000000001', 'home-200', 'x', 1, 1, 1, 1)$q$);

select tests.hidden('ลูกค้า A: ไม่เห็นคำสั่งซื้อของลูกค้า B',
  $q$select id from public.orders where customer_id = 'a0000000-0000-4000-8000-0000000000b1'$q$);
select tests.hidden('ลูกค้า A: ไม่เห็นการชำระเงิน', 'select id from public.payments');
select tests.hidden('ลูกค้า A: ไม่เห็นสลิป', 'select id from public.slips');
select tests.hidden('ลูกค้า A: ไม่เห็นประวัติคำสั่งซื้อ', 'select id from public.order_events');
select tests.hidden('ลูกค้า A: ไม่เห็นการแจ้งเตือน', 'select id from public.notification_logs');
select tests.hidden('ลูกค้า A: ไม่เห็น audit log', 'select id from public.audit_logs');
select tests.hidden('ลูกค้า A: ไม่เห็นการตั้งค่าภายใน',
  $q$select key from public.settings where key = 'internal.fee_rate'$q$);
select tests.hidden('ลูกค้า A: ไม่เห็นรหัสส่วนลด', 'select id from public.discount_codes');
select tests.expect_value('ลูกค้า A: get_public_settings มีค่า public',
  $q$select (public.get_public_settings() ? 'payment.bank_name')::text$q$, 'true');
select tests.expect_value('ลูกค้า A: get_public_settings ไม่มีค่าภายใน',
  $q$select (public.get_public_settings() ? 'internal.fee_rate')::text$q$, 'false');

select tests.ok('ลูกค้า A: แก้ชื่อของตัวเองได้',
  $q$update public.profiles set full_name = 'สมชาย ทดสอบ' where id = auth.uid()$q$);
select tests.denied('ลูกค้า A: เลื่อนขั้นเป็น admin ของตัวเองไม่ได้',
  $q$update public.profiles set role = 'admin' where id = auth.uid()$q$);
select tests.denied('ลูกค้า A: เปลี่ยนเบอร์ของตัวเองไม่ได้',
  $q$update public.profiles set phone = '0800000000' where id = auth.uid()$q$);
select tests.ok('ลูกค้า A: แก้โปรไฟล์ของคนอื่นไม่มีผล (RLS กรองแถวออก)',
  $q$update public.profiles set full_name = 'แฮ็ก' where id = 'a0000000-0000-4000-8000-000000000002'$q$);

select tests.denied('ลูกค้า A: แจ้งยอดไม่ตรงกับคำสั่งซื้อไม่ได้',
  $q$select public.submit_payment(tests.id('order_a1'), 'bank_transfer', 'REF500000', 500,
     'a0000000-0000-4000-8000-0000000000a1/11111111-1111-4111-8111-111111111111.jpg',
     repeat('a', 64), 'image/jpeg', 1000)$q$);
select tests.denied('ลูกค้า A: ใช้สลิปจากโฟลเดอร์ของลูกค้า B ไม่ได้',
  $q$select public.submit_payment(tests.id('order_a1'), 'bank_transfer', 'REF499000', 499,
     'a0000000-0000-4000-8000-0000000000b1/22222222-2222-4222-8222-222222222222.jpg',
     repeat('a', 64), 'image/jpeg', 1000)$q$);
select tests.denied('ลูกค้า A: แจ้งชำระคำสั่งซื้อของลูกค้า B ไม่ได้',
  $q$select public.submit_payment(tests.id('order_b1'), 'bank_transfer', 'REF499001', 499,
     'a0000000-0000-4000-8000-0000000000a1/11111111-1111-4111-8111-111111111111.jpg',
     repeat('a', 64), 'image/jpeg', 1000)$q$);
select tests.ok('ลูกค้า A: แจ้งชำระได้ (normalize เลขอ้างอิงเป็น ABC123456)',
  $q$select public.submit_payment(tests.id('order_a1'), 'bank_transfer', ' abc-123 456 ', 499,
     'a0000000-0000-4000-8000-0000000000a1/11111111-1111-4111-8111-111111111111.jpg',
     repeat('a', 64), 'image/jpeg', 1000)$q$);

select tests.as_superuser();
select tests.save('pay_a1', (select id from public.payments where order_id = tests.id('order_a1')));
select tests.expect_value('payment: เลขอ้างอิงถูก normalize',
  $q$select reference_no from public.payments where id = tests.id('pay_a1')$q$, 'ABC123456');
select tests.expect_value('payment: สถานะเริ่มต้นคือรอตรวจสอบ',
  $q$select status::text from public.payments where id = tests.id('pay_a1')$q$, 'pending_review');
select tests.expect_value('order_events: บันทึกการสร้างคำสั่งซื้อและการแจ้งชำระ',
  $q$select count(*)::text from public.order_events where order_id = tests.id('order_a1')
     and event_type in ('order_created', 'payment_submitted')$q$, '2');

select tests.as_user('a0000000-0000-4000-8000-0000000000a1');
select tests.denied('ลูกค้า A: แจ้งชำระซ้ำในคำสั่งซื้อที่ยังเปิดอยู่ไม่ได้',
  $q$select public.submit_payment(tests.id('order_a1'), 'promptpay', 'SECOND0001', 499,
     'a0000000-0000-4000-8000-0000000000a1/11111111-1111-4111-8111-111111111111.jpg',
     repeat('e', 64), 'image/png', 1000)$q$);
select tests.expect_value('ลูกค้า A: my_orders แสดงสถานะการชำระเงินของคำสั่งซื้อ',
  $q$select latest_payment_status::text from public.my_orders() where order_id = tests.id('order_a1')$q$,
  'pending_review');
select tests.denied('ลูกค้า A: ยกเลิกคำสั่งซื้อของลูกค้า B ไม่ได้',
  $q$select public.cancel_my_order(tests.id('order_b2'), 'ทดสอบ')$q$);
select tests.denied('ลูกค้า A: อนุมัติการชำระเงินเองไม่ได้',
  $q$select public.review_payment(tests.id('pay_a1'), 'approve', null)$q$);
select tests.denied('ลูกค้า A: เปลี่ยนสถานะคำสั่งซื้อผ่าน RPC ไม่ได้',
  $q$select public.transition_order_status(tests.id('order_a1'), 'activated', 'ทดสอบ')$q$);
select tests.denied('ลูกค้า A: คืนเงินไม่ได้',
  $q$select public.refund_payment(tests.id('pay_a1'), 'ทดสอบ')$q$);

-- ---------------------------------------------------------------------
-- S5: ลูกค้า B แจ้งชำระและทดสอบการป้องกันข้อมูลซ้ำ
-- ---------------------------------------------------------------------
select tests.as_user('a0000000-0000-4000-8000-0000000000b1');

select tests.denied('ลูกค้า B: เลขอ้างอิงซ้ำกับลูกค้า A ไม่ได้',
  $q$select public.submit_payment(tests.id('order_b1'), 'bank_transfer', 'abc123456', 499,
     'a0000000-0000-4000-8000-0000000000b1/44444444-4444-4444-8444-444444444444.jpg',
     repeat('f', 64), 'image/jpeg', 1000)$q$);
select tests.denied('ลูกค้า B: สลิปไฟล์ซ้ำ (hash เดียวกับลูกค้า A) ไม่ได้',
  $q$select public.submit_payment(tests.id('order_b1'), 'bank_transfer', 'DUPSLIP001', 499,
     'a0000000-0000-4000-8000-0000000000b1/44444444-4444-4444-8444-444444444444.jpg',
     repeat('a', 64), 'image/jpeg', 1000)$q$);
select tests.ok('ลูกค้า B: แจ้งชำระได้ด้วยเลขอ้างอิงใหม่',
  $q$select public.submit_payment(tests.id('order_b1'), 'bank_transfer', 'ZZ999999', 499,
     'a0000000-0000-4000-8000-0000000000b1/22222222-2222-4222-8222-222222222222.jpg',
     repeat('b', 64), 'image/jpeg', 1000)$q$);
select tests.expect_count('ลูกค้า B: my_orders เห็นเฉพาะคำสั่งซื้อของตัวเอง',
  'select order_id from public.my_orders()', 2);
select tests.hidden('ลูกค้า B: ไม่เห็นการชำระเงินของลูกค้า A', 'select id from public.payments');
select tests.hidden('ลูกค้า B: ไม่เห็นสลิปของลูกค้า A (หลังมีสลิปในระบบแล้ว)', 'select id from public.slips');
select tests.hidden('ลูกค้า B: ไม่เห็นประวัติคำสั่งซื้อของลูกค้า A', 'select id from public.order_events');
select tests.hidden('ลูกค้า A: ไม่เห็นสลิปของตัวเองหลังแจ้งชำระ', 'select id from public.slips');
select tests.denied('ลูกค้า B: ยกเลิกคำสั่งซื้อของลูกค้า A ไม่ได้',
  $q$select public.cancel_my_order(tests.id('order_a1'), 'ทดสอบ')$q$);

select tests.as_superuser();
select tests.save('pay_b1', (select id from public.payments where order_id = tests.id('order_b1')));

-- ---------------------------------------------------------------------
-- S6: staff ตรวจสอบและจัดการคำสั่งซื้อ
-- ---------------------------------------------------------------------
select tests.as_user('a0000000-0000-4000-8000-000000000002');

select tests.expect_count('staff: เห็นคำสั่งซื้อทั้งหมด (4 รายการ)',
  'select id from public.orders', 4);
select tests.expect_count('staff: เห็นการชำระเงินทั้งหมด (2 รายการ)',
  'select id from public.payments', 2);
select tests.expect_count('staff: เห็นสลิปทั้งหมด (2 รายการ)',
  'select id from public.slips', 2);
select tests.expect_count('staff: เห็นการแจ้งเตือนได้',
  'select id from public.notification_logs', 1);
select tests.hidden('staff: ไม่เห็น audit log', 'select id from public.audit_logs');
select tests.denied('staff: แก้ราคาแพ็กเกจไม่ได้',
  $q$insert into public.packages (code, name, speed_mbps, price_thb, duration_days)
     values ('staff-1', 'Staff', 1, 1, 1)$q$);
select tests.ok('staff: พยายามแก้ราคาแพ็กเกจ (RLS กรองออก ไม่มีผล)',
  $q$update public.packages set price_thb = 1 where id = 'b0000000-0000-4000-8000-000000000001'$q$);
select tests.ok('staff: พยายามเปลี่ยนบทบาทลูกค้า (RLS กรองแถวออก ไม่มีผล)',
  $q$update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-0000000000b1'$q$);
select tests.denied('staff: คืนเงินไม่ได้',
  $q$select public.refund_payment(tests.id('pay_a1'), 'ทดสอบ')$q$);
select tests.denied('staff: ปฏิเสธการชำระโดยไม่ระบุเหตุผลไม่ได้',
  $q$select public.review_payment(tests.id('pay_b1'), 'reject', null)$q$);
select tests.ok('staff: อนุมัติการชำระเงินของลูกค้า A',
  $q$select public.review_payment(tests.id('pay_a1'), 'approve', null)$q$);
select tests.ok('staff: ยืนยันสถานะดำเนินการของคำสั่งซื้อ A (ไม่มีการเปลี่ยนแปลง)',
  $q$select public.transition_order_status(tests.id('order_a1'), 'processing', null)$q$);
select tests.denied('staff: เปิดใช้งานโดยตรงไม่ได้ ต้องให้ผู้ดูแลยืนยันผลการสมัครก่อน',
  $q$select public.transition_order_status(tests.id('order_a1'), 'activated', 'เปิดใช้งานแล้ว')$q$);
select tests.ok('staff: บันทึกผลการสมัครสำเร็จของคำสั่งซื้อ A',
  $q$select public.record_signup_result(tests.id('order_a1'), 'success', 'เปิดใช้งานแพ็กเกจแล้ว')$q$);
select tests.as_superuser();
select tests.save('signup_a1', (select id from public.signup_results where order_id = tests.id('order_a1')));
select tests.as_user('a0000000-0000-4000-8000-000000000001');
select tests.ok('admin: ยืนยันผลการสมัครสำเร็จ ทำให้คำสั่งซื้อ A เปิดใช้งาน',
  $q$select public.confirm_signup_result(tests.id('signup_a1'), 'ยืนยันแล้ว')$q$);
select tests.as_user('a0000000-0000-4000-8000-000000000002');
select tests.denied('staff: ย้อนสถานะจาก activated กลับเป็น pending ไม่ได้',
  $q$select public.transition_order_status(tests.id('order_a1'), 'pending', null)$q$);
select tests.denied('staff: ยกเลิกคำสั่งซื้อโดยไม่ระบุเหตุผลไม่ได้',
  $q$select public.transition_order_status(tests.id('order_a2'), 'cancelled', null)$q$);
select tests.ok('staff: ยกเลิกคำสั่งซื้อ A2 ที่รอดำเนินการพร้อมเหตุผล',
  $q$select public.transition_order_status(tests.id('order_a2'), 'cancelled', 'ลูกค้าไม่ประสงค์ต่อ')$q$);
select tests.denied('staff: ปฏิเสธการชำระที่ไม่มีเหตุผลไม่ได้ (ซ้ำกับข้อด้านบน ยืนยันอีกครั้ง)',
  $q$select public.review_payment(tests.id('pay_b1'), 'reject', '   ')$q$);
select tests.ok('staff: ปฏิเสธการชำระของลูกค้า B พร้อมเหตุผล',
  $q$select public.review_payment(tests.id('pay_b1'), 'reject', 'สลิปไม่ชัดเจน')$q$);
select tests.expect_count('staff: ประวัติคำสั่งซื้อ A1 ครบ 7 เหตุการณ์ (สร้าง, แจ้งชำระ, อัปโหลดสลิป, ตรวจสลิป, ตรวจการชำระ, เริ่มดำเนินการ, เปิดใช้งาน)',
  $q$select id from public.order_events where order_id = tests.id('order_a1')$q$, 7);

-- ---------------------------------------------------------------------
-- S7: ลูกค้า B แจ้งชำระใหม่หลังถูกปฏิเสธ และยกเลิกคำสั่งซื้อ
-- ---------------------------------------------------------------------
select tests.as_user('a0000000-0000-4000-8000-0000000000b1');

select tests.ok('ลูกค้า B: แจ้งชำระใหม่ด้วยเลขอ้างอิงเดิมได้หลังถูกปฏิเสธ',
  $q$select public.submit_payment(tests.id('order_b1'), 'bank_transfer', 'ZZ999999', 499,
     'a0000000-0000-4000-8000-0000000000b1/33333333-3333-4333-8333-333333333333.jpg',
     repeat('c', 64), 'image/jpeg', 1000)$q$);

select tests.as_superuser();
select tests.save('pay_b2', (select id from public.payments
  where order_id = tests.id('order_b1') and status = 'pending_review'));

select tests.as_user('a0000000-0000-4000-8000-0000000000b1');
select tests.ok('ลูกค้า B: ยกเลิกคำสั่งซื้อ B1 ที่ยังรอดำเนินการได้',
  $q$select public.cancel_my_order(tests.id('order_b1'), 'เปลี่ยนใจ')$q$);
select tests.denied('ลูกค้า B: ยกเลิกคำสั่งซื้อที่ยกเลิกไปแล้วซ้ำไม่ได้',
  $q$select public.cancel_my_order(tests.id('order_b1'), 'เปลี่ยนใจ')$q$);

select tests.as_superuser();
select tests.expect_value('การยกเลิก: การแจ้งชำระที่รอตรวจถูกปิดอัตโนมัติ',
  $q$select status::text from public.payments where id = tests.id('pay_b2')$q$, 'rejected');
select tests.expect_value('การยกเลิก: สลิปที่เกี่ยวข้องถูกปฏิเสธด้วย',
  $q$select s.status::text from public.slips s where s.payment_id = tests.id('pay_b2')$q$, 'rejected');

-- ---------------------------------------------------------------------
-- S8: admin จัดการแพ็กเกจ ส่วนลด การตั้งค่า และคืนเงิน
-- ---------------------------------------------------------------------
select tests.as_superuser();
select tests.expect_value('staff ไม่สามารถเปลี่ยนบทบาทลูกค้าได้ (บทบาทยังเป็น customer)',
  $q$select role::text from public.profiles where id = 'a0000000-0000-4000-8000-0000000000b1'$q$, 'customer');

select tests.as_user('a0000000-0000-4000-8000-000000000001');

select tests.ok('admin: เพิ่มแพ็กเกจใหม่ได้',
  $q$insert into public.packages (code, name, speed_mbps, price_thb, duration_days)
     values ('pro-500', 'Pro 500', 500, 899, 30)$q$);
select tests.ok('admin: แก้ไขส่วนลดได้',
  $q$update public.discount_codes set is_active = false where code = 'SAVE100'$q$);
select tests.ok('admin: แก้ไขการตั้งค่าได้',
  $q$update public.settings set value = '"ไทยพาณิชย์"' where key = 'payment.bank_name'$q$);
select tests.denied('admin: คืนเงินโดยไม่ระบุเหตุผลไม่ได้',
  $q$select public.refund_payment(tests.id('pay_a1'), '')$q$);
select tests.ok('admin: คืนเงินรายการที่ยืนยันแล้วพร้อมเหตุผล',
  $q$select public.refund_payment(tests.id('pay_a1'), 'ลูกค้าขอยกเลิกหลังติดตั้ง')$q$);
select tests.expect_count('admin: เห็น audit log ของการตั้งค่า (2 insert + 1 update)',
  $q$select id from public.audit_logs where table_name = 'settings'$q$, 3);
select tests.ok('admin: เปลี่ยนบทบาทลูกค้าได้',
  $q$update public.profiles set role = 'staff' where id = 'a0000000-0000-4000-8000-0000000000b1'$q$);

select tests.as_superuser();
select tests.expect_value('admin: บทบาทของลูกค้า B ถูกเปลี่ยนจริง',
  $q$select role::text from public.profiles where id = 'a0000000-0000-4000-8000-0000000000b1'$q$, 'staff');
select tests.expect_value('admin: การคืนเงินถูกบันทึกสถานะ refunded',
  $q$select status::text from public.payments where id = tests.id('pay_a1')$q$, 'refunded');

-- ---------------------------------------------------------------------
-- S9: service_role และความสมบูรณ์ของข้อมูล (superuser)
-- ---------------------------------------------------------------------
select tests.as_user(null, 'service_role');
select tests.expect_value('service_role: อ่านการชำระเงินได้ (bypass RLS สำหรับ server)',
  $q$select (count(*) > 0)::text from public.payments$q$, 'true');

select tests.denied('สลิปต้องเป็นของเจ้าของการชำระเงิน (customer_id ไม่ตรงกับ payment ถูกปฏิเสธ)',
  $q$insert into public.slips (payment_id, customer_id, storage_path, file_sha256, mime_type, size_bytes)
     values ((select id from public.payments where reference_no = 'NEWREF0001'), 'a0000000-0000-4000-8000-0000000000a1',
       'a0000000-0000-4000-8000-0000000000a1/66666666-6666-4666-8666-666666666666.jpg',
       repeat('8', 64), 'image/jpeg', 100)$q$);

select tests.as_superuser();

select tests.denied('ประวัติคำสั่งซื้อแก้ไขไม่ได้ (append-only)',
  $q$update public.order_events set reason = 'แก้ไข' where true$q$);
select tests.denied('ประวัติคำสั่งซื้อลบไม่ได้ (append-only)',
  $q$delete from public.order_events$q$);
select tests.denied('ประวัติคำสั่งซื้อ truncate ไม่ได้ (append-only)',
  $q$truncate public.order_events$q$);
select tests.denied('audit log แก้ไขไม่ได้ (append-only)',
  $q$update public.audit_logs set action = 'DELETE'$q$);
select tests.denied('ราคาในคำสั่งซื้อแก้ไม่ได้หลังสร้าง (snapshot)',
  $q$update public.orders set unit_price_thb = 1, total_thb = 1, discount_amount_thb = 0
     where id = tests.id('order_a1')$q$);
select tests.denied('ข้ามขั้นตอนการชำระเงิน: ไม่สามารถเริ่มดำเนินการโดยไม่มีการยืนยันการชำระ',
  $q$update public.orders set order_status = 'processing' where id = tests.id('order_b2')$q$);
select tests.denied('ลำดับสถานะผิด: pending ไป activated โดยตรงไม่ได้',
  $q$update public.orders set order_status = 'activated' where id = tests.id('order_b2')$q$);
select tests.denied('เลขอ้างอิงที่ไม่ normalize ถูกปฏิเสธที่ระดับตาราง',
  $q$insert into public.payments (order_id, customer_id, method, amount_thb, reference_no)
     values (tests.id('order_b2'), 'a0000000-0000-4000-8000-0000000000b1', 'bank_transfer', 899, 'abc 123')$q$);
select tests.denied('เลขอ้างอิงที่ยังใช้งานอยู่ซ้ำไม่ได้ (ระดับฐานข้อมูล)',
  $q$insert into public.payments (order_id, customer_id, method, amount_thb, reference_no)
     values (tests.id('order_b2'), 'a0000000-0000-4000-8000-0000000000b1', 'bank_transfer', 599, 'ABC123456')$q$);
select tests.ok('เตรียมข้อมูล: แจ้งชำระของคำสั่งซื้อ B2 (สำหรับทดสอบสลิป)',
  $q$insert into public.payments (order_id, customer_id, method, amount_thb, reference_no)
     values (tests.id('order_b2'), 'a0000000-0000-4000-8000-0000000000b1', 'bank_transfer', 599, 'NEWREF0001')$q$);
select tests.denied('สลิป path ที่ไม่ขึ้นต้นด้วย customer_id ถูกปฏิเสธ',
  $q$insert into public.slips (payment_id, customer_id, storage_path, file_sha256, mime_type, size_bytes)
     values ((select id from public.payments where reference_no = 'NEWREF0001'), 'a0000000-0000-4000-8000-0000000000a1',
       'a0000000-0000-4000-8000-0000000000b1/55555555-5555-4555-8555-555555555555.jpg',
       repeat('9', 64), 'image/jpeg', 100)$q$);

select tests.expect_value('staff ไม่สามารถแก้ราคาแพ็กเกจได้ (ยังเป็น 599.00)',
  $q$select price_thb::text from public.packages where id = 'b0000000-0000-4000-8000-000000000001'$q$, '599.00');
select tests.expect_value('ลูกค้า A ไม่สามารถแก้โปรไฟล์ของ staff ได้',
  $q$select coalesce(full_name, 'NULL') from public.profiles where id = 'a0000000-0000-4000-8000-000000000002'$q$, 'NULL');

select tests.ok('ราคาแพ็กเกจเปลี่ยนได้ โดยไม่กระทบคำสั่งซื้อที่สร้างไปแล้ว',
  $q$update public.packages set price_thb = 999 where id = 'b0000000-0000-4000-8000-000000000001'$q$);
select tests.expect_value('หลังเปลี่ยนราคาแพ็กเกจ คำสั่งซื้อเดิมยังคงยอด 499.00',
  $q$select total_thb::text from public.orders where id = tests.id('order_a1')$q$, '499.00');

select tests.expect_count('ทุกตารางใน public เปิด RLS แล้ว',
  $q$select tablename from pg_tables where schemaname = 'public' and not rowsecurity$q$, 0);

select tests.expect_value('anon: ไม่มีสิทธิ์เขียนหรืออ่านคำสั่งซื้อโดยตรง',
  $q$select (has_table_privilege('anon', 'public.orders', 'SELECT')
     or has_table_privilege('anon', 'public.orders', 'INSERT')
     or has_table_privilege('anon', 'public.orders', 'UPDATE')
     or has_table_privilege('anon', 'public.orders', 'DELETE'))::text$q$, 'false');
select tests.expect_value('authenticated: เขียนตารางคำสั่งซื้อโดยตรงไม่ได้',
  $q$select (has_table_privilege('authenticated', 'public.orders', 'INSERT')
     or has_table_privilege('authenticated', 'public.orders', 'UPDATE')
     or has_table_privilege('authenticated', 'public.orders', 'DELETE'))::text$q$, 'false');
select tests.expect_value('authenticated: เขียนตารางการชำระเงินและสลิปโดยตรงไม่ได้',
  $q$select (has_table_privilege('authenticated', 'public.payments', 'INSERT')
     or has_table_privilege('authenticated', 'public.payments', 'UPDATE')
     or has_table_privilege('authenticated', 'public.slips', 'INSERT')
     or has_table_privilege('authenticated', 'public.slips', 'UPDATE'))::text$q$, 'false');
select tests.expect_value('authenticated: แก้ประวัติและ audit log โดยตรงไม่ได้',
  $q$select (has_table_privilege('authenticated', 'public.order_events', 'UPDATE')
     or has_table_privilege('authenticated', 'public.audit_logs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.notification_logs', 'INSERT'))::text$q$, 'false');
select tests.expect_value('anon: ไม่มีสิทธิ์รันฟังก์ชันธุรกิจ',
  $q$select (has_function_privilege('anon', 'public.create_order(uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.review_payment(uuid, text, text)', 'EXECUTE'))::text$q$, 'false');

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
    raise exception 'ชุดทดสอบไม่ผ่าน % จาก % รายการ', v_failed, v_total;
  end if;
  raise notice 'ผ่านทั้งหมด % รายการ', v_total;
end;
$$;

rollback;
