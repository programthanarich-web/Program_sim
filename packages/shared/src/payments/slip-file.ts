import { randomUUID } from "node:crypto";
import { PaymentAdapterError } from "./errors";
import { sha256Hex } from "./crypto";

export const SLIP_MAX_BYTES = 5 * 1024 * 1024;

export type SlipMime = "image/jpeg" | "image/png" | "image/webp";

const EXTENSION_BY_MIME: Record<SlipMime, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface ValidatedSlip {
  mime: SlipMime;
  extension: "jpg" | "png" | "webp";
  sizeBytes: number;
  sha256: string;
}

/** ตรวจชนิดไฟล์จาก magic bytes ไม่เชื่อชื่อไฟล์หรือ Content-Type ของ client */
export function detectSlipMime(bytes: Uint8Array): SlipMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && pngSignature.every((b, i) => bytes[i] === b)) {
    return "image/png";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export function validateSlipFile(bytes: Uint8Array, declaredMime?: string): ValidatedSlip {
  if (bytes.length === 0) {
    throw new PaymentAdapterError("invalid_file", "slip file is empty");
  }
  if (bytes.length > SLIP_MAX_BYTES) {
    throw new PaymentAdapterError("file_too_large", "slip file exceeds 5 MB");
  }
  const mime = detectSlipMime(bytes);
  if (!mime) {
    throw new PaymentAdapterError("unsupported_file_type", "slip must be JPEG, PNG or WebP");
  }
  if (declaredMime !== undefined && declaredMime !== mime) {
    throw new PaymentAdapterError("unsupported_file_type", "declared type does not match file content");
  }
  return {
    mime,
    extension: EXTENSION_BY_MIME[mime],
    sizeBytes: bytes.length,
    sha256: sha256Hex(bytes),
  };
}

/** path ต้องขึ้นต้นด้วย customer id ตรงกับ CHECK ของตาราง slips */
export function buildSlipStoragePath(customerId: string, extension: ValidatedSlip["extension"]): string {
  if (!UUID_PATTERN.test(customerId)) {
    throw new PaymentAdapterError("invalid_file", "customer id must be a lowercase UUID");
  }
  return `${customerId}/${randomUUID()}.${extension}`;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}
