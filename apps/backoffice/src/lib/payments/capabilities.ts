import { PaymentAdapterError } from "@pt/shared/payments/errors";
import type { IntentResult, ProviderCapabilities } from "./types";

const RESULT_REQUIREMENT: Record<IntentResult["kind"], keyof ProviderCapabilities> = {
  qr: "qrCode",
  hosted_page: "paymentIntent",
  manual_transfer: "manualReview",
};

export function assertCapability(
  capabilities: Readonly<ProviderCapabilities>,
  capability: keyof ProviderCapabilities,
  providerId: string,
): void {
  if (!capabilities[capability]) {
    throw new PaymentAdapterError(
      "capability_missing",
      `${providerId} does not support ${capability}`,
    );
  }
}

/** ตรวจว่าผลลัพธ์ที่ provider คืนมาตรงกับความสามารถที่ประกาศไว้ */
export function assertResultAllowed(
  capabilities: Readonly<ProviderCapabilities>,
  result: IntentResult,
  providerId: string,
): void {
  assertCapability(capabilities, RESULT_REQUIREMENT[result.kind], providerId);
}
