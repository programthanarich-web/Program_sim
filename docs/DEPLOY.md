# คู่มือ Deploy: Supabase และ Vercel

> เอกสารนี้เขียนจากโค้ดในโปรเจกต์ ยังไม่ได้ทดสอบกับ Supabase จริงหรือ Vercel จริง ทุกขั้นตอนต้องทำซ้ำในโปรเจกต์ staging ก่อน
> ก่อนรับเงินจริงให้ดู `docs/PRE_REAL_MONEY_CHECKLIST.md` ให้ครบ

## 1. สร้างโปรเจกต์ Supabase

1. สร้างโปรเจกต์ใหม่ (แยก staging และ production)
2. เก็บค่าจาก Project Settings > API: Project URL, anon key, service_role key
3. **service_role key ใช้ฝั่ง server เท่านั้น** ห้ามใส่ใน `NEXT_PUBLIC_*` และห้ามส่งไปยัง browser

## 2. รัน migration ตามลำดับชื่อไฟล์

รันใน SQL Editor หรือด้วย Supabase CLI ตามลำดับนี้ (ทุกไฟล์อยู่ใน `supabase/migrations/`):

1. `20261019100000_core_schema.sql`
2. `20261019100100_rls_and_grants.sql`
3. `20261019100200_business_rpc.sql`
4. `20261019100300_payment_adapter.sql`
5. `20261019100400_admin_operations.sql`
6. `20261019100500_payment_receiving.sql`

จากนั้นรัน `supabase/storage/payment-slips-bucket.sql` และ `supabase/storage/payment-qr-bucket.sql` (สร้าง private bucket)

หมายเหตุ: ไม่มี `schema.sql` แล้ว ทุกตารางมาจาก migrations ชุดนี้ ถ้าโปรเจกต์ทดสอบเคยรัน `schema.sql` เดิม ให้สร้างโปรเจกต์ใหม่แทนการรันทับ

## 3. ตั้งผู้ดูแลระบบ

สร้างผู้ใช้ใน Authentication > Users (อีเมล + รหัสผ่านแข็งแรง) แล้วตั้งสิทธิ์:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'admin@example.com');
```

- ปิด public sign-up ใน Authentication settings เพื่อไม่ให้ผู้ใช้ทั่วไปสร้างบัญชีเองจากหน้าอื่น
- เปิดการยืนยันอีเมลและ MFA ถ้าแผนของโปรเจกต์รองรับ (ยังไม่ได้ทดสอบ)

## 3b. เปิด Phone OTP สำหรับลูกค้า

- Authentication > Providers > **Phone**: เปิดใช้งาน แล้วตั้ง SMS provider พร้อม credentials ของผู้ให้บริการที่เลือก (ยังไม่ได้เลือกและทดสอบ)
- Authentication settings: ตั้งการจำกัดความถี่การส่ง SMS และจำนวนครั้งที่ตรวจรหัสได้ตามนโยบาย
- ทดสอบด้วยเบอร์ทดสอบใน staging ก่อนใช้เบอร์จริง

## 4. ตั้งค่า Storage และ RLS

- ตรวจว่า bucket `payment-slips` และ `payment-qr` เป็น **private** (ไม่ได้ติ๊ก Public)
- ตรวจว่าทุกตารางใน public schema เปิด RLS: `select tablename, rowsecurity from pg_tables where schemaname='public';`
- ไม่มี policy หรือ grant สำหรับ `anon` บนตารางที่มีข้อมูลลูกค้า (ตรวจด้วย `supabase/tests/run.sh` บนฐานทดสอบก่อน)

## 5. ตั้งค่า Vercel (สองโปรเจกต์)

สร้าง **Vercel project สองโปรเจกต์** จาก repository เดียวกัน:

| โปรเจกต์ | Root Directory | โดเมนตัวอย่าง | ใครเข้าได้ |
| --- | --- | --- | --- |
| หน้าบ้าน | `apps/storefront` | `shop.example.com` | ลูกค้าทุกคน |
| หลังบ้าน | `apps/backoffice` | `admin.example.com` | พนักงานที่มีบัญชีเท่านั้น |

ตั้ง Root Directory ที่ Project Settings > General และให้ Vercel ติดตั้ง dependencies จาก root ของ workspace (npm workspaces) เมื่อ build ไม่ผ่าน ตรวจว่าคำสั่ง install ทำงานที่ root

### ตัวแปรของหน้าบ้าน (`shop`)

| ตัวแปร | ชนิด |
| --- | --- |
| `SUPABASE_URL` | ปกติ |
| `SUPABASE_ANON_KEY` | ปกติ |
| `SUPABASE_SERVICE_ROLE_KEY` | **ลับ** ใช้เฉพาะ server (อัปโหลดสลิป บันทึกเบอร์ สร้างลิงก์ QR) |

### ตัวแปรของหลังบ้าน (`admin`)

| ตัวแปร | ชนิด | หมายเหตุ |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | ปกติ | |
| `SUPABASE_SERVICE_ROLE_KEY` | **ลับ** | |
| `APP_BASE_URL` | ปกติ | URL ของหลังบ้าน เช่น `https://admin.example.com` ใช้สร้างลิงก์ในข้อความ LINE |
| `LINE_CHANNEL_ACCESS_TOKEN` | **ลับ** | ดูขั้นตอนใน README |
| `LINE_CHANNEL_SECRET` | **ลับ** | ใช้ตรวจลายเซ็น webhook |
| `LINE_GROUP_ID` | ปกติ | groupId ของกลุ่มที่บอทอยู่ |
| `NOTIFY_DISPATCH_SECRET` | **ลับ** | Bearer ของตัวตั้งเวลา (ดูข้อ 6) |

