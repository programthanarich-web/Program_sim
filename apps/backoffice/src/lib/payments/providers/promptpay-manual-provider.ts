import { assertCapability } from "../capabilities";
import type {
  IntentResult,
  ManualTransferInstructions,
  PaymentProvider,
  ProviderCapabilities,
  ProviderPaymentSnapshot,
  VerifiedWebhookEvent,
} from "../types";

/**
 * PromptPay แบบโอนเอง + ตรวจสลิปโดยพนักงาน
 *
 * ยังไม่สร้าง QR: การสร้าง QR แบบ dynamic ต้องยืนยันจาก PSP/ธนาคารของร้านก่อนว่ารองรับ
 * และได้ spec มาแล้ว ดังนั้น qrCode = false จนกว่าจะยืนยัน
 * ไม่มี webhook และไม่มี API ยืนยันยอด การยืนยันเป็นของพนักงานผ่าน manual review เท่านั้น
 */
const MANUAL_CAPABILITIES: Readonly<ProviderCapabilities> = Object.freeze({
  qrCode: false,
  paymentIntent: false,
  webhook: false,
  fetchPayment: false,
  slipVerificationApi: false,
  manualReview: true,
});

export class PromptPayManualProvider implements PaymentProvider {
  readonly id = "promptpay_manual" as const;
  readonly capabilities = MANUAL_CAPABILITIES;

  /** ข้อมูลบัญชีต้องมาจากการตั้งค่าของร้าน (ไม่ hardcode และไม่ใช่ความลับ) */
  constructor(private readonly account: ManualTransferInstructions) {}

  async createIntent(): Promise<IntentResult> {
    assertCapability(this.capabilities, "manualReview", this.id);
    return { kind: "manual_transfer", instructions: { ...this.account } };
  }

  verifyWebhook(): VerifiedWebhookEvent {
    assertCapability(this.capabilities, "webhook", this.id);
    throw new Error("unreachable");
  }

  async fetchPayment(): Promise<ProviderPaymentSnapshot> {
    assertCapability(this.capabilities, "fetchPayment", this.id);
    throw new Error("unreachable");
  }
}
