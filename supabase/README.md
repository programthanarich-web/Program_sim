# ฐานข้อมูล ProgramThanarich (Supabase / PostgreSQL)

เอกสารนี้อธิบายการออกแบบฐานข้อมูล สิทธิ์การเข้าถึง และวิธีรันชุดทดสอบ

## โครงสร้างไฟล์

```
supabase/
├── migrations/
│   ├── 20261019100000_core_schema.sql    # enum, ตาราง, trigger ฝั่งข้อมูล, audit, append-only
│   ├── 20261019100100_rls_and_grants.sql # RLS policy และ grant
│   └── 20261019100200_business_rpc.sql   # ฟังก์ชันธุรกิจ (RPC) ที่เป็นทางเดียวในการเขียนข้อมูล
└── tests/
    ├── run.sh                            # สร้าง DB ทดสอบใหม่ รัน migration แล้วรันชุดทดสอบ
    ├── permissions.test.sql              # 124 รายการ: สิทธิ์ทุกบทบาท + ความสมบูรณ์ของข้อมูล
    └── support/
        ├── 00_local_supabase_stub.sql    # จำลอง roles และ auth.uid() สำหรับทดสอบ local เท่านั้น
        └── 01_harness.sql                # helper สำหรับทดสอบ (as_user, denied, hidden ฯลฯ)
```

## ตารางและความสัมพันธ์

| ตาราง | PK | ความหมาย |
| --- | --- | --- |
| `profiles` | UUID (= `auth.users.id`) | ข้อมูลผู้ใช้และบทบาท (`customer`, `staff`, `admin`) |
| `packages` | UUID | แคตตาล็อกแพ็กเกจปัจจุบัน |
| `discount_codes` | UUID | รหัสส่วนลด (แบบ fixed หรือ percent, จำนวนครั้ง, ช่วงเวลา) |
| `orders` | UUID | คำสั่งซื้อ พร้อม **snapshot ราคาและส่วนลด** ณ เวลาสั่งซื้อ |
| `payments` | UUID | การแจ้งชำระเงินหนึ่งครั้ง มีสถานะการชำระของตัวเอง |
| `slips` | UUID | ข้อมูลไฟล์สลิป (path ใน Storage, sha256, ประเภท, ขนาด) 1 ต่อ 1 กับ payment |
| `order_events` | UUID | timeline ของคำสั่งซื้อ (append-only) |
| `audit_logs` | UUID | ประวัติการแก้ไข profile, แพ็กเกจ, ส่วนลด, การตั้งค่า (append-only) |
| `notification_logs` | UUID | บันทึกการส่งการแจ้งเตือน (เขียนโดย server เท่านั้น) |
| `settings` | key (text) | ค่าตั้งระบบ `is_public` เปิดให้ลูกค้าอ่านได้ผ่าน RPC เท่านั้น |

Foreign key สำคัญ: `orders.customer_id` และ `orders.package_id` (ON DELETE RESTRICT), `payments.order_id`, `slips.payment_id` (UNIQUE), `order_events.order_id`

## การแยกสถานะ

มีสถานะสามชุดที่ไม่ปนกัน:

- **`orders.order_status`** สถานะการสมัครแพ็กเกจ: `pending` → `processing` → `activated`, หรือ `cancelled`
  - `pending` → `processing` ทำได้ก็ต่อเมื่อมี payment ที่ `verified` แล้ว
  - `processing` → `cancelled` ทำได้เฉพาะ admin
  - สถานะ `activated` และ `cancelled` เป็นสถานะสิ้นสุด
- **`payments.status`** สถานะการชำระเงิน: `pending_review` → `verified` → `refunded`, หรือ `pending_review` → `rejected`
- **`slips.status`** สถานะการตรวจสลิป: `pending_review` → `approved` หรือ `rejected`

การเปลี่ยนสถานะทุกชุดถูกตรวจด้วย trigger ในฐานข้อมูล จึงใช้กับ service role ได้เช่นกัน

## ราคาและส่วนลดแบบ snapshot

- `create_order()` อ่านราคาจากตาราง `packages` ในฐานข้อมูล client ส่งได้เพียง `package_id` และรหัสส่วนลด
- คำสั่งซื้อเก็บ `unit_price_thb`, ชื่อและข้อมูลแพ็กเกจ, `discount_*_snapshot`, `discount_amount_thb`, `total_thb`
- trigger `orders_lock_snapshot` ไม่ให้แก้ค่าเหล่านี้หลังสร้าง แม้แต่ service role
- ทดสอบแล้วว่าการเปลี่ยนราคาแพ็กเกจไม่กระทบคำสั่งซื้อที่สร้างไปแล้ว

