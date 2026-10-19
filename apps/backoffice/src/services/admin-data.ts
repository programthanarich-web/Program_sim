import "server-only";
import { createSupabaseAuthClient } from "@/lib/supabase/server-auth";
import { maskPhone } from "@pt/shared/phone";

// การอ่านทั้งหมดใช้ session ของพนักงาน จึงผ่าน RLS (พนักงานเห็นเฉพาะที่สิทธิ์อนุญาต)
// ข้อมูลส่วนบุคคลที่ส่งถึงหน้าจอมีเบอร์ที่ปิดบังแล้วเท่านั้น และไม่มี storage_path ของสลิป

type Db = Awaited<ReturnType<typeof createSupabaseAuthClient>>;

interface CustomerEmbed {
  phone: string | null;
}

function pickCustomer(value: CustomerEmbed | CustomerEmbed[] | null | undefined): CustomerEmbed | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function maskedOrNull(phone: string | null | undefined): string {
  return phone ? maskPhone(phone) : "-";
}

function unwrap<T>(result: { data: T[] | null; error: { message: string } | null }): T[] {
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

// ---------------------------------------------------------------------
// ชนิดข้อมูลที่ส่งถึงหน้าจอ
// ---------------------------------------------------------------------

export interface OrderListRow {
  id: string;
  order_number: number;
  package_name_snapshot: string;
  total_thb: number;
  order_status: string;
  created_at: string;
  customer_phone_masked: string;
  awaiting_review: boolean;
}

export interface OrderDetailRecord {
  id: string;
  order_number: number;
  package_name_snapshot: string;
  package_code_snapshot: string;
  speed_mbps_snapshot: number;
  data_quota_gb_snapshot: number | null;
  duration_days_snapshot: number;
  unit_price_thb: number;
  discount_code_snapshot: string | null;
  discount_amount_thb: number;
  total_thb: number;
  order_status: string;
  created_at: string;
  customer_phone_masked: string;
}

export interface PaymentRecord {
  id: string;
  method: string;
  amount_thb: number;
  reference_no: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
}

export interface SlipRecord {
  id: string;
  payment_id: string;
  status: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface SignupResultRecord {
  id: string;
  outcome: string;
  note: string;
  recorded_at: string;
  recorded_by: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  confirm_note: string | null;
}

export interface OrderEventRecord {
  id: string;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  reason: string | null;
  created_at: string;
}

export interface NotificationRecord {
  id: string;
  template: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface OrderDetail {
  order: OrderDetailRecord;
  payments: PaymentRecord[];
  slips: SlipRecord[];
  signupResults: SignupResultRecord[];
  events: OrderEventRecord[];
  notifications: NotificationRecord[];
}

export interface QueueOrderRow {
  id: string;
  order_number: number;
  package_name_snapshot: string;
  total_thb: number;
  created_at: string;
}

export interface OpenSignupRow {
  id: string;
  order_id: string;
  outcome: string;
  note: string;
  recorded_at: string;
  recorded_by: string;
}

export interface PackageRecord {
  id: string;
  code: string;
  name: string;
  speed_mbps: number;
  data_quota_gb: number | null;
  price_thb: number;
  duration_days: number;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface DiscountRecord {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_uses: number | null;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
}

export interface NotificationListRow {
  id: string;
  template: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  payload: { order_number?: number } | null;
}

// ---------------------------------------------------------------------
// คำสั่งซื้อ
// ---------------------------------------------------------------------

export async function listOrders(filter: { status?: string; orderNumber?: number }): Promise<OrderListRow[]> {
  const db = await createSupabaseAuthClient();
  let query = db
    .from("orders")
    .select(
      "id, order_number, package_name_snapshot, total_thb, order_status, created_at, customer:profiles!orders_customer_id_fkey(phone)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (filter.status) query = query.eq("order_status", filter.status);
  if (filter.orderNumber) query = query.eq("order_number", filter.orderNumber);

  const orders = unwrap<Record<string, unknown>>(await query);
  const ids = orders.map((o) => o.id as string);
  const reviewing = await reviewingOrderIds(db, ids);

  return orders.map((o) => ({
    id: o.id as string,
    order_number: o.order_number as number,
    package_name_snapshot: o.package_name_snapshot as string,
    total_thb: Number(o.total_thb),
    order_status: o.order_status as string,
    created_at: o.created_at as string,
    customer_phone_masked: maskedOrNull(pickCustomer(o.customer as CustomerEmbed)?.phone),
    awaiting_review: reviewing.has(o.id as string),
  }));
}

async function reviewingOrderIds(db: Db, orderIds: string[]): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set();
  const rows = unwrap<{ order_id: string }>(
    await db.from("payments").select("order_id").in("order_id", orderIds).eq("status", "pending_review"),
  );
  return new Set(rows.map((r) => r.order_id));
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const db = await createSupabaseAuthClient();

  const { data, error } = await db
    .from("orders")
    .select(
      "id, order_number, package_name_snapshot, package_code_snapshot, speed_mbps_snapshot, data_quota_gb_snapshot, duration_days_snapshot, unit_price_thb, discount_code_snapshot, discount_amount_thb, total_thb, order_status, created_at, customer:profiles!orders_customer_id_fkey(phone)",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const raw = data as Record<string, unknown>;
  const order: OrderDetailRecord = {
    id: raw.id as string,
    order_number: raw.order_number as number,
    package_name_snapshot: raw.package_name_snapshot as string,
    package_code_snapshot: raw.package_code_snapshot as string,
    speed_mbps_snapshot: raw.speed_mbps_snapshot as number,
    data_quota_gb_snapshot: (raw.data_quota_gb_snapshot as number | null) ?? null,
    duration_days_snapshot: raw.duration_days_snapshot as number,
    unit_price_thb: Number(raw.unit_price_thb),
    discount_code_snapshot: (raw.discount_code_snapshot as string | null) ?? null,
    discount_amount_thb: Number(raw.discount_amount_thb),
    total_thb: Number(raw.total_thb),
    order_status: raw.order_status as string,
    created_at: raw.created_at as string,
    customer_phone_masked: maskedOrNull(pickCustomer(raw.customer as CustomerEmbed)?.phone),
  };

  const payments = unwrap<PaymentRecord>(
    await db
      .from("payments")
      .select("id, method, amount_thb, reference_no, status, rejection_reason, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
  ).map((p) => ({ ...p, amount_thb: Number(p.amount_thb) }));

  const paymentIds = payments.map((p) => p.id);
  // ไม่ดึง storage_path มาที่หน้าจอ: ลิงก์สลิปสร้างจาก payment id ฝั่ง server เท่านั้น
  const slips = paymentIds.length
    ? unwrap<SlipRecord>(
        await db
          .from("slips")
          .select("id, payment_id, status, mime_type, size_bytes, created_at")
          .in("payment_id", paymentIds),
      )
    : [];

  const signupResults = unwrap<SignupResultRecord>(
    await db
      .from("signup_results")
      .select("id, outcome, note, recorded_at, recorded_by, confirmed_at, confirmed_by, confirm_note")
      .eq("order_id", orderId)
      .order("recorded_at", { ascending: false }),
  );

  const events = unwrap<OrderEventRecord>(
    await db
      .from("order_events")
      .select("id, event_type, from_value, to_value, reason, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
  );

  const notifications = unwrap<NotificationRecord>(
    await db
      .from("notification_logs")
      .select("id, template, status, attempts, last_error, created_at, sent_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
  );

  return { order, payments, slips, signupResults, events, notifications };
}

// ---------------------------------------------------------------------
// คิวสมัคร
// ---------------------------------------------------------------------

export async function getSignupQueue(): Promise<{ processing: QueueOrderRow[]; open: OpenSignupRow[] }> {
  const db = await createSupabaseAuthClient();
  const processing = unwrap<QueueOrderRow>(
    await db
      .from("orders")
      .select("id, order_number, package_name_snapshot, total_thb, created_at")
      .eq("order_status", "processing")
      .order("created_at", { ascending: true })
      .limit(100),
  ).map((o) => ({ ...o, total_thb: Number(o.total_thb) }));

  const open = unwrap<OpenSignupRow>(
    await db
      .from("signup_results")
      .select("id, order_id, outcome, note, recorded_at, recorded_by")
      .is("confirmed_at", null)
      .order("recorded_at", { ascending: true })
      .limit(100),
  );

  return { processing, open };
}

// ---------------------------------------------------------------------
// ภาพรวม
// ---------------------------------------------------------------------

export async function getDashboardCounts() {
  const db = await createSupabaseAuthClient();
  const count = async (
    build: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
  ): Promise<number> => {
    const { count: value, error } = await build();
    if (error) throw new Error(error.message);
    return value ?? 0;
  };

  const [awaitingReview, processing, openSignup, failedNotifications] = await Promise.all([
    count(() => db.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending_review")),
    count(() => db.from("orders").select("id", { count: "exact", head: true }).eq("order_status", "processing")),
    count(() => db.from("signup_results").select("id", { count: "exact", head: true }).is("confirmed_at", null)),
    count(() => db.from("notification_logs").select("id", { count: "exact", head: true }).eq("status", "failed")),
  ]);

  return { awaitingReview, processing, openSignup, failedNotifications };
}

// ---------------------------------------------------------------------
// แพ็กเกจ ส่วนลด การแจ้งเตือน
// ---------------------------------------------------------------------

export async function listPackagesForAdmin(): Promise<PackageRecord[]> {
  const db = await createSupabaseAuthClient();
  return unwrap<PackageRecord>(
    await db
      .from("packages")
      .select("id, code, name, speed_mbps, data_quota_gb, price_thb, duration_days, description, is_active, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ).map((p) => ({ ...p, price_thb: Number(p.price_thb) }));
}

export async function listDiscountsForAdmin(): Promise<DiscountRecord[]> {
  const db = await createSupabaseAuthClient();
  return unwrap<DiscountRecord>(
    await db
      .from("discount_codes")
      .select("id, code, discount_type, discount_value, max_uses, valid_from, valid_until, is_active")
      .order("created_at", { ascending: false })
      .limit(200),
  ).map((d) => ({ ...d, discount_value: Number(d.discount_value) }));
}

export async function listNotifications(status?: string): Promise<NotificationListRow[]> {
  const db = await createSupabaseAuthClient();
  let query = db
    .from("notification_logs")
    .select("id, template, status, attempts, max_attempts, last_error, created_at, sent_at, payload")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) query = query.eq("status", status);
  return unwrap<NotificationListRow>(await query);
}