ห้ามตั้งค่า LINE หรือ `NOTIFY_DISPATCH_SECRET` ในโปรเจกต์หน้าบ้าน ถ้าพบค่าเหล่านี้ใน storefront ให้ลบออก

Vercel ตั้ง `NODE_ENV=production` ให้เอง ทำให้ notifier จะไม่ทำงานแบบจำลองและจะ fail closed หากยังไม่ตั้งค่า LINE จริง

## 6. ตั้ง scheduler สำหรับการแจ้งเตือน

ไม่มี cron ในโปรเจกต์ ต้องตั้งภายนอกที่โดเมนหลังบ้านเท่านั้น:

```
POST https://admin.example.com/api/notifications/dispatch
Authorization: Bearer <NOTIFY_DISPATCH_SECRET>
```

แนะนำความถี่ทุก 1–5 นาที ระบบมี lease 3 นาทีและ backoff 60/300/900/3600 วินาที จึงเรียกซ้ำได้โดยไม่ส่งซ้ำ

## 7. ตั้ง LINE webhook (ถ้าใช้ LINE)

- Webhook URL: `https://admin.example.com/api/line/webhook` (โดเมนหลังบ้าน ไม่ใช่หน้าบ้าน)
- เปิด Use webhook ใน LINE Developers และกด Verify
- ระบบตรวจลายเซ็น `x-line-signature` ด้วย `LINE_CHANNEL_SECRET` ก่อนทำงาน ถ้าไม่ผ่านจะตอบ 401

## 8. ตรวจหลัง deploy

- หน้าบ้าน `https://shop.example.com/packages` ต้อง redirect ไป `/verify-phone` เมื่อยังไม่ล็อกอิน
- หน้าบ้าน `https://shop.example.com/admin` ต้องได้ 404 (หลังบ้านไม่มีในแอปนี้)
- หลังบ้าน `https://admin.example.com/admin/orders` โดยไม่ล็อกอิน ต้อง redirect ไป `/admin/login`
- `POST https://admin.example.com/api/notifications/dispatch` โดยไม่มี Bearer ต้องได้ 401
- ตรวจ response header ของทั้งสองโดเมน: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` ต้องมี
- ตรวจว่า HSTS ถูกตั้งโดย Vercel (ยังไม่ได้ตั้งเองในโค้ด)

## 9. สิ่งที่ยังไม่ได้ทำ

- ยังไม่มี payment webhook route สำหรับ provider จริง (ดู `apps/backoffice/apps/backoffice/src/lib/payments/README.md`)
- ยังไม่มี rate limit ที่ระดับ IP ใน API และ Server Action (ดู checklist)
- ยังไม่มีผู้ให้บริการ SMS สำหรับ OTP ใน production (ระบบจะ throw เมื่อไม่ได้ตั้งค่า)