## ป้องกันเลขอ้างอิงและสลิปซ้ำ

- เลขอ้างอิงถูก normalize (พิมพ์ใหญ่ ตัดช่องว่างและขีด) ก่อนบันทึก และมี check constraint `^[A-Z0-9]{6,40}$`
- Partial unique index `payments_reference_active_uidx` บังคับว่าเลขอ้างอิงใช้ได้ครั้งเดียว (ยกเว้นรายการที่ `rejected`)
- `payments_one_open_per_order_uidx` ให้มีการแจ้งชำระที่ยังเปิดอยู่ได้ทีละรายการต่อคำสั่งซื้อ
- `slips_file_sha256_active_uidx` ป้องกันไฟล์เดิมถูกใช้ซ้ำ (ยกเว้นที่ถูกปฏิเสธ)
- trigger `slips_check_owner` บังคับว่าสลิปต้องเป็นของเจ้าของการชำระเงิน และ check constraint บังคับให้ path ขึ้นต้นด้วย `<customer_id>/`

## Audit log

- `order_events` และ `audit_logs` แก้ไขหรือลบไม่ได้ แม้แต่เจ้าของตาราง (trigger `forbid_mutation` ทั้ง UPDATE, DELETE และ TRUNCATE)
- `order_events` เขียนอัตโนมัติจาก trigger เมื่อคำสั่งซื้อ การชำระเงิน หรือสลิปเปลี่ยน เก็บ actor, from/to, และเหตุผลที่ RPC ส่งมา
- `audit_logs` เก็บ old/new data ของ profile, แพ็กเกจ, ส่วนลด และการตั้งค่า
- ข้อควรระวัง: `audit_logs` เก็บเบอร์โทรใน `profiles` ซึ่งเป็นข้อมูลส่วนบุคคล เข้าถึงได้เฉพาะ admin

## RLS และการเข้าถึง

ทุกตารางใน `public` เปิด RLS (ทดสอบแล้ว) และไม่มี policy เขียนสำหรับ `authenticated` ในตาราง orders, payments, slips

| ตาราง | anon | customer | staff | admin |
| --- | --- | --- | --- | --- |
| `packages` | อ่าน (เฉพาะเปิดขาย) | อ่าน (เฉพาะเปิดขาย) | อ่านทั้งหมด | จัดการ |
| `profiles` | - | อ่านและแก้ชื่อของตัวเอง | อ่านทั้งหมด | จัดการ (รวมบทบาท) |
| `discount_codes` | - | - (ใช้ผ่าน `create_order`) | อ่าน | จัดการ |
| `orders` | - | อ่านของตัวเอง | อ่านทั้งหมด | อ่านทั้งหมด |
| `payments` | - | - | อ่าน | อ่าน, คืนเงิน (RPC) |
| `slips` | - | - | อ่าน | อ่าน |
| `order_events` | - | - | อ่าน | อ่าน |
| `notification_logs` | - | - | อ่าน | อ่าน |
| `audit_logs` | - | - | - | อ่าน |
| `settings` | - | ค่า public ผ่าน `get_public_settings()` | อ่าน | จัดการ |

การเขียนข้อมูลทางธุรกิจทั้งหมดทำผ่าน RPC ที่ตรวจบทบาทภายในฟังก์ชัน:

| ฟังก์ชัน | ใครเรียกได้ | หน้าที่ |
| --- | --- | --- |
| `create_order` | customer | สร้างคำสั่งซื้อพร้อม snapshot, ตรวจส่วนลด, จำกัด 3 คำสั่งซื้อที่รอ |
| `cancel_my_order` | customer | ยกเลิกคำสั่งซื้อที่รอ และปิดการแจ้งชำระที่ค้างอยู่ |
| `submit_payment` | customer | แจ้งชำระ + สลิป (ตรวจยอด, เลขอ้างอิง, ไฟล์ซ้ำ) |
| `review_payment` | staff, admin | อนุมัติหรือปฏิเสธการชำระ (ปฏิเสธต้องมีเหตุผล) |
| `transition_order_status` | staff, admin | เปลี่ยนสถานะคำสั่งซื้อ (ยกเลิกระหว่างดำเนินการ: admin) |
| `refund_payment` | admin | คืนเงินการชำระที่ยืนยันแล้ว (ต้องมีเหตุผล) |
| `my_orders` | customer | สรุปคำสั่งซื้อของตัวเองพร้อมสถานะการชำระล่าสุด |
| `get_public_settings` | authenticated | ค่าที่ตั้งเป็น public เท่านั้น |

ฟังก์ชัน `release_open_payments` ไม่ได้เปิดให้เรียกจาก API

