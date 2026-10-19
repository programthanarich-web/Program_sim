import "server-only";
import { createSupabaseAuthClient } from "@/lib/supabase/server-auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// การอ่านทั้งหมดใช้ session ของลูกค้า จึงผ่าน RLS (เห็นเฉพาะคำสั่งซื้อของตัวเอง)
// ตาราง payments และ slips อ่านได้เฉพาะพนักงาน ลูกค้าจึงเห็นสถานะชำระเงินผ่าน my_orders() เท่านั้น

export interface MyOrderRow {
  orderId: string;
  orderNumber: number;
  packageName: string;
  totalThb: number;
  status: "pending" | "processing" | "activated" | "cancelled";
  latestPaymentStatus: "pending_review" | "verified" | "rejected" | "refunded" | null;
  createdAt: string;
}

export interface OrderDetailForCustomer {
  id: string;
  orderNumber: number;
  packageName: string;
  speedMbps: number;
  dataQuotaGb: number | null;
  durationDays: number;
  totalThb: number;
  status: MyOrderRow["status"];
  createdAt: string;
}

const QR_BUCKET = "payment-qr";
const QR_URL_TTL_SECONDS = 60;

/** ลิงก์ QR ชั่วคราวสำหรับลูกค้า (สร้างจากฝั่ง storefront เพื่อไม่พึ่งโค้ดหลังบ้าน) */
async function createQrPreviewUrl(path: string): Promise<string | null> {
  const { data, error } = await createSupabaseServiceClient()
    .storage.from(QR_BUCKET)
    .createSignedUrl(path, QR_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

export interface PaymentInstructions {
  bankName: string;
  accountName: string;
  accountNumber: string;
  qrUrl: string | null;
}

export interface PublicPackage {
  id: string;
  name: string;
  speed_mbps: number;
  data_quota_gb: number | null;
  price_thb: number;
  duration_days: number;
  description: string | null;
}

export async function listActivePackagesForCustomer(): Promise<PublicPackage[]> {
  const db = await createSupabaseAuthClient();
  const { data, error } = await db
    .from("packages")
    .select("id, name, speed_mbps, data_quota_gb, price_thb, duration_days, description")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("price_thb", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({ ...p, price_thb: Number(p.price_thb) })) as PublicPackage[];
}

export async function listMyOrders(): Promise<MyOrderRow[]> {
  const db = await createSupabaseAuthClient();
  const { data, error } = await db.rpc("my_orders");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    orderId: row.order_id as string,
    orderNumber: Number(row.order_number),
    packageName: row.package_name as string,
    totalThb: Number(row.total_thb),
    status: row.status as MyOrderRow["status"],
    latestPaymentStatus: (row.latest_payment_status as MyOrderRow["latestPaymentStatus"]) ?? null,
    createdAt: row.created_at as string,
  }));
}

export async function getMyOrder(orderId: string): Promise<OrderDetailForCustomer | null> {
  const db = await createSupabaseAuthClient();
  const { data, error } = await db
    .from("orders")
    .select(
      "id, order_number, package_name_snapshot, speed_mbps_snapshot, data_quota_gb_snapshot, duration_days_snapshot, total_thb, order_status, created_at",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id as string,
    orderNumber: Number(data.order_number),
    packageName: data.package_name_snapshot as string,
    speedMbps: Number(data.speed_mbps_snapshot),
    dataQuotaGb: data.data_quota_gb_snapshot === null ? null : Number(data.data_quota_gb_snapshot),
    durationDays: Number(data.duration_days_snapshot),
    totalThb: Number(data.total_thb),
    status: data.order_status as MyOrderRow["status"],
    createdAt: data.created_at as string,
  };
}

/**
 * ค่ารับเงิน (บัญชีและ QR) สำหรับลูกค้า
 * อ่านด้วย service role ฝั่ง server หลังตรวจว่าเป็นลูกค้าที่ล็อกอินแล้วในหน้า/action ที่เรียก
 * ไม่คืนค่าอื่นของ settings และลิงก์ QR เป็นลิงก์ชั่วคราว
 */
export async function getPaymentInstructions(): Promise<PaymentInstructions | null> {
  const { data, error } = await createSupabaseServiceClient()
    .from("settings")
    .select("key, value")
    .in("key", ["payment.bank_name", "payment.account_name", "payment.account_number", "payment.qr_storage_path"]);
  if (error) throw new Error(error.message);

  const map = new Map<string, unknown>((data ?? []).map((row) => [row.key as string, row.value]));
  const accountNumber = typeof map.get("payment.account_number") === "string" ? (map.get("payment.account_number") as string) : "";
  const qrPath = typeof map.get("payment.qr_storage_path") === "string" ? (map.get("payment.qr_storage_path") as string) : "";
  if (!accountNumber && !qrPath) return null;

  return {
    bankName: String(map.get("payment.bank_name") ?? ""),
    accountName: String(map.get("payment.account_name") ?? ""),
    accountNumber,
    qrUrl: qrPath ? await createQrPreviewUrl(qrPath) : null,
  };
}
