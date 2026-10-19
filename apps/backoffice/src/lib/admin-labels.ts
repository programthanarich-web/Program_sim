export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "รอชำระเงิน",
  processing: "กำลังดำเนินการ",
  activated: "เปิดใช้งานแล้ว",
  cancelled: "ยกเลิก",
};

export const ORDER_STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  processing: "bg-sky-50 text-sky-800 ring-sky-200",
  activated: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-300",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending_review: "รอตรวจสลิป",
  verified: "ยืนยันแล้ว",
  rejected: "ปฏิเสธ",
  refunded: "คืนเงินแล้ว",
};

export const SIGNUP_OUTCOME_LABELS: Record<string, string> = {
  success: "สำเร็จ",
  failed: "ไม่สำเร็จ",
  needs_info: "ต้องการข้อมูลเพิ่ม",
};

export const NOTIFICATION_STATUS_LABELS: Record<string, string> = {
  queued: "รอส่ง",
  sent: "ส่งแล้ว",
  failed: "ล้มเหลว",
};

export const NOTIFICATION_TEMPLATE_LABELS: Record<string, string> = {
  payment_received: "รับชำระเงิน",
  signup_queue: "งานรอสมัคร",
  signup_result: "ผลการสมัคร",
};

export const ORDER_FILTERS = [
  { value: "", label: "ทั้งหมด" },
  { value: "pending", label: "รอชำระ" },
  { value: "processing", label: "กำลังดำเนินการ" },
  { value: "activated", label: "เปิดใช้งานแล้ว" },
  { value: "cancelled", label: "ยกเลิก" },
] as const;

export function label(map: Record<string, string>, key: string | null | undefined): string {
  return (key && map[key]) || "-";
}

const moneyFormatter = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 539.1 -> "539.10 บาท" (ทศนิยมเสมอ เพื่อให้เทียบยอดชำระได้ชัดเจน) */
export function formatMoney(amount: number): string {
  return `${moneyFormatter.format(amount)} บาท`;
}
