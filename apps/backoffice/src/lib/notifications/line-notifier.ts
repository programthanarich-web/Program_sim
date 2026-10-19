import type { Notifier, SendRequest, SendResult } from "./types";

/**
 * โฮสต์ของ LINE Messaging API
 * path /v2/bot/message/push ยืนยันจากเอกสารแล้ว
 * โฮสต์ api.line.me ยังไม่ได้ยืนยันจากหน้าเอกสารที่ดึงได้ ให้ตรวจใน LINE Developers ก่อนใช้งานจริง
 */
export const LINE_API_BASE_URL = "https://api.line.me";

const PUSH_PATH = "/v2/bot/message/push";

interface LineNotifierOptions {
  channelAccessToken: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  apiBaseUrl?: string;
}

/**
 * ส่งข้อความเข้ากลุ่ม LINE ด้วย push message
 * - ส่ง X-Line-Retry-Key ทุกครั้ง เพื่อให้การส่งซ้ำไม่ก่อให้เกิดข้อความซ้ำภายใน 24 ชั่วโมง
 * - 409 หมายถึงคำขอนี้ถูกรับไปแล้ว จึงถือว่าสำเร็จ
 * - 5xx, timeout และ 429 ลองใหม่ได้; 4xx อื่นไม่ลองใหม่
 * - ไม่ใส่ token ใน error message หรือ log
 */
export class LineMessagingNotifier implements Notifier {
  readonly name = "line";
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(options: LineNotifierOptions) {
    this.token = options.channelAccessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.baseUrl = options.apiBaseUrl ?? LINE_API_BASE_URL;
  }

  async send(request: SendRequest): Promise<SendResult> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${PUSH_PATH}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          "X-Line-Retry-Key": request.retryKey,
        },
        body: JSON.stringify({
          to: request.to,
          messages: [{ type: "text", text: request.text }],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      return { ok: false, retryable: true, error: "network error or timeout" };
    }

    if (response.status === 200) {
      const body = (await response.json().catch(() => null)) as
        | { sentMessages?: Array<{ id?: string }> }
        | null;
      return { ok: true, providerMessageId: body?.sentMessages?.[0]?.id ?? null };
    }

    if (response.status === 409) {
      // รหัสซ้ำ: คำขอเดิมถูกรับไปแล้ว
      return {
        ok: true,
        providerMessageId: response.headers.get("x-line-accepted-request-id"),
      };
    }

    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const error = `LINE responded ${response.status}`;
      return Number.isFinite(retryAfter) && retryAfter > 0
        ? { ok: false, retryable: true, retryAfterSeconds: retryAfter, error }
        : { ok: false, retryable: true, error };
    }

    return { ok: false, retryable: false, error: `LINE responded ${response.status}` };
  }
}
