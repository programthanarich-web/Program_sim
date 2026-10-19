import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { PaymentService } from "./service";
import { PaymentAdapterError } from "@pt/shared/payments/errors";
import { hmacSha256Hex, verifyHmacSha256Hex, assertFreshTimestamp } from "@pt/shared/payments/crypto";
import { parseBahtToSatang, formatSatang } from "./money";
import { MockPaymentProvider } from "./providers/mock-provider";
import { PromptPayManualProvider } from "./providers/promptpay-manual-provider";
import { PaymentGatewayProvider } from "./providers/payment-gateway-provider";
import { createProviderRegistry } from "./registry";
import { submitSlipForManualReview } from "./slip-submission";
import type { ExpectedPayment, PaymentSink, SlipStorage, WebhookEventStore, WebhookRegistration } from "./ports";
import type { IntentRequest, PaymentProvider, ProviderId, WebhookInput } from "./types";

const SECRET = "test-secret-at-least-16";
const NOW = new Date("2026-10-19T10:00:00Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

// ---------- test doubles ----------

class MemoryEventStore implements WebhookEventStore {
  readonly rows = new Map<string, { hash: string; status: string }>();

  async register(input: {
    provider: string;
    eventId: string;
    eventType: string;
    payloadSha256: string;
  }): Promise<WebhookRegistration> {
    const key = `${input.provider}:${input.eventId}`;
    const row = this.rows.get(key);
    if (!row) {
      this.rows.set(key, { hash: input.payloadSha256, status: "received" });
      return "new";
    }
    if (row.hash !== input.payloadSha256) return "payload_mismatch";
    if (row.status === "failed") {
      row.status = "received";
      return "retry";
    }
    if (row.status === "received") return "in_progress";
    return "already_handled";
  }

  async complete(provider: string, eventId: string, status: "processed" | "rejected" | "failed"): Promise<void> {
    const row = this.rows.get(`${provider}:${eventId}`);
    if (row) row.status = status;
  }

  statusOf(eventId: string): string | undefined {
    return this.rows.get(`mock:${eventId}`)?.status;
  }
}

class RecordingSink implements PaymentSink {
  readonly confirmed: Array<{ paymentId: string; amount: number }> = [];
  failNext = false;

  async onPaymentConfirmed(payment: { paymentId: string; amount: number }): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("orders database unavailable");
    }
    this.confirmed.push({ paymentId: payment.paymentId, amount: payment.amount });
  }
}

class MockLookup {
  constructor(private readonly rows: ExpectedPayment[]) {}

  async findByReference(reference: string): Promise<ExpectedPayment | null> {
    return this.rows.find((row) => row.reference === reference) ?? null;
  }
}

function intentRequest(reference: string, amount: number): IntentRequest {
  return {
    paymentId: "pay-1",
    reference,
    amount,
    currency: "THB",
    expiresAt: new Date(NOW.getTime() + 15 * 60_000),
  };
}

function webhookBody(eventId: string, providerPaymentId: string): string {
  return JSON.stringify({ id: eventId, type: "payment.succeeded", providerPaymentId });
}

function signedInput(body: string, timestamp = NOW_SECONDS): WebhookInput {
  const headers = new MockPaymentProvider(SECRET).signWebhook(body, timestamp);
  return { headers, rawBody: body, now: NOW };
}

// ---------- fixture ----------

interface Fixture {
  service: PaymentService;
  mock: MockPaymentProvider;
  events: MemoryEventStore;
  sink: RecordingSink;
  providerPaymentId: string;
}

async function setUp(amountThb = "199.50"): Promise<Fixture> {
  const mock = new MockPaymentProvider(SECRET);
  const amount = parseBahtToSatang(amountThb);
  const intent = await mock.createIntent(intentRequest("REF0001234", amount));
  assert.equal(intent.kind, "qr");
  const providerPaymentId = intent.providerPaymentId;
  mock.setSnapshot(providerPaymentId, { status: "paid", paidAt: NOW });

  const events = new MemoryEventStore();
  const sink = new RecordingSink();
  const lookup = new MockLookup([
    { paymentId: "pay-1", reference: "REF0001234", amount, currency: "THB", providerPaymentId },
  ]);
  const providers = new Map<ProviderId, PaymentProvider>([["mock", mock]]);
  const service = new PaymentService({ providers, lookup, sink, events });
  return { service, mock, events, sink, providerPaymentId };
}

