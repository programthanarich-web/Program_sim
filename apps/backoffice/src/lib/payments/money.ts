import { PaymentAdapterError } from "@pt/shared/payments/errors";
import type { Satang } from "./types";

// บาทไม่เกิน 9 หลัก ทศนิยมได้สูงสุด 2 ตำแหน่ง
const BAHT_PATTERN = /^(0|[1-9]\d{0,8})(\.\d{1,2})?$/;

/** แปลงสตริงจำนวนเงินเป็นสตางค์ โดยไม่ผ่าน float */
export function parseBahtToSatang(input: string): Satang {
  if (!BAHT_PATTERN.test(input)) {
    throw new PaymentAdapterError("invalid_amount", `invalid baht amount: ${input}`);
  }
  const [baht, fraction = ""] = input.split(".");
  const satang = Number(baht) * 100 + Number(fraction.padEnd(2, "0"));
  return assertSatang(satang);
}

export function assertSatang(value: number): Satang {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PaymentAdapterError("invalid_amount", `amount must be a positive integer of satang`);
  }
  return value;
}

export function formatSatang(value: Satang): string {
  return (value / 100).toFixed(2);
}
