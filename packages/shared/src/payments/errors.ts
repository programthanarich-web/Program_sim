export type PaymentErrorCode =
  | "capability_missing"
  | "not_configured"
  | "invalid_signature"
  | "stale_webhook"
  | "malformed_webhook"
  | "invalid_amount"
  | "invalid_file"
  | "file_too_large"
  | "unsupported_file_type"
  | "provider_not_found"
  | "provider_error";

export class PaymentAdapterError extends Error {
  readonly code: PaymentErrorCode;

  constructor(code: PaymentErrorCode, message: string) {
    super(message);
    this.name = "PaymentAdapterError";
    this.code = code;
  }
}