// ---------- money / crypto ----------

describe("money", () => {
  it("parses baht to satang without float errors", () => {
    assert.equal(parseBahtToSatang("199.5"), 19950);
    assert.equal(parseBahtToSatang("0.01"), 1);
    assert.equal(parseBahtToSatang("100"), 10000);
    assert.equal(formatSatang(19950), "199.50");
  });

  it("rejects negative, zero, too many decimals, and non-numeric input", () => {
    for (const bad of ["0", "-1", "1.234", "abc", "1e3", "", " 10"]) {
      assert.throws(() => parseBahtToSatang(bad), PaymentAdapterError, bad);
    }
  });
});

describe("hmac and timestamps", () => {
  it("verifies a valid signature and rejects tampered body, wrong secret, or malformed signature", () => {
    const sig = hmacSha256Hex(SECRET, "123.body");
    assert.equal(verifyHmacSha256Hex(SECRET, "123.body", sig), true);
    assert.equal(verifyHmacSha256Hex(SECRET, "123.bodY", sig), false);
    assert.equal(verifyHmacSha256Hex("another-secret-value", "123.body", sig), false);
    assert.equal(verifyHmacSha256Hex(SECRET, "123.body", "not-hex"), false);
  });

  it("rejects stale or future timestamps and malformed ones", () => {
    assert.doesNotThrow(() => assertFreshTimestamp(String(NOW_SECONDS - 60), NOW));
    assert.throws(() => assertFreshTimestamp(String(NOW_SECONDS - 3600), NOW), /outside tolerance/);
    assert.throws(() => assertFreshTimestamp(String(NOW_SECONDS + 3600), NOW), /outside tolerance/);
    assert.throws(() => assertFreshTimestamp(undefined, NOW), /missing or malformed/);
    assert.throws(() => assertFreshTimestamp("12abc", NOW), /missing or malformed/);
  });
});

// ---------- webhook flow ----------

