-- =====================================================================
-- payment adapter: ตัวระบุจาก provider + ตารางกัน webhook ซ้ำ
-- =====================================================================

-- ผูกรายการชำระกับ provider (null = ชำระแบบ manual ที่ยังไม่มี payment id จาก provider)
alter table public.payments
  add column provider text check (provider in ('promptpay_manual', 'mock', 'payment_gateway')),
  add column provider_payment_id text check (char_length(provider_payment_id) between 1 and 200);

-- provider payment id หนึ่งค่าผูกได้กับรายการเดียวเท่านั้น
create unique index payments_provider_payment_uidx
  on public.payments (provider, provider_payment_id)
  where provider_payment_id is not null;

-- payment_webhook_events: บันทึก webhook ที่ผ่านการตรวจลายเซ็นแล้ว
-- status: received (กำลังประมวลผล) -> processed | rejected | failed (ส่งซ้ำได้)
create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('mock', 'payment_gateway')),
  event_id text not null check (char_length(event_id) between 1 and 200),
  event_type text not null check (char_length(event_type) between 1 and 100),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'received' check (status in ('received', 'processed', 'rejected', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

alter table public.payment_webhook_events enable row level security;
-- ไม่มี policy: ลูกค้าและพนักงานไม่สามารถอ่านหรือเขียนได้ผ่าน API (service role เท่านั้น)
revoke all on public.payment_webhook_events from anon, authenticated;
