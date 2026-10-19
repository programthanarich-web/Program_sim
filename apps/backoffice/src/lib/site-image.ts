export type SiteImageExtension = "png" | "jpg" | "webp";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWithBytes(buffer: Uint8Array, bytes: number[]): boolean {
  return buffer.length >= bytes.length && bytes.every((byte, i) => buffer[i] === byte);
}

function ascii(buffer: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...buffer.subarray(start, end));
}

/** ตรวจชนิดรูปจาก magic bytes ไม่เชื่อ MIME ที่ผู้ใช้ส่งมา */
export function sniffSiteImageExtension(buffer: Uint8Array): SiteImageExtension | null {
  if (startsWithBytes(buffer, PNG_SIGNATURE)) return "png";
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return "jpg";
  if (buffer.length >= 12 && ascii(buffer, 0, 4) === "RIFF" && ascii(buffer, 8, 12) === "WEBP") return "webp";
  return null;
}
