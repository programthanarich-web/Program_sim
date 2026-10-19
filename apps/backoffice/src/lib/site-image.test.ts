import assert from "node:assert/strict";
import { test } from "node:test";
import { sniffSiteImageExtension } from "./site-image";

test("รู้จัก PNG, JPEG, WebP จาก magic bytes", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const webp = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
  assert.equal(sniffSiteImageExtension(png), "png");
  assert.equal(sniffSiteImageExtension(jpg), "jpg");
  assert.equal(sniffSiteImageExtension(webp), "webp");
});

test("ไม่รับไฟล์ที่ไม่ใช่รูป แม้ตั้งชื่อหรือ MIME เป็นรูป", () => {
  assert.equal(sniffSiteImageExtension(Buffer.from("<html>")), null);
  assert.equal(sniffSiteImageExtension(new Uint8Array([0x89, 0x50])), null);
  assert.equal(sniffSiteImageExtension(new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WAVE")])), null);
});