describe("PaymentService.handleWebhook (mock provider)", () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await setUp();
  });

  it("confirms only after fetching the amount from the provider API", async () => {
    const body = webhookBody("evt-1", fx.providerPaymentId);
    const outcome = await fx.service.handleWebhook("mock", signedInput(body));
    assert.deepEqual(outcome, { status: "confirmed", paymentId: "pay-1" });
    assert.deepEqual(fx.sink.confirmed, [{ paymentId: "pay-1", amount: 19950 }]);
    assert.equal(fx.events.statusOf("evt-1"), "processed");
  });

  it("treats a redelivered identical webhook as a duplicate and does not confirm twice", async () => {
    const body = webhookBody("evt-2", fx.providerPaymentId);
    await fx.service.handleWebhook("mock", signedInput(body));
    const again = await fx.service.handleWebhook("mock", signedInput(body));
    assert.deepEqual(again, { status: "duplicate" });
    assert.equal(fx.sink.confirmed.length, 1);
  });

  it("reports a conflict when the same event id arrives with a different body", async () => {
    await fx.service.handleWebhook("mock", signedInput(webhookBody("evt-3", fx.providerPaymentId)));
    const altered = webhookBody("evt-3", fx.providerPaymentId).replace("payment.succeeded", "payment.other");
    const outcome = await fx.service.handleWebhook("mock", signedInput(altered));
    assert.deepEqual(outcome, { status: "conflict" });
    assert.equal(fx.sink.confirmed.length, 1);
  });

  it("rejects a bad signature before touching the event store", async () => {
    const body = webhookBody("evt-4", fx.providerPaymentId);
    const input = signedInput(body);
    input.rawBody = body.replace("evt-4", "evt-5");
    await assert.rejects(fx.service.handleWebhook("mock", input), (e: unknown) =>
      e instanceof PaymentAdapterError && e.code === "invalid_signature");
    assert.equal(fx.events.rows.size, 0);
    assert.equal(fx.sink.confirmed.length, 0);
  });

  it("rejects a stale webhook timestamp", async () => {
    const body = webhookBody("evt-6", fx.providerPaymentId);
    await assert.rejects(fx.service.handleWebhook("mock", signedInput(body, NOW_SECONDS - 7200)), (e: unknown) =>
      e instanceof PaymentAdapterError && e.code === "stale_webhook");
  });

  it("does not confirm when the provider reports a different amount than expected", async () => {
    fx.mock.setSnapshot(fx.providerPaymentId, { amount: 100 });
    const outcome = await fx.service.handleWebhook("mock", signedInput(webhookBody("evt-7", fx.providerPaymentId)));
    assert.deepEqual(outcome, { status: "rejected", reason: "amount_mismatch" });
    assert.equal(fx.sink.confirmed.length, 0);
    assert.equal(fx.events.statusOf("evt-7"), "rejected");
  });

  it("does not confirm when the provider reports a different currency", async () => {
    fx.mock.setSnapshot(fx.providerPaymentId, { currency: "USD" });
    const outcome = await fx.service.handleWebhook("mock", signedInput(webhookBody("evt-8", fx.providerPaymentId)));
    assert.deepEqual(outcome, { status: "rejected", reason: "currency_mismatch" });
  });

  it("ignores a webhook when the provider says the payment is not paid", async () => {
    fx.mock.setSnapshot(fx.providerPaymentId, { status: "pending", paidAt: null });
    const outcome = await fx.service.handleWebhook("mock", signedInput(webhookBody("evt-9", fx.providerPaymentId)));
    assert.deepEqual(outcome, { status: "ignored", reason: "not_paid" });
    assert.equal(fx.sink.confirmed.length, 0);
  });

  it("rejects an unknown reference", async () => {
    fx.mock.setSnapshot(fx.providerPaymentId, { reference: "UNKNOWN999" });
    const outcome = await fx.service.handleWebhook("mock", signedInput(webhookBody("evt-10", fx.providerPaymentId)));
    assert.deepEqual(outcome, { status: "rejected", reason: "unknown_reference" });
  });

  it("lets the provider retry after a failed downstream update, then confirms once", async () => {
    const body = webhookBody("evt-11", fx.providerPaymentId);
    fx.sink.failNext = true;
    await assert.rejects(fx.service.handleWebhook("mock", signedInput(body)), /orders database unavailable/);
    assert.equal(fx.events.statusOf("evt-11"), "failed");

    const retry = await fx.service.handleWebhook("mock", signedInput(body));
    assert.deepEqual(retry, { status: "confirmed", paymentId: "pay-1" });
    assert.equal(fx.sink.confirmed.length, 1);
  });
});

// ---------- capabilities ----------

