import { randomUUID } from "node:crypto";
import { PaymentAdapterError } from "@pt/shared/payments/errors";
import { assertFreshTimestamp, hmacSha256Hex, verifyHmacSha256Hex } from "@pt/shared/payments/crypto";
import { assertCapability } from "../capabilities";
import type {
  IntentRequest,
  IntentResult,
  PaymentProvider,
  ProviderCapabilities,
  ProviderPaymentSnapshot,
  VerifiedWebhookEvent,
  WebhookInput,
} from "../types";

/**
 * Mock provider สำหรับทดสอบเท่านั้น จำลอง "ความสามารถที่ตั้งใจให้มี" ของ provider ในอุดมคติ
 * ห้ามเชื่อมกับ provider จริง และ registry จะไม่เปิดใช้งานนอก test/dev
 */
const MOCK_CAPABILITIES: Readonly<ProviderCapabilities> = Object.freeze({
  qrCode: true,
  paymentIntent: true,
  webhook: true,
  fetchPayment: true,
  slipVerificationApi: false,
  manualReview: false,
});

export interface MockWebhookBody {
  id: string;
  type: string;
  providerPaymentId: string;
}

export class MockPaymentProvider implements PaymentProvider {
  readonly id = "mock" as const;
  readonly capabilities = MOCK_CAPABILITIES;
  private readonly payments = new Map<string, ProviderPaymentSnapshot>();

  constructor(private readonly webhookSecret: string) {
    if (webhookSecret.length < 16) {
      throw new PaymentAdapterError("not_configured", "mock webhook secret must be at least 16 characters");
    }
  }

  async createIntent(request: IntentRequest): Promise<IntentResult> {
    const providerPaymentId = `mock_${randomUUID()}`;
    this.payments.set(providerPaymentId, {
      providerPaymentId,
      status: "pending",
      amount: request.amount,
      currency: request.currency,
      reference: request.reference,
      paidAt: null,
    });
    return {
      kind: "qr",
      providerPaymentId,
      qrPayload: `MOCK-QR|${request.reference}|${request.amount}`,
      expiresAt: request.expiresAt,
    };
  }

  verifyWebhook(input: WebhookInput): VerifiedWebhookEvent {
    assertCapability(this.capabilities, "webhook", this.id);
    const signature = input.headers["x-mock-signature"];
    const timestamp = input.headers["x-mock-timestamp"];
    if (!signature) {
      throw new PaymentAdapterError("invalid_signature", "missing signature header");
    }
    assertFreshTimestamp(timestamp, input.now);
    if (!verifyHmacSha256Hex(this.webhookSecret, `${timestamp}.${input.rawBody}`, signature)) {
      throw new PaymentAdapterError("invalid_signature", "signature mismatch");
    }
    const body = parseMockBody(input.rawBody);
    return { eventId: body.id, eventType: body.type, providerPaymentId: body.providerPaymentId };
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPaymentSnapshot> {
    assertCapability(this.capabilities, "fetchPayment", this.id);
    const snapshot = this.payments.get(providerPaymentId);
    if (!snapshot) {
      throw new PaymentAdapterError("provider_not_found", "unknown provider payment");
    }
    return { ...snapshot };
  }

  // ---- helpers สำหรับ test เท่านั้น ----

  /** จำลองการเปลี่ยนสถานะฝั่ง provider (เช่น ลูกค้าจ่ายแล้ว หรือส่งยอดผิด) */
  setSnapshot(providerPaymentId: string, patch: Partial<Omit<ProviderPaymentSnapshot, "providerPaymentId">>): void {
    const current = this.payments.get(providerPaymentId);
    if (!current) throw new Error("unknown mock payment");
    this.payments.set(providerPaymentId, { ...current, ...patch });
  }

  /** สร้าง header ลายเซ็นที่ถูกต้องสำหรับ body นั้น */
  signWebhook(rawBody: string, timestampSeconds: number): Record<string, string> {
    const timestamp = String(timestampSeconds);
    return {
      "x-mock-timestamp": timestamp,
      "x-mock-signature": hmacSha256Hex(this.webhookSecret, `${timestamp}.${rawBody}`),
    };
  }
}

function parseMockBody(rawBody: string): MockWebhookBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new PaymentAdapterError("malformed_webhook", "body is not JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new PaymentAdapterError("malformed_webhook", "body is not an object");
  }
  const { id, type, providerPaymentId } = parsed as Record<string, unknown>;
  if (typeof id !== "string" || typeof type !== "string" || typeof providerPaymentId !== "string") {
    throw new PaymentAdapterError("malformed_webhook", "missing id, type or providerPaymentId");
  }
  return { id, type, providerPaymentId };
}
