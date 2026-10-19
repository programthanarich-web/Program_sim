// ชนิดข้อมูลกลางของ payment adapter
// ไฟล์นี้ไม่รู้จัก orders โดยตรง ฝั่ง orders จะส่งข้อมูลเข้ามาผ่าน port (ดู ports.ts)

export type ProviderId = "promptpay_manual" | "mock" | "payment_gateway";

/**
 * ความสามารถของ provider
 * ทุกค่าเริ่มที่ false และต้องเปิดเป็น true เฉพาะเมื่อยืนยันจากเอกสารทางการของ provider แล้วเท่านั้น
 */
export interface ProviderCapabilities {
  /** สร้าง QR code (เช่น PromptPay dynamic QR) ผ่านระบบของ provider ได้ */
  qrCode: boolean;
  /** สร้าง payment intent / ลิงก์ชำระผ่าน API ได้ */
  paymentIntent: boolean;
  /** ส่ง webhook ที่ตรวจลายเซ็นได้ */
  webhook: boolean;
  /** ดึงสถานะและยอดเงินจริงผ่าน API ได้ (ใช้ยืนยันยอดแทนข้อมูลจาก webhook หรือ client) */
  fetchPayment: boolean;
  /** มี API ตรวจสลิปอัตโนมัติ */
  slipVerificationApi: boolean;
  /** ต้องให้พนักงานตรวจสลิปและอนุมัติเอง */
  manualReview: boolean;
}

export const NO_CAPABILITIES: Readonly<ProviderCapabilities> = Object.freeze({
  qrCode: false,
  paymentIntent: false,
  webhook: false,
  fetchPayment: false,
  slipVerificationApi: false,
  manualReview: false,
});

/** จำนวนเงินเป็นสตางค์ (จำนวนเต็มบวก) เพื่อเลี่ยงปัญหาทศนิยมของ float */
export type Satang = number;

export interface IntentRequest {
  paymentId: string;
  /** เลขอ้างอิงที่ระบบสร้างเอง ใช้จับคู่ตอน provider ยืนยันการชำระ */
  reference: string;
  amount: Satang;
  currency: "THB";
  expiresAt: Date;
}

export interface ManualTransferInstructions {
  bankName: string;
  accountName: string;
  accountNumber: string;
}

export type IntentResult =
  | { kind: "qr"; providerPaymentId: string; qrPayload: string; expiresAt: Date }
  | { kind: "hosted_page"; providerPaymentId: string; redirectUrl: string; expiresAt: Date }
  | { kind: "manual_transfer"; instructions: ManualTransferInstructions };

export type ProviderPaymentStatus = "pending" | "paid" | "failed" | "expired" | "refunded";

/** ข้อมูลที่ provider ยืนยันผ่าน API (ใช้เป็นแหล่งความจริงของยอดเงิน) */
export interface ProviderPaymentSnapshot {
  providerPaymentId: string;
  status: ProviderPaymentStatus;
  amount: Satang;
  currency: string;
  reference: string;
  paidAt: Date | null;
}

export interface WebhookInput {
  /** ชื่อ header ต้องเป็นตัวพิมพ์เล็กทั้งหมด (caller เป็นคน normalize) */
  headers: Record<string, string | undefined>;
  /** body ดิบ ก่อน parse ใช้สำหรับตรวจลายเซ็น */
  rawBody: string;
  now: Date;
}

export interface VerifiedWebhookEvent {
  eventId: string;
  eventType: string;
  providerPaymentId: string;
}

export interface PaymentProvider {
  readonly id: ProviderId;
  readonly capabilities: Readonly<ProviderCapabilities>;
  /** ต้องคืนผลลัพธ์ชนิดที่ตรงกับ capability เท่านั้น (service ตรวจซ้ำอีกชั้น) */
  createIntent(request: IntentRequest): Promise<IntentResult>;
  /** ตรวจลายเซ็นและคืน event ที่ยืนยันแล้ว; ไม่รองรับต้องโยน capability_missing */
  verifyWebhook(input: WebhookInput): VerifiedWebhookEvent;
  /** ดึงสถานะจริงจาก API; ไม่รองรับต้องโยน capability_missing */
  fetchPayment(providerPaymentId: string): Promise<ProviderPaymentSnapshot>;
}
