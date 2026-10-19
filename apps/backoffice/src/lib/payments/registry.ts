import { PaymentAdapterError } from "@pt/shared/payments/errors";
import { MockPaymentProvider } from "./providers/mock-provider";
import { PaymentGatewayProvider } from "./providers/payment-gateway-provider";
import { PromptPayManualProvider } from "./providers/promptpay-manual-provider";
import type { ManualTransferInstructions, PaymentProvider, ProviderId } from "./types";

export interface RegistryOptions {
  manualAccount: ManualTransferInstructions;
  /** ใส่ secret เฉพาะ test หรือ dev; production ต้องไม่ส่งค่านี้ */
  mockWebhookSecret?: string;
  nodeEnv: string | undefined;
}

/**
 * สร้างตาราง provider ที่เปิดใช้งาน
 * mock จะถูกปฏิเสธใน production แม้ผู้เรียกจะส่ง secret มา
 */
export function createProviderRegistry(options: RegistryOptions): ReadonlyMap<ProviderId, PaymentProvider> {
  const providers = new Map<ProviderId, PaymentProvider>();
  providers.set("promptpay_manual", new PromptPayManualProvider(options.manualAccount));
  providers.set("payment_gateway", new PaymentGatewayProvider());

  if (options.mockWebhookSecret !== undefined) {
    if (options.nodeEnv === "production") {
      throw new PaymentAdapterError("not_configured", "mock provider must not be enabled in production");
    }
    providers.set("mock", new MockPaymentProvider(options.mockWebhookSecret));
  }
  return providers;
}
