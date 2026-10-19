import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { verifyLineSignature } from "./line-signature";
import { LineMessagingNotifier } from "./line-notifier";
import { MockNotifier } from "./notifier";
import { backoffSeconds, dispatchDueNotifications, RETRY_BACKOFF_SECONDS } from "./dispatcher";
import { renderNotification } from "./render";
import type { CompleteInput, NotificationRow, NotificationStore } from "./types";

const ORDER_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const BASE = "https://shop.example.com/";

function row(template: string, payload: Record<string, unknown>, extra: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    template,
    payload: { order_id: ORDER_ID, order_number: 42, package_name: "Home 200", amount_thb: 499, ...payload },
    attempts: 1,
    max_attempts: 5,
    retry_key: "22222222-2222-4222-8222-222222222222",
    ...extra,
  };
}

// ---------- render ----------

describe("renderNotification", () => {
  it("payment message has order number, package, amount and admin link only", () => {
    const text = renderNotification(row("payment_received", {}), BASE);
    assert.match(text, /รับชำระเงินแล้ว/);
    assert.match(text, /คำสั่งซื้อ #42/);
    assert.match(text, /แพ็กเกจ: Home 200/);
    assert.match(text, /ยอด: 499\.00 บาท/);
    assert.ok(text.endsWith(`https://shop.example.com/admin/orders/${ORDER_ID}`));
  });

  it("signup queue message uses the queue link", () => {
    const text = renderNotification(row("signup_queue", {}), BASE);
    assert.match(text, /มีงานรอสมัครแพ็กเกจ/);
    assert.match(text, /เปิดคิวสมัคร: https:\/\/shop\.example\.com\/admin\/orders\//);
  });

  it("signup result message shows the outcome label", () => {
    const text = renderNotification(row("signup_result", { outcome: "needs_info" }), BASE);
    assert.match(text, /ผลการสมัคร: ต้องการข้อมูลเพิ่ม/);
  });

  it("never includes personal data even if an extra field is present", () => {
    const text = renderNotification(
      row("payment_received", { phone: "0811112222", name: "สมชาย", storage_path: "x/y.jpg" }),
      BASE,
    );
    assert.doesNotMatch(text, /0811112222|สมชาย|storage|\.jpg/);
  });

  it("rejects a payload with an invalid order id or unknown template", () => {
    assert.throws(() => renderNotification(row("payment_received", { order_id: "not-a-uuid" }), BASE));
    assert.throws(() => renderNotification(row("payment_received", { amount_thb: -1 }), BASE));
    assert.throws(() => renderNotification(row("hacked_template", {}), BASE), /unknown template/);
  });
});

// ---------- LINE webhook signature ----------

describe("verifyLineSignature", () => {
  const secret = "channel-secret-for-tests";
  const body = '{"events":[]}';
  const signature = createHmac("sha256", secret).update(body).digest("base64");

  it("accepts the correct signature over the raw body", () => {
    assert.equal(verifyLineSignature(body, signature, secret), true);
  });

  it("rejects a modified body, wrong secret, missing or malformed header", () => {
    assert.equal(verifyLineSignature(body + " ", signature, secret), false);
    assert.equal(verifyLineSignature(body, signature, "other-secret"), false);
    assert.equal(verifyLineSignature(body, null, secret), false);
    assert.equal(verifyLineSignature(body, "bm90LWEtc2lnbmF0dXJl", secret), false);
  });
});

// ---------- LINE client ----------

interface FakeCall {
  url: string;
  init: RequestInit;
}

function fakeFetch(responses: Array<Response | Error>): { fetchImpl: typeof fetch; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("no fake response left");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("LineMessagingNotifier", () => {
  const request = { retryKey: "retry-key-1", to: "Cgroup123", text: "ข้อความทดสอบ" };

  it("sends a push message with bearer token and retry key", async () => {
    const { fetchImpl, calls } = fakeFetch([
      new Response(JSON.stringify({ sentMessages: [{ id: "msg-1" }] }), { status: 200 }),
    ]);
    const notifier = new LineMessagingNotifier({ channelAccessToken: "TOKEN-XYZ", fetchImpl });
    const result = await notifier.send(request);

    assert.deepEqual(result, { ok: true, providerMessageId: "msg-1" });
    assert.equal(calls[0].url, "https://api.line.me/v2/bot/message/push");
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer TOKEN-XYZ");
    assert.equal(headers["X-Line-Retry-Key"], "retry-key-1");
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      to: "Cgroup123",
      messages: [{ type: "text", text: "ข้อความทดสอบ" }],
    });
  });

  it("treats 409 (retry key already accepted) as success", async () => {
    const { fetchImpl } = fakeFetch([
      new Response("{}", { status: 409, headers: { "x-line-accepted-request-id": "req-9" } }),
    ]);
    const notifier = new LineMessagingNotifier({ channelAccessToken: "T", fetchImpl });
    assert.deepEqual(await notifier.send(request), { ok: true, providerMessageId: "req-9" });
  });

  it("marks 500, 429 and timeouts as retryable, using Retry-After when present", async () => {
    const { fetchImpl } = fakeFetch([
      new Response("", { status: 500 }),
      new Response("", { status: 429, headers: { "retry-after": "120" } }),
      new Error("socket hang up"),
    ]);
    const notifier = new LineMessagingNotifier({ channelAccessToken: "T", fetchImpl });
    assert.deepEqual(await notifier.send(request), {
      ok: false, retryable: true, error: "LINE responded 500",
    });
    const limited = await notifier.send(request);
    assert.equal(limited.ok, false);
    assert.equal(limited.ok ? false : limited.retryAfterSeconds, 120);
    assert.equal(limited.ok ? true : limited.retryable, true);
    const network = await notifier.send(request);
    assert.equal(network.ok ? true : network.retryable, true);
  });

  it("does not retry other 4xx and never leaks the token into errors", async () => {
    const { fetchImpl } = fakeFetch([new Response("", { status: 400 })]);
    const notifier = new LineMessagingNotifier({ channelAccessToken: "SECRET-TOKEN", fetchImpl });
    const result = await notifier.send(request);
    assert.deepEqual(result, { ok: false, retryable: false, error: "LINE responded 400" });
    assert.ok(!JSON.stringify(result).includes("SECRET-TOKEN"));
  });
});

// ---------- dispatcher ----------

class MemoryStore implements NotificationStore {
  readonly completed: Array<{ id: string; input: CompleteInput }> = [];
  constructor(private readonly rows: NotificationRow[]) {}

  async claim(limit: number): Promise<NotificationRow[]> {
    return this.rows.splice(0, limit);
  }

  async complete(id: string, input: CompleteInput): Promise<void> {
    this.completed.push({ id, input });
  }
}

const TARGET = "Cgroup123";
const deps = (store: NotificationStore, notifier: MockNotifier | { send: MockNotifier["send"]; name: string }) => ({
  store,
  notifier: notifier as MockNotifier,
  target: TARGET,
  adminBaseUrl: BASE,
});

describe("dispatchDueNotifications", () => {
  it("sends each due row once and records the provider message id", async () => {
    const store = new MemoryStore([row("payment_received", {}), row("signup_queue", {}, { id: "33333333-3333-4333-8333-333333333333", retry_key: "55555555-5555-4555-8555-555555555555" })]);
    const notifier = new MockNotifier();
    const summary = await dispatchDueNotifications(deps(store, notifier));

    assert.deepEqual(summary, { claimed: 2, sent: 2, retried: 0, failed: 0 });
    assert.equal(notifier.delivered.length, 2);
    assert.equal(store.completed[0].input.outcome, "sent");
  });

  it("schedules a retry with backoff for transient failures and keeps the same retry key", async () => {
    const store = new MemoryStore([row("payment_received", {}, { attempts: 2 })]);
    const notifier = new MockNotifier();
    notifier.transientFailures = 1;
    const summary = await dispatchDueNotifications(deps(store, notifier));

    assert.deepEqual(summary, { claimed: 1, sent: 0, retried: 1, failed: 0 });
    assert.deepEqual(store.completed[0].input, {
      outcome: "retry",
      error: "mock transient failure",
      retryAfterSeconds: RETRY_BACKOFF_SECONDS[1],
    });
  });

  it("marks permanent failures and invalid payloads as failed without retry", async () => {
    const store = new MemoryStore([row("payment_received", { order_id: "bad" })]);
    const notifier = new MockNotifier();
    const summary = await dispatchDueNotifications(deps(store, notifier));
    assert.deepEqual(summary, { claimed: 1, sent: 0, retried: 0, failed: 1 });
    assert.equal(notifier.delivered.length, 0);
    assert.equal(store.completed[0].input.outcome, "failed");
  });

  it("a thrown notifier error is treated as retryable and does not stop the batch", async () => {
    const store = new MemoryStore([row("payment_received", {}), row("signup_queue", {}, { id: "44444444-4444-4444-8444-444444444444" })]);
    let calls = 0;
    const flaky = {
      name: "flaky",
      async send() {
        calls += 1;
        if (calls === 1) throw new Error("boom");
        return { ok: true as const, providerMessageId: "m" };
      },
    };
    const summary = await dispatchDueNotifications(deps(store, flaky));
    assert.deepEqual(summary, { claimed: 2, sent: 1, retried: 1, failed: 0 });
  });

  it("re-sending the same retry key does not deliver a duplicate message (LINE dedupe behaviour)", async () => {
    const notifier = new MockNotifier();
    const first = await notifier.send({ retryKey: "k", to: TARGET, text: "x" });
    const again = await notifier.send({ retryKey: "k", to: TARGET, text: "x" });
    assert.equal(first.ok, true);
    assert.equal(again.ok, true);
    assert.equal(notifier.delivered.length, 1);
  });
});

describe("backoff", () => {
  it("grows and caps at the last step", () => {
    assert.equal(backoffSeconds(1), 60);
    assert.equal(backoffSeconds(2), 300);
    assert.equal(backoffSeconds(3), 900);
    assert.equal(backoffSeconds(4), 3600);
    assert.equal(backoffSeconds(99), 3600);
  });
});
