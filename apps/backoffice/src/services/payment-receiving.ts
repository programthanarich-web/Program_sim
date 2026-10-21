import "server-only";
import { createSupabaseAuthClient } from "@/lib/supabase/server-auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const QR_BUCKET = "payment-qr";
const QR_URL_TTL_SECONDS = 60;

export interface PaymentReceiving {
  bankName: string;
  accountName: string;
  accountNumber: string;
  qrPath: string | null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** อ่านค่ารับเงินด้วย session ของพนักงาน (RLS: พนักงานอ่านได้) */
export async function getPaymentReceiving(): Promise<PaymentReceiving> {
  const db = await createSupabaseAuthClient();
  const { data, error } = await db
    .from("settings")
    .select("key, value")
    .in("key", ["payment.bank_name", "payment.account_name", "payment.account_number", "payment.qr_storage_path"]);
  if (error) throw new Error(error.message);

  const map = new Map<string, unknown>((data ?? []).map((row) => [row.key as string, row.value]));
  const qrPath = text(map.get("payment.qr_storage_path"));
  return {
    bankName: text(map.get("payment.bank_name")),
    accountName: text(map.get("payment.account_name")),
    accountNumber: text(map.get("payment.account_number")),
    qrPath: qrPath || null,
  };
}

/** ลิงก์ดูภาพ QR ชั่วคราว สร้างหลังตรวจสิทธิ์พนักงานแล้วเท่านั้น */
export async function createQrPreviewUrl(path: string): Promise<string | null> {
  const { data, error } = await createSupabaseServiceClient()
    .storage.from(QR_BUCKET)
    .createSignedUrl(path, QR_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function removeQrFile(path: string): Promise<void> {
  await createSupabaseServiceClient().storage.from(QR_BUCKET).remove([path]);
}

export async function uploadQrFile(path: string, bytes: Uint8Array, mime: string): Promise<void> {
  const { error } = await createSupabaseServiceClient()
    .storage.from(QR_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error("อัปโหลด QR ไม่สำเร็จ กรุณาลองใหม่");
}
