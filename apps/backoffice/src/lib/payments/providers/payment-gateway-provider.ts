import { PaymentAdapterError } from "@pt/shared/payments/errors";
import { NO_CAPABILITIES } from "../types";
import type {
  IntentResult,
  PaymentProvider,
  ProviderPaymentSnapshot,
  VerifiedWebhookEvent,
} from "../types";

/**
 * Payment Gateway ยังไม่ได้เชื่อมต่อ
 *
 * ยังไม่มีการยืนยันว่าใช้ผู้ให้บริการรายใด endpoint ใด วิธีตรวจลายเซ็น หรือ secret ใด
 * จึงประกาศความสามารถทั้งหมดเป็น false และทุก method ปฏิเสธ
 * เมื่อได้เอกสารจริงแล้ว ให้สร้าง adapter ใหม่ที่ประกาศเฉพาะความสามารถที่เอกสารยืนยัน
 */
const NOT_CONFIGURED_MESSAGE = "payment gateway is not configured: provider documentation not confirmed";

export class PaymentGatewayProvider implements PaymentProvider {
  readonly id = "payment_gateway" as const;
  readonly capabilities = NO_CAPABILITIES;

  async createIntent(): Promise<IntentResult> {
    throw new PaymentAdapterError("not_configured", NOT_CONFIGURED_MESSAGE);
  }

  verifyWebhook(): VerifiedWebhookEvent {
    throw new PaymentAdapterError("not_configured", NOT_CONFIGURED_MESSAGE);
  }

  async fetchPayment(): Promise<ProviderPaymentSnapshot> {
    throw new PaymentAdapterError("not_configured", NOT_CONFIGURED_MESSAGE);
  }
}
