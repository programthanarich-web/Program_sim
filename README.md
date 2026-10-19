# ProgramThanarich

เว็บสำหรับเลือกแพ็กเกจอินเทอร์เน็ตในประเทศไทย ลูกค้ายืนยันเบอร์มือถือด้วย Supabase Phone OTP แล้วเลือกแพ็กเกจ ระบบสร้างคำสั่งซื้อ แสดงบัญชี/QR ให้โอน และรับสลิปเพื่อให้ทีมงานตรวจ ส่วนผู้ดูแลระบบ (admin) เข้าหน้า Dashboard เพื่อดูคำขอและจัดการแพ็กเกจ

> **สถานะโปรเจกต์:** ยังไม่ได้ทดสอบกับ Supabase จริง และยังไม่ได้เชื่อม **การชำระเงินจริงผ่าน provider**, **API สมัครแพ็กเกจของ True** และ **ผู้ให้บริการ SMS** ดูรายละเอียดในหัวข้อ [สิ่งที่ยังไม่ได้ทำ](#สิ่งที่ยังไม่ได้ทำ) และ [docs/PRE_REAL_MONEY_CHECKLIST.md](docs/PRE_REAL_MONEY_CHECKLIST.md) ก่อนรับเงินจริง

## เทคโนโลยีที่ใช้

- [Next.js 16](https://nextjs.org) (App Router) + React 19
- TypeScript (strict mode)
- Tailwind CSS v4
- [Supabase](https://supabase.com) (PostgreSQL + Auth) ผ่าน `@supabase/supabase-js` และ `@supabase/ssr`

## คุณสมบัติหลัก

| ส่วน | เส้นทาง | คำอธิบาย |
| --- | --- | --- |
| หน้าแรก | `/` | แนะนำบริการและขั้นตอนการใช้งาน |
| ยืนยันเบอร์ | `/verify-phone` | กรอกเบอร์มือถือไทย แล้วกรอกรหัส OTP 6 หลักที่ Supabase ส่ง |
| เลือกแพ็กเกจ | `/packages` | ต้องล็อกอินและยืนยันเบอร์ก่อน เลือกแพ็กเกจเพื่อสร้างคำสั่งซื้อ |
| คำสั่งซื้อของฉัน | `/orders` | ดูสถานะคำสั่งซื้อและการชำระเงินของตัวเอง |
| รายละเอียดคำสั่งซื้อ | `/orders/[id]` | ดูบัญชี/QR รับเงิน และส่งสลิปการโอน (ทำได้เมื่อยังรอชำระ) |
| เข้าสู่ระบบผู้ดูแล (หลังบ้าน) | `/admin/login` | ล็อกอินด้วยอีเมลและรหัสผ่านของ Supabase Auth |
| ภาพรวม (หลังบ้าน) | `/admin` | ตัวเลขสรุป และคำขอล่าสุดพร้อมเปลี่ยนสถานะ |
| จัดการแพ็กเกจ (หลังบ้าน) | `/admin/packages` | เพิ่มแพ็กเกจใหม่ เปิด/ปิดการขาย |

**ความปลอดภัย**

- ค่าลับ (service role key) อ่านได้เฉพาะฝั่ง server และมี `import "server-only"` กันไม่ให้ถูกนำเข้าโค้ด client
- รหัส OTP ออกและตรวจโดย Supabase Auth ระบบนี้ไม่เก็บรหัสเอง การจำกัดความถี่และจำนวนครั้งที่ใส่ผิดตั้งที่ Supabase Auth
- session ลูกค้าเป็น cookie ของ Supabase (`httpOnly`) และสิทธิ์ทุกอย่างผ่าน RLS กับ RPC ฝั่งฐานข้อมูล
- ตารางฐานข้อมูลเปิด Row Level Security และไม่มี policy สำหรับ anon/authenticated จึงเข้าถึงจาก browser ด้วย anon key ไม่ได้
- ทุก Server Action ของ admin ตรวจสิทธิ์ซ้ำฝั่ง server (`requireAdmin`) ไม่พึ่งการซ่อนปุ่มหรือหน้าอย่างเดียว

## โครงสร้างโปรเจกต์

โปรเจกต์แยกเป็น 2 แอปที่ deploy แยกกัน และมีแพ็กเกจที่ใช้ร่วม

```
program-thanarich/
├── apps/
│   ├── storefront/        # หน้าบ้านลูกค้า (Vercel project แยก)
│   │   └── src/
│   │       ├── app/       # /, /verify-phone, /packages, /orders, /orders/[id]
│   │       ├── components/customer/, site-header.tsx
│   │       ├── services/  # customer-auth.ts, customer-orders.ts
│   │       ├── lib/       # env.ts (เฉพาะค่าของ Supabase), labels, supabase clients
│   │       └── proxy.ts   # ตรวจ cookie ของหน้าที่ต้องล็อกอิน
│   └── backoffice/        # หลังบ้านและพนักงาน (Vercel project แยก โดเมนแยก)
│       └── src/
│           ├── app/admin/ # ภาพรวม คำสั่งซื้อ คิวสมัคร แพ็กเกจ ส่วนลด แจ้งเตือน ค่ารับเงิน
│           ├── app/api/   # /api/line/webhook, /api/notifications/dispatch
│           ├── app/actions/admin.ts
│           ├── services/  # admin.ts, admin-data.ts, payment-receiving.ts
│           └── lib/       # payments (adapter), notifications (LINE), supabase clients
├── packages/
│   └── shared/            # @pt/shared: เบอร์โทร ตรวจข้อมูล จัดรูปแบบ type ปุ่ม/ฟอร์ม
│                          # และการตรวจไฟล์สลิป (ไม่มีความลับและไม่มี service role)
├── supabase/              # migrations, RLS, RPC, storage และ test ฐานข้อมูล (ใช้ร่วม)
├── docs/                  # คู่มือ deploy และ checklist
└── package.json           # npm workspaces
```

### ขอบเขตระหว่างแอป

| จาก \ ไปยัง | storefront | backoffice | shared |
| --- | --- | --- | --- |
| **storefront** | — | ห้าม | ได้ |
| **backoffice** | ห้าม | — | ได้ |
| **shared** | ห้าม | ห้าม | — |

- ESLint ของ storefront มีกฎ `no-restricted-imports` ห้ามนำเข้าโค้ดหลังบ้าน (`@/services/admin*`, `@/components/admin/*` ฯลฯ) และทดสอบแล้วว่าการละเมิดถูกจับได้
- หน้าบ้านไม่มี LINE, ไม่มี `NOTIFY_DISPATCH_SECRET` และไม่มี route `/api/*` ของหลังบ้าน
- Cookie ของสองแอปแยกกันเพราะคนละโดเมน พนักงานไม่สามารถใช้ session ของหน้าบ้านเข้าหลังบ้านได้
- ข้อจำกัดที่ยังเหลือ: storefront ยังใช้ service role key สำหรับการอัปโหลดสลิป, บันทึกเบอร์ลงโปรไฟล์ และสร้างลิงก์ QR ฝั่ง server (ดูหัวข้อ "สิ่งที่ยังไม่ได้ทำ")

## ขั้นตอนการติดตั้ง

### 1. ความต้องการของระบบ

- Node.js 20 ขึ้นไป และ npm
- บัญชี [Supabase](https://supabase.com) และโปรเจกต์ทดสอบ (staging) สำหรับทดสอบ ก่อนใช้โปรเจกต์จริง

### 2. ติดตั้ง dependencies (ที่ root ครั้งเดียว)

```bash
npm install
```

### 3. สร้างโปรเจกต์ Supabase และตั้งค่าฐานข้อมูล

1. เข้า Supabase Dashboard แล้วสร้างโปรเจกต์ใหม่
2. ไปที่ **Project Settings > API** คัดลอกค่า **Project URL**, **anon public key** และ **service_role key** ไว้
3. ไปที่ **SQL Editor** รันไฟล์ใน `supabase/migrations/` **ตามลำดับชื่อไฟล์** ทีละไฟล์ (รันครั้งเดียว)
   - `20261019100000_core_schema.sql` ตารางหลัก, enum, trigger และ audit log
   - `20261019100100_rls_and_grants.sql` RLS และสิทธิ์ของแต่ละบทบาท
   - `20261019100200_business_rpc.sql` ฟังก์ชันทางธุรกิจ (สั่งซื้อ แจ้งชำระ ตรวจสลิป)
   - `20261019100300_payment_adapter.sql` คอลัมน์ผู้ให้บริการและตารางกัน webhook ซ้ำ
   - `20261019100400_admin_operations.sql` ผลการสมัคร, outbox การแจ้งเตือน, กฎการปิดงาน และ RPC ของผู้ดูแล
   - `20261019100500_payment_receiving.sql` RPC บันทึกบัญชีและ QR รับเงิน
4. รัน `supabase/storage/payment-slips-bucket.sql` และ `supabase/storage/payment-qr-bucket.sql` เพื่อสร้าง bucket แบบ private (ยังไม่ได้ทดสอบกับโปรเจกต์จริง ตรวจผลใน Dashboard)
5. เปิด **Phone OTP** ของลูกค้า: ไปที่ **Authentication > Providers > Phone** เปิดใช้งาน แล้วตั้ง SMS provider ที่ต้องการ (ยังไม่ได้เลือกผู้ให้บริการ) ระบบจะเรียก `signInWithOtp` และ `verifyOtp` ของ Supabase
6. สร้างบัญชีผู้ดูแลระบบ:
   - ไปที่ **Authentication > Users > Add user > Create new user** กรอกอีเมลและรหัสผ่าน
   - จากนั้นรัน SQL ต่อไปนี้ (เปลี่ยนอีเมลให้ตรง) เพื่อกำหนดบทบาท `admin` หรือ `staff`

   ```sql
   update public.profiles
   set role = admin
   where id = (select id from auth.users where email = admin@example.com);
   ```

### 4. ตั้งค่าตัวแปรสภาพแวดล้อม

แต่ละแอปมีไฟล์ตัวอย่างของตัวเอง คัดลอกแล้วกรอกค่าจริง:

```bash
cp apps/storefront/.env.example apps/storefront/.env.local
cp apps/backoffice/.env.example apps/backoffice/.env.local
```

| แอป | ตัวแปร | หมายเหตุ |
| --- | --- | --- |
| ทั้งสอง | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | ใช้ฝั่ง server |
| ทั้งสอง | `SUPABASE_SERVICE_ROLE_KEY` | **ห้ามเปิดเผย** ห้ามใส่ prefix `NEXT_PUBLIC_` |
| หลังบ้าน | `APP_BASE_URL` | URL ของหลังบ้าน ใช้สร้างลิงก์ในข้อความ LINE |
| หลังบ้าน | `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `LINE_GROUP_ID` | **ความลับ** (ยกเว้น `LINE_GROUP_ID`) ถ้าไม่ตั้งค่า ระบบทำงานโหมดทดสอบ |
| หลังบ้าน | `NOTIFY_DISPATCH_SECRET` | **ความลับ** ใช้กับตัวตั้งเวลาที่เรียก `/api/notifications/dispatch` |

> ไฟล์ `.env.local` อยู่ใน `.gitignore` แล้ว อย่า commit ไฟล์นี้ขึ้น repository

### 5. รันในโหมดพัฒนา

```bash
npm run dev:storefront   # หน้าบ้าน  http://localhost:3000
npm run dev:backoffice   # หลังบ้าน   http://localhost:3001/admin
```

**ทดสอบการยืนยันเบอร์:** ใช้ Phone OTP ของ Supabase ในโปรเจกต์ทดสอบ (staging) จริง ระบบไม่มีโหมดจำลอง SMS ดังนั้นต้องตั้ง SMS provider หรือใช้เบอร์ทดสอบที่ Supabase กำหนดให้

### 6. build และรันโหมด production

```bash
npm run build                                # build ทั้งสองแอป
npm run start -w @pt/storefront              # พอร์ต 3000
npm run start -w @pt/backoffice              # พอร์ต 3001
```

### คำสั่งอื่นที่เกี่ยวข้อง

```bash
npm run lint         # ESLint ทุกแอป
npm run typecheck    # TypeScript ทุกแอปและแพ็กเกจ
```

## ทดสอบ

```bash
npm run test:unit                                  # shared (เบอร์, สลิป) และหลังบ้าน (payment adapter, LINE) ไม่ต้องใช้ฐานข้อมูล
PSQL="psql -h localhost -U postgres" npm run test:db   # migration และสิทธิ์ RLS บน PostgreSQL 16
```

## ลำดับการทดสอบด้วยตนเอง

1. เปิด `/` แล้วกดปุ่มยืนยันเบอร์ ระบบจะพาไป `/verify-phone`
2. กรอกเบอร์มือถือ เช่น `081-234-5678` แล้วดูรหัสใน terminal
3. กรอกรหัส 6 หลัก เมื่อสำเร็จจะถูกพาไป `/packages`
4. กดเลือกแพ็กเกจ ระบบบันทึกคำขอให้เห็นข้อความยืนยัน
5. เปิดหลังบ้านที่ `/admin/login` แล้วล็อกอินด้วยบัญชีที่มีบทบาท staff หรือ admin
6. หน้าหลังบ้าน:
   - **ภาพรวม**: จำนวนรอตรวจสลิป งานรอสมัคร รอยืนยันผล และแจ้งเตือนที่ล้มเหลว
   - **คำสั่งซื้อ**: ค้นหาด้วยเลขคำสั่งซื้อ เปิดดูสลิป ยืนยันหรือปฏิเสธการรับเงิน ยกเลิกคำสั่งซื้อ
   - **คิวสมัคร**: งานที่ชำระแล้ว บันทึกผลการสมัคร และผู้ดูแลยืนยันผลสำเร็จ
   - **แพ็กเกจ / ส่วนลด**: เฉพาะ admin แก้ไขได้ พนักงานดูได้อย่างเดียว
   - **การแจ้งเตือน**: ดูสถานะการส่ง ส่งซ้ำรายการที่ล้มเหลว (admin)

## สิ่งที่ยังไม่ได้ทำ

| รายการ | สถานะ | จุดที่ต้องแก้ |
| --- | --- | --- |
| SMS OTP | ใช้ Supabase Phone Auth ยังไม่ได้เลือกและทดสอบ SMS provider | Dashboard ของ Supabase |
| การตรวจสลิปและยืนยันรับเงิน | ทำด้วยคนผ่านหลังบ้าน (manual review) ยังไม่มี provider webhook | `apps/backoffice/src/lib/payments/` |
| จำกัดความถี่ (rate limit) ของ API และ Server Action | ยังไม่มี ควรทำที่ edge/WAF หรือตาราง counter | ดู `docs/PRE_REAL_MONEY_CHECKLIST.md` |
| การชำระเงินผ่าน provider | ยังไม่เชื่อม (ดู `apps/backoffice/src/lib/payments/README.md`) | `apps/backoffice/src/lib/payments/` |
| API สมัครแพ็กเกจของ True | ยังไม่เชื่อม คำขอถูกบันทึกไว้ให้ทีมงานดำเนินการเอง | ใช้ผลใน `signup_results` |
| การส่ง LINE จริง | ต้องตั้ง credentials ตามขั้นตอนด้านล่าง ก่อนนั้นทำงานโหมดทดสอบ | `apps/backoffice/src/lib/notifications/` |

## LINE Messaging API และการแจ้งเตือน

ระบบส่งข้อความเข้ากลุ่ม LINE เมื่อ **รับชำระเงินแล้ว** และเมื่อ **มีงานรอสมัคร** ข้อความมีเพียงเลขคำสั่งซื้อ ชื่อแพ็กเกจ ยอด และลิงก์หลังบ้าน ไม่มีเบอร์ ชื่อ หรือสลิป

### ขั้นตอนตั้งค่าใน LINE Developers

1. เข้า [LINE Developers Console](https://developers.line.biz/console/) สร้าง **Provider** และ **Channel** ประเภท **Messaging API**
2. ในแท็บ **Messaging API** ออก **Channel access token (long-lived)** คัดลอกไปใส่ `LINE_CHANNEL_ACCESS_TOKEN`
3. ในแท็บ **Basic settings** คัดลอก **Channel secret** ไปใส่ `LINE_CHANNEL_SECRET`
4. ในแท็บ **Messaging API** ตั้ง **Webhook URL** เป็น `https://<โดเมนของคุณ>/api/line/webhook` แล้วกด **Verify** และเปิด **Use webhook**
5. ปิด **Auto-reply messages** ถ้าไม่ต้องการให้บอทตอบอัตโนมัติ
6. เชิญบอทเข้ากลุ่มผู้ดูแล ระบบจะบันทึก `groupId` ลง log ของ server ตอนบอทเข้าร่วม (เฉพาะโหมดที่ไม่ใช่ production) นำค่านั้นไปใส่ `LINE_GROUP_ID`
7. ตั้งตัวตั้งเวลาภายนอก (เช่น cron ของโฮสต์) ให้เรียก `POST https://<โดเมน>/api/notifications/dispatch` ทุก 1 นาที โดยส่ง header `Authorization: Bearer <NOTIFY_DISPATCH_SECRET>` ผู้ดูแลกด "ส่งรายการที่ค้างตอนนี้" ได้ในหน้าการแจ้งเตือนด้วย

### พฤติกรรมของระบบ

- **ไม่มี credentials**: ใช้ mock notifier (โหมดทดสอบ) ไม่มีการส่งเข้า LINE จริง และหน้าการแจ้งเตือนแสดงสถานะนี้ ใน production ระบบจะไม่ทำเครื่องหมายว่าส่งแล้วเมื่อไม่มี credentials
- **ส่งซ้ำอย่างปลอดภัย**: ทุกรายการมี `X-Line-Retry-Key` (UUID) ที่คงเดิมตลอดการลองใหม่ ตามเอกสาร LINE คำขอที่ซ้ำกับคำขอที่รับไปแล้วจะได้ 409 ซึ่งระบบถือว่าสำเร็จ
- **ลองใหม่**: 5xx, timeout และ 429 จะลองใหม่ตามช่วงเวลา 1 นาที 5 นาที 15 นาที และ 1 ชั่วโมง สูงสุด 5 ครั้ง 4xx อื่นไม่ลองใหม่
- **การยืนยันผลสมัคร**: คำสั่งซื้อจะถูกปิดเป็น `activated` ได้ก็ต่อเมื่อผู้ดูแลระบบ (คนละคนกับผู้บันทึก) ยืนยันผลสำเร็จ ฐานข้อมูลบังคับกฎนี้ไว้แม้เรียกผ่าน API โดยตรง

### สิ่งที่ยังต้องตรวจในคอนโซลก่อนใช้งานจริง

ผู้เขียนดึงเอกสาร LINE ได้บางส่วนเท่านั้น จึงยังไม่ได้ยืนยันทุกรายละเอียดจากเอกสาร:
- ยืนยันแล้ว: path `POST /v2/bot/message/push` การใช้ `X-Line-Retry-Key` (UUID อายุ 24 ชั่วโมง, 409 เมื่อซ้ำ) และลายเซ็น webhook เป็น `x-line-signature` (HMAC-SHA256 แบบ base64 ของ body ดิบ ด้วย channel secret)
- **ยังไม่ยืนยัน**: โฮสต์ `https://api.line.me` (อยู่ใน `apps/backoffice/src/lib/notifications/line-notifier.ts` ตรวจใน LINE Developers ก่อน) รูปแบบ body ของ text message และความปลอดภัยของการลองใหม่กับ 429 (เอกสารที่ดึงได้ระบุชัดเฉพาะ 500 และ timeout)
- ควรส่งข้อความทดสอบหนึ่งครั้งเข้ากลุ่มจริงก่อนเปิดใช้งาน

### วิธีเปิด Phone OTP

ใน Supabase Dashboard ไปที่ **Authentication > Providers > Phone** เปิดใช้งาน เลือก SMS provider แล้วกรอก credentials ของผู้ให้บริการที่ Dashboard ของ Supabase ขอ (เก็บไว้ใน Supabase ไม่อยู่ในโค้ดของโปรเจกต์) เลือกการจำกัดความถี่การส่ง SMS ใน Authentication settings ด้วย

## ปรับแต่งฟอนต์ (ไม่บังคับ)

โปรเจกต์ใช้ system font stack สำหรับภาษาไทย เพื่อให้ build ไม่ต้องดาวน์โหลดฟอนต์จากภายนอก หากต้องการใช้ Noto Sans Thai เฉพาะสามารถเพิ่มได้ใน `layout.tsx` ของแอปที่ต้องการ (`apps/*/src/app/layout.tsx`):

```tsx
import { Noto_Sans_Thai } from "next/font/google";

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-sans-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
// แล้วใส่ className `${notoSansThai.variable}` ที่ <html>
// และแก้ --font-sans ใน globals.css ให้เริ่มด้วย var(--font-noto-sans-thai)
```

## หมายเหตุการพัฒนา

- ไฟล์ `proxy.ts` ของแต่ละแอปตรวจ cookie แบบเบื้องต้นเพื่อ redirect ให้เร็ว การตรวจสิทธิ์จริงทำซ้ำในฝั่ง server ทุกครั้ง
- Cache Components เปิดอยู่ (`cacheComponents: true` ใน `next.config.ts`) ข้อมูลที่ต้องดึงตอนรันจริงจะใช้ `connection()` หรืออยู่ใน `<Suspense>`
- ข้อมูลเบอร์โทรศัพท์เป็นข้อมูลส่วนบุคคล ควรพิจารณานโยบาย PDPA และระยะเวลาเก็บข้อมูลก่อนใช้งานจริง
