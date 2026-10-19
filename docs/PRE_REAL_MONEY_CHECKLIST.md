# Checklist ก่อนรับเงินจริง

**สถานะรวม: ยังไม่พร้อมรับเงินจริง** รายการด้านล่างที่ยังไม่ผ่านต้องแก้ก่อนเปิดรับเงิน

## A. ผลการทดสอบที่รันจริงในรอบนี้

| รายการ | วิธี | ผล |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | ผ่าน |
| Lint | `npx eslint .` | ผ่าน (exit 0) |
| Unit tests | `npm run test:unit` | ผ่าน 45/45 (payment service, slip file, notifications, LINE retry/409/429/5xx/timeout) |
| Build | `npm run build` (ค่า env จำลอง) | ผ่าน |
| Database tests | `supabase/tests/run.sh` บน PostgreSQL 16 | ผ่าน permissions 126, admin operations 44, payment receiving 13 (รอบก่อนหน้า) |
| Route และ auth แบบ production | `next start` + curl | `/packages` → 307 `/verify-phone`; `/admin/*` ไม่มี cookie → 307 `/admin/login`; dispatch ไม่มี Bearer → 401; webhook ไม่มีลายเซ็น → 401; ลายเซ็นถูกต้อง → 200 |
| Security headers | curl | ผ่าน: X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, `/admin` ใช้ no-store และ noindex |
| Browser mobile 390px | Chromium headless (`playwright-core`) | `/verify-phone` และ `/admin/login`: ไม่มีแนวนอนล้น, ไม่มี console error, มีข้อความภาษาไทย |
| Secret scan | grep ใน `src`, `supabase`, `README.md`, `.env.example` | ไม่พบ key รูปแบบจริง ค่าใน `.env.example` เป็น placeholder ทั้งหมด |

## B. สิ่งที่ยังไม่ได้ทดสอบ (ห้ามอ้างว่าผ่าน)

- **Supabase จริง**: ยังไม่ได้เชื่อมโปรเจกต์จริง จึงยังไม่ได้ทดสอบ PostgREST embed (`customer:profiles!orders_customer_id_fkey`), signed URL, storage upload จาก Server Action, และ migration บนโปรเจกต์จริง
- **Admin จาก browser**: ยังไม่ได้ทดสอบการ login จริง การแก้ราคา แพ็กเกจ ส่วนลด การเปลี่ยนสถานะคำสั่งซื้อ และการดูสลิปจาก browser เพราะไม่มี Supabase จริง
- **ฟอร์มลูกค้า**: ยังไม่ได้ทดสอบ Phone OTP, การสร้างคำสั่งซื้อ และการส่งสลิปจาก browser กับ Supabase จริง
- **หน้าที่ถูก redirect**: เมื่อ cookie ปลอมเข้า `/admin/*` หน้าจะตอบ HTTP 200 พร้อม error boundary แต่ไม่แสดงข้อมูล (requireStaff ทำงานหลังเริ่ม stream) ลองแก้ที่ layout แล้ว build ไม่ผ่านกับหน้า `[id]` จึงย้อนกลับ ต้องแก้ที่ proxy หรือหาวิธีอื่นก่อนเปิดใช้งาน
- **LINE จริง**: ยังไม่ได้ส่งข้อความเข้ากลุ่มจริง โฮสต์ `api.line.me`, รูปแบบ body และการตอบ 429 ยังไม่ได้ยืนยันจากเอกสารทางการที่ดึงได้ครบ
- **Payment webhook จริง**: ไม่มี route สำหรับ provider และไม่มี provider ที่ยืนยันความสามารถแล้ว (`payment-gateway-provider.ts` ทุก capability เป็น false)
- **Rate limiting**: ยังไม่มี

## C. ต้องทำก่อนรับเงินจริง (บล็อกการเปิดรับเงิน)

1. **Payment provider**: ยืนยัน provider ที่มี webhook พร้อม signature, API ตรวจรับเงิน (fetchPayment) และ endpoint จาก เอกสารทางการของ provider เอง ไม่สมมติค่าใดๆ แล้วเขียน adapter จริง
2. **ทดสอบ webhook กับ provider sandbox**: ลายเซ็นถูก/ผิด, ส่งซ้ำ, ยอดไม่ตรง, reference ไม่ตรง, สกุลเงินไม่ตรง
3. **การตรวจรับเงินจริง**: ระบบต้องยืนยันยอดกับ provider ก่อนเปลี่ยนสถานะ ห้ามอนุมัติจากสลิปหรือ OCR อย่างเดียว (กฎนี้อยู่ในโค้ดแล้ว แต่ต้องทดสอบกับบัญชีจริง)
4. **ทดสอบ end-to-end บน staging**: สมัคร → โอน → สลิป → ตรวจรับ → แจ้ง LINE → ผลสมัครผ่านการยืนยัน → ACTIVATED
5. **Rate limit**: OTP ขอรหัส (ตั้งที่ Supabase Auth), OTP ยืนยัน, `create_order`, `submit_payment`, dispatch, webhook (แนะนำที่ edge/WAF ของผู้ให้บริการ หรือ counter ในฐานข้อมูล)
6. **SMS OTP**: เลือก SMS provider ใน Supabase Phone Auth และทดสอบส่งจริง
7. **แก้ /admin ที่ตอบ 200**: ให้ redirect ก่อน stream หรือ block ที่ proxy แล้วทดสอบ
8. **ทดสอบ admin จริงบน browser**: login, แก้ราคา, เปลี่ยนสถานะ, ดูสลิปด้วยลิงก์ชั่วคราว, ปฏิเสธการชำระเงิน
10. **Security headers ใน production**: เพิ่ม CSP ที่ทดสอบแล้ว และ HSTS ถ้า Vercel ไม่ตั้งให้

## D. ความเป็นส่วนตัวและการเก็บข้อมูล

- [ ] นโยบายความเป็นส่วนตัวและเงื่อนไขการให้บริการ (ภาษาไทย) ผ่านทนายหรือผู้เชี่ยวชาญก่อนใช้จริง
- [ ] กำหนดระยะเก็บสลิปและข้อมูลส่วนบุคคล และลบตามกำหนด (ยังไม่มี job ลบ)
- [ ] ตรวจ log: `phone-verification.ts` บันทึกเฉพาะข้อความ error แล้ว, `requests.ts` ยังบันทึก error message จาก DB (ตรวจว่าไม่มีเบอร์ในข้อความ), LINE webhook บันทึก groupId เฉพาะ non-production
- [ ] ตรวจว่า OTP ไม่ถูก log ใน production (`DEV_OTP_LOG` ต้องไม่ตั้ง)
- [ ] มีขั้นตอนตอบคำขอลบข้อมูลของลูกค้า

## E. การสำรองและการดำเนินงาน

- [ ] เปิด Point-in-time Recovery หรือ backup ของ Supabase และทดสอบ restore บน staging
- [ ] เปิด 2FA ของบัญชี Supabase, Vercel, LINE Developers และ provider
- [ ] หมุน service role key, LINE token หลังทีมที่รู้ค่าเดิมออก
- [ ] มีคนรับผิดชอบตรวจหน้า admin และแจ้งเตือนที่ล้มเหลวทุกวัน
- [ ] มี scheduler เรียก `/api/notifications/dispatch` และแจ้งเตือนเมื่อเรียกไม่สำเร็จ

## F. เกณฑ์ที่ต้องผ่านก่อนเปิดรับเงินจริง

ผ่านทุกข้อ: C1–C4 และ D และ E ครบ และมีผลทดสอบจริงแนบในรายงาน ไม่ใช่จากการอ่านโค้ดอย่างเดียว
