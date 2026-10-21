import { assertCapability, assertResultAllowed } from "./capabilities";
import { PaymentAdapterError } from "@pt/shared/payments/errors";
import { payloadSha256 } from "./payload";
import type { ExpectedPayment, PaymentLookup, PaymentSink, WebhookEventStore } from "./ports";
import type {
  IntentRequest,
  IntentResult,
  PaymentProvider,
  ProviderId,
  ProviderPaymentSnapshot,
  WebhookInput,
} from "./types";

export type RejectReason =
  | "unknown_reference"
  | "amount_mismatch"
  | "currency_mismatch"
  | "provider_id_mismatch";

export type WebhookOutcome =
  | { status: "confirmed"; paymentId: string }
  | { status: "ignored"; reason: "not_paid" }
  | { status: "rejected"; reason: RejectReason }
  | { status: "duplicate" }
  | { status: "conflict" };

export interface PaymentServiceDeps {
  providers: ReadonlyMap<ProviderId, PaymentProvider>;
  lookup: PaymentLookup;
  sink: PaymentSink;
  events: WebhookEventStore;
}

/**
 * บริการ payment: ไม่รู้จัก orders โดยตรง
 * - สร้าง intent แล้วตรวจว่าผลลัพธ์ตรงกับ capability
 * - รับ webhook: ตรวจลายเซ็น -> กันซ้ำ -> ดึงยอดจริงจาก API -> เทียบกับยอดที่ระบบคาดหวัง -> ส่งให้ sink
 */
export class PaymentService {
  constructor(private readonly deps: PaymentServiceDeps) {}

  async createIntent(providerId: ProviderId, request: IntentRequest): Promise<IntentResult> {
    const provider = this.provider(providerId);
    const result = await provider.createIntent(request);
    assertResultAllowed(provider.capabilities, result, providerId);
    return result;
  }

  async handleWebhook(providerId: ProviderId, input: WebhookInput): Promise<WebhookOutcome> {
    const provider = this.provider(providerId);
    assertCapability(provider.capabilities, "webhook", providerId);
    // ต้องดึงยอดจริงจาก API ได้ก่อนเสมอ จึงจะยืนยันการชำระได้
    assertCapability(provider.capabilities, "fetchPayment", providerId);

    // ตรวจลายเซ็นก่อนแตะฐานข้อมูลใดๆ
    const event = provider.verifyWebhook(input);
    const digest = payloadSha256(input.rawBody);

    const registration = await this.deps.events.register({
      provider: providerId,
      eventId: event.eventId,
      eventType: event.eventType,
      payloadSha256: digest,
    });
    if (registration === "already_handled" || registration === "in_progress") {
      return { status: "duplicate" };
    }
    if (registration === "payload_mismatch") {
      // event id เดิมแต่เนื้อหาต่างกัน: ไม่ประมวลผล ให้คนตรวจ
      return { status: "conflict" };
    }

    try {
      // ยอดและสถานะมาจาก provider โดยตรง ไม่ใช้ข้อมูลใน body ของ webhook
      const snapshot = await provider.fetchPayment(event.providerPaymentId);
      const outcome = await this.evaluate(snapshot);
      if (outcome.status === "ignored") {
        await this.deps.events.complete(providerId, event.eventId, "processed");
        return outcome;
      }
      if (outcome.status === "rejected") {
        await this.deps.events.complete(providerId, event.eventId, "rejected");
        return outcome;
      }

      await this.deps.sink.onPaymentConfirmed({
        paymentId: outcome.expected.paymentId,
        providerId,
        providerPaymentId: snapshot.providerPaymentId,
        amount: snapshot.amount,
        currency: "THB",
        reference: snapshot.reference,
        paidAt: snapshot.paidAt,
      });
      await this.deps.events.complete(providerId, event.eventId, "processed");
      return { status: "confirmed", paymentId: outcome.expected.paymentId };
    } catch (error) {
      // ให้ provider ส่งซ้ำได้: สถานะ failed จะถูก claim ใหม่ในครั้งถัดไป
      await this.deps.events.complete(providerId, event.eventId, "failed");
      throw error;
    }
  }

  private async evaluate(
    snapshot: ProviderPaymentSnapshot,
  ): Promise<
    | { status: "ignored"; reason: "not_paid" }
    | { status: "rejected"; reason: RejectReason }
    | { status: "confirmed-candidate"; expected: ExpectedPayment }
  > {
    if (snapshot.status !== "paid") {
      return { status: "ignored", reason: "not_paid" };
    }
    const expected = await this.deps.lookup.findByReference(snapshot.reference);
    if (!expected) return { status: "rejected", reason: "unknown_reference" };
    if (expected.providerPaymentId !== null && expected.providerPaymentId !== snapshot.providerPaymentId) {
      return { status: "rejected", reason: "provider_id_mismatch" };
    }
    if (expected.currency !== snapshot.currency) {
      return { status: "rejected", reason: "currency_mismatch" };
    }
    if (expected.amount !== snapshot.amount) {
      return { status: "rejected", reason: "amount_mismatch" };
    }
    return { status: "confirmed-candidate", expected };
  }

  private provider(providerId: ProviderId): PaymentProvider {
    const provider = this.deps.providers.get(providerId);
    if (!provider) {
      throw new PaymentAdapterError("provider_not_found", `provider ${providerId} is not registered`);
    }
    return provider;
  }
}
