# Payment adapter (ฉบับออกแบบ)

โฟลเดอร์นี้แยกการชำระเงินออกจาก business logic ของ orders
orders ไม่เรียก provider โดยตรง และ adapter ไม่รู้จักตาราง orders

## โครงสร้าง

| ไฟล์ | หน้าที่ |
|---|---|
| `types.ts` | `PaymentProvider` interface, ความสามารถ (`ProviderCapabilities`), ผลลัพธ์ intent, snapshot จาก provider |
| `capabilities.ts` | ตรวจว่าผลลัพธ์ที่ provider คืนมาตรงกับความสามารถที่ประกาศ |
| `service.ts` | `PaymentService`: สร้าง intent และรับ webhook (ตรวจลายเซ็น -> กันซ้ำ -> ดึงยอดจริง -> เทียบ -> ส่งให้ sink) |
| `ports.ts` | สิ่งที่ต้องการจากภายนอก: lookup, sink, event store, slip storage |
| `slip-file.ts`, `slip-submission.ts` | ตรวจสลิปจาก magic bytes และขนาด, เก็บเข้า storage, บันทึกเป็น "รอตรวจ" |
| `crypto.ts`, `money.ts` | HMAC แบบ constant-time, timestamp กัน replay, จำนวนเงินเป็นสตางค์ |
| `providers/` | `mock` (test เท่านั้น), `promptpay_manual`, `payment_gateway` (ยังไม่เชื่อมต่อ) |
| `persistence/` | Supabase implementation (server-only) ของ event store และ slip storage |
| `registry.ts` | ประกอบ provider; mock ถูกปฏิเสธใน production |

## ความสามารถที่ยืนยันแล้ว

| Provider | QR | Intent | Webhook | ดึงยอด API | ตรวจสลิป API | Manual review | สถานะ |
|---|---|---|---|---|---|---|---|
| `promptpay_manual` | ไม่ | ไม่ | ไม่ | ไม่ | ไม่ | ใช่ | ใช้ได้: โอนเอง + พนักงานตรวจ |
| `payment_gateway` | ไม่ | ไม่ | ไม่ | ไม่ | ไม่ | ไม่ | **ยังไม่ยืนยัน** ทุก method ปฏิเสธ |
| `mock` | ใช่ | ใช่ | ใช่ | ใช่ | ไม่ | ไม่ | ทดสอบเท่านั้น |

ยังไม่มีการยืนยันเอกสารของ PromptPay QR หรือ payment gateway รายใด จึงไม่มี endpoint, secret, หรือ algorithm ถูกเขียนไว้ในโค้ด

## กฎที่บังคับในโค้ด

1. ยอดเงินมาจาก `fetchPayment` ของ provider เท่านั้น ไม่ใช้ค่าใน body ของ webhook หรือจาก client
2. webhook ต้องผ่านการตรวจลายเซ็นก่อนแตะฐานข้อมูล และมี timestamp ไม่เกิน 5 นาที
3. event id ซ้ำ (`provider, event_id`) จะไม่ประมวลผลซ้ำ ถ้า body ต่างจากเดิมจะเป็น `conflict`
4. event ที่ล้มเหลวในฝั่ง orders จะถูกทำเครื่องหมาย `failed` และ provider ส่งซ้ำได้
5. ไฟล์สลิป: อนุญาต JPEG, PNG, WebP เท่านั้น ขนาดไม่เกิน 5 MB ตรวจจาก magic bytes ไม่ใช่ชื่อไฟล์
6. hash ของสลิปคำนวณฝั่ง server ทุกครั้ง ไม่เชื่อค่าที่ client ส่งมา
7. ไม่มี OCR และไม่มีการอนุมัติจากรูปสลิป การอนุมัติเป็นของพนักงานผ่าน `review_payment` เท่านั้น

## สิ่งที่ยังไม่ได้ทำ

- `PaymentLookup` และ `PaymentSink` ฝั่ง orders ยังไม่มี implementation ต้องมี RPC สำหรับ service role ที่เปลี่ยนสถานะการชำระเป็น verified ผ่านตรวจสอบยอดแล้ว
- การเชื่อม PromptPay QR และ payment gateway ต้องรอเอกสารทางการ จากนั้นสร้าง adapter ใหม่ที่ประกาศเฉพาะความสามารถที่เอกสารยืนยัน
- สถานะ `received` ที่ค้างจากการ crash ยังไม่มีการ claim ใหม่ตามเวลา
- bucket `payment-slips` ยังไม่ได้ทดสอบกับ Supabase จริง (`supabase/storage/payment-slips-bucket.sql`)
- services เดิมใน `src/services` ยังไม่เรียกผ่าน adapter

## การทดสอบ

```bash
npm run test:payments
```

ชุดทดสอบใช้ `node:test` และ `tsx` ไม่ต้องใช้ฐานข้อมูลหรือเครือข่าย
migration `20261019100300_payment_adapter.sql` ถูกรันผ่านชุดทดสอบสิทธิ์เดิม (124 รายการ) บน PostgreSQL 16 แล้ว
