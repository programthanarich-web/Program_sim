import type { NotificationRow, OrderNotificationPayload, SignupOutcome, SignupResultPayload } from "./types";

export class PermanentNotificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentNotificationError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const OUTCOME_LABELS: Record<SignupOutcome, string> = {
  success: "สำเร็จ",
  failed: "ไม่สำเร็จ",
  needs_info: "ต้องการข้อมูลเพิ่ม",
};

function readOrderPayload(payload: unknown): OrderNotificationPayload {
  if (typeof payload !== "object" || payload === null) {
    throw new PermanentNotificationError("payload is not an object");
  }
  const p = payload as Record<string, unknown>;
  if (typeof p.order_id !== "string" || !UUID_PATTERN.test(p.order_id)) {
    throw new PermanentNotificationError("invalid order_id");
  }
  if (!Number.isSafeInteger(p.order_number) || (p.order_number as number) <= 0) {
    throw new PermanentNotificationError("invalid order_number");
  }
  if (typeof p.package_name !== "string" || p.package_name.length === 0 || p.package_name.length > 80) {
    throw new PermanentNotificationError("invalid package_name");
  }
  if (typeof p.amount_thb !== "number" || !Number.isFinite(p.amount_thb) || p.amount_thb < 0) {
    throw new PermanentNotificationError("invalid amount_thb");
  }
  return {
    order_id: p.order_id,
    order_number: p.order_number as number,
    package_name: p.package_name,
    amount_thb: p.amount_thb,
  };
}

/** ลิงก์ไปหน้าตรวจคำสั่งซื้อ (ต้องล็อกอินก่อนจึงเปิดได้) */
export function adminOrderUrl(baseUrl: string, orderId: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/admin/orders/${orderId}`;
}

/**
 * สร้างข้อความภาษาไทยสำหรับกลุ่ม LINE
 * มีเฉพาะ เลขคำสั่งซื้อ ชื่อแพ็กเกจ ยอดเงิน และลิงก์หลังบ้าน
 * ไม่มีเบอร์โทร ชื่อลูกค้า เลขอ้างอิงการโอน หรือรูปสลิป
 */
export function renderNotification(row: Pick<NotificationRow, "template" | "payload">, baseUrl: string): string {
  const base = readOrderPayload(row.payload);
  const url = adminOrderUrl(baseUrl, base.order_id);
  const amount = `${base.amount_thb.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
  const header = `คำสั่งซื้อ #${base.order_number}`;

  switch (row.template) {
    case "payment_received":
      return [
        "รับชำระเงินแล้ว",
        header,
        `แพ็กเกจ: ${base.package_name}`,
        `ยอด: ${amount}`,
        `ตรวจสอบ: ${url}`,
      ].join("\n");

    case "signup_queue":
      return [
        "มีงานรอสมัครแพ็กเกจ",
        header,
        `แพ็กเกจ: ${base.package_name}`,
        `ยอด: ${amount}`,
        `เปิดคิวสมัคร: ${url}`,
      ].join("\n");

    case "signup_result": {
      const outcome = readOutcome(row.payload);
      return [
        `ผลการสมัคร: ${OUTCOME_LABELS[outcome]}`,
        header,
        `แพ็กเกจ: ${base.package_name}`,
        `รอผู้ดูแลยืนยัน: ${url}`,
      ].join("\n");
    }

    default:
      throw new PermanentNotificationError(`unknown template: ${row.template}`);
  }
}

function readOutcome(payload: unknown): SignupOutcome {
  const outcome = (payload as Partial<SignupResultPayload>).outcome;
  if (outcome === "success" || outcome === "failed" || outcome === "needs_info") return outcome;
  throw new PermanentNotificationError("invalid outcome");
}
