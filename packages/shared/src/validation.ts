const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OTP_PATTERN = /^\d{6}$/;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isOtpCode(value: string): boolean {
  return OTP_PATTERN.test(value);
}