describe("capability enforcement", () => {
  it("manual PromptPay provider returns manual transfer instructions and no QR", async () => {
    const provider = new PromptPayManualProvider({
      bankName: "ธนาคารตัวอย่าง",
      accountName: "บริษัทตัวอย่าง",
      accountNumber: "000-0-00000-0",
    });
    const service = new PaymentService({
      providers: new Map([["promptpay_manual", provider]]),
      lookup: new MockLookup([]),
      sink: new RecordingSink(),
      events: new MemoryEventStore(),
    });
    const result = await service.createIntent("promptpay_manual", intentRequest("REF0001234", 100));
    assert.equal(result.kind, "manual_transfer");
    assert.equal(provider.capabilities.qrCode, false);
    await assert.rejects(
      service.handleWebhook("promptpay_manual", { headers: {}, rawBody: "{}", now: NOW }),
      (e: unknown) => e instanceof PaymentAdapterError && e.code === "capability_missing",
    );
  });

  it("gateway stub rejects every operation as not configured", async () => {
    const provider = new PaymentGatewayProvider();
    await assert.rejects(provider.createIntent(), (e: unknown) =>
      e instanceof PaymentAdapterError && e.code === "not_configured");
    assert.equal(Object.values(provider.capabilities).some(Boolean), false);
  });

  it("refuses a provider result that its declared capabilities do not allow", async () => {
    const liar: PaymentProvider = {
      id: "payment_gateway",
      capabilities: { qrCode: false, paymentIntent: false, webhook: false, fetchPayment: false, slipVerificationApi: false, manualReview: false },
      async createIntent() {
        return { kind: "qr", providerPaymentId: "x", qrPayload: "x", expiresAt: NOW };
      },
      verifyWebhook() {
        throw new Error("unused");
      },
      async fetchPayment() {
        throw new Error("unused");
      },
    };
    const service = new PaymentService({
      providers: new Map([["payment_gateway", liar]]),
      lookup: new MockLookup([]),
      sink: new RecordingSink(),
      events: new MemoryEventStore(),
    });
    await assert.rejects(service.createIntent("payment_gateway", intentRequest("REF0001234", 100)), (e: unknown) =>
      e instanceof PaymentAdapterError && e.code === "capability_missing");
  });

  it("mock provider is never registered in production", () => {
    assert.throws(
      () =>
        createProviderRegistry({
          manualAccount: { bankName: "b", accountName: "a", accountNumber: "1" },
          mockWebhookSecret: SECRET,
          nodeEnv: "production",
        }),
      /must not be enabled in production/,
    );
    const dev = createProviderRegistry({
      manualAccount: { bankName: "b", accountName: "a", accountNumber: "1" },
      mockWebhookSecret: SECRET,
      nodeEnv: "development",
    });
    assert.equal(dev.has("mock"), true);
  });
});

// ---------- manual slip review ----------

describe("submitSlipForManualReview", () => {
  const CUSTOMER_ID = "0f8e7d6c-5b4a-4321-9abc-def012345678";
  const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

  class MemorySlipStorage implements SlipStorage {
    readonly files = new Map<string, Uint8Array>();
    async put(path: string, bytes: Uint8Array): Promise<void> {
      this.files.set(path, bytes);
    }
    async remove(path: string): Promise<void> {
      this.files.delete(path);
    }
  }

  it("stores a validated slip and records it as pending review, never approved", async () => {
    const storage = new MemorySlipStorage();
    let recorded: { storagePath: string; mime: string } | null = null;
    const record = await submitSlipForManualReview(
      { customerId: CUSTOMER_ID, paymentId: "pay-1", bytes: jpegBytes },
      {
        storage,
        recordPendingReview: async (r) => {
          recorded = { storagePath: r.storagePath, mime: r.mime };
        },
      },
    );
    assert.equal(record.mime, "image/jpeg");
    assert.ok(record.storagePath.startsWith(`${CUSTOMER_ID}/`));
    assert.ok(storage.files.has(record.storagePath));
    assert.deepEqual(recorded, { storagePath: record.storagePath, mime: "image/jpeg" });
  });

  it("removes the uploaded file when recording fails (e.g. duplicate hash)", async () => {
    const storage = new MemorySlipStorage();
    await assert.rejects(
      submitSlipForManualReview(
        { customerId: CUSTOMER_ID, paymentId: "pay-1", bytes: jpegBytes },
        {
          storage,
          recordPendingReview: async () => {
            throw new PaymentAdapterError("provider_error", "duplicate slip");
          },
        },
      ),
      /duplicate slip/,
    );
    assert.equal(storage.files.size, 0);
  });

  it("does not store anything when the file type is wrong", async () => {
    const storage = new MemorySlipStorage();
    await assert.rejects(
      submitSlipForManualReview(
        { customerId: CUSTOMER_ID, paymentId: "pay-1", bytes: Buffer.from("<svg/>") },
        { storage, recordPendingReview: async () => undefined },
      ),
      (e: unknown) => e instanceof PaymentAdapterError && e.code === "unsupported_file_type",
    );
    assert.equal(storage.files.size, 0);
  });
});