## Storage สำหรับสลิป (ยังไม่ได้รวมในไฟล์ migration)

ควรสร้าง bucket แบบ private ชื่อ `payment-slips` และกำหนด policy ดังนี้ (ต้องทำใน Supabase เอง):
- `authenticated` อัปโหลดได้เฉพาะ path ที่ขึ้นต้นด้วย `auth.uid()/`
- ไม่มี policy อ่านสำหรับลูกค้า; staff อ่านผ่าน signed URL ที่ server ออกให้

ค่า `file_sha256` ที่ลูกค้าส่งมายังไม่ได้ตรวจกับไฟล์จริงในฐานข้อมูล ควรตรวจในขั้นตอนอัปโหลดฝั่ง server (เช่น Edge Function) ก่อนเรียก `submit_payment`

## การรันชุดทดสอบ

ทดสอบแล้วกับ PostgreSQL 16 (สคริปต์ใช้เฉพาะคุณสมบัติมาตรฐาน จึงควรรันได้กับเวอร์ชันใกล้เคียง)

```bash
PSQL="psql -h localhost -U postgres" ./supabase/tests/run.sh
```

สคริปต์จะสร้างฐานข้อมูล `thanarich_test` ใหม่ทุกครั้ง โหลด stub, รัน migration ตามลำดับชื่อไฟล์, แล้วรัน `permissions.test.sql` ซึ่งทำงานใน transaction และ ROLLBACK เมื่อจบ ถ้ามีรายการไม่ผ่านสคริปต์จะจบด้วย exit code ที่ไม่ใช่ 0

ชุดทดสอบครอบคลุม:
- anon, ลูกค้า A และ B (แยกข้อมูลระหว่างลูกค้า), staff, admin, service_role
- snapshot ราคาและส่วนลด (fixed และ percent, จำนวนครั้ง, วันหมดอายุ)
- การป้องกันเลขอ้างอิงซ้ำ, สลิปซ้ำ, สลิปข้ามเจ้าของ และ path ของคนอื่น
- การเปลี่ยนสถานะที่ไม่ถูกต้อง และการยกเลิกที่ปิดการชำระค้างอยู่
- append-only ของ `order_events` และ `audit_logs`
- สิทธิ์ตารางของ anon และ authenticated (has_table_privilege)

ได้ตรวจความไวของชุดทดสอบด้วย mutation test แล้ว: จงใจเปิดการอ่าน orders ให้ anon, ปิด trigger append-only, หรือเปิดการอ่านสลิปให้ลูกค้าทั้งหมด ทุกกรณีทำให้ชุดทดสอบไม่ผ่าน

## ข้อจำกัดที่ทราบ

- `tests/support/00_local_supabase_stub.sql` ใช้ทดสอบบน PostgreSQL ทั่วไปเท่านั้น ห้ามรันบน Supabase จริง
- ยังไม่ได้ทดสอบบน Supabase จริง (การ migrate บน `auth.users` และ Storage) ควรรันบน project ทดสอบก่อนใช้งานจริง
- `supabase/schema.sql` เดิมถูกลบแล้ว ส่วนลูกค้าใช้ Supabase Phone OTP, `create_order` และ `submit_payment` แล้ว ตารางเดิม (`internet_packages`, `phone_verifications`, `package_requests`) ไม่ถูกใช้โดยโค้ดอีกต่อไป

## Admin operations (`20261019100400_admin_operations.sql`)

- `signup_results`: ผลการสมัคร พนักงานบันทึก (`record_signup_result`) ผู้ดูแลระบบคนละคนยืนยัน (`confirm_signup_result`) ผลที่ยืนยันแล้วแก้ไขหรือลบไม่ได้
- `activated` ต้องมีผลสำเร็จที่ยืนยันแล้ว ตรวจในฐานข้อมูล (trigger `validate_order_transition`) ไม่ใช่แค่ใน UI
- `notification_logs` ทำหน้าที่เป็น outbox: `dedupe_key` กันการสร้างซ้ำ, `retry_key` ส่งให้ LINE, `payload` ห้ามมีข้อมูลส่วนบุคคล (มี CHECK)
- ฟังก์ชัน worker `claim_notifications` / `complete_notification` เรียกได้เฉพาะ `service_role`
- RPC ของผู้ดูแล (`admin_save_package`, `admin_save_discount`, `admin_retry_notification`) ตรวจสิทธิ์ภายในฟังก์ชัน

ทดสอบด้วย `supabase/tests/admin_operations.test.sql` (44 รายการ) ซึ่งรันต่อท้าย `permissions.test.sql` ใน `run.sh`
