import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SITE_CONTENT,
  isSafeSiteImagePath,
  parseSiteContent,
  repoImagePath,
  repoPathFor,
} from "./site-content.ts";

test("ค่าเริ่มต้นผ่านการตรวจ", () => {
  const result = parseSiteContent(DEFAULT_SITE_CONTENT);
  assert.equal(result.ok, true);
});

test("หัวข้อสั้นเกินไปถูกปฏิเสธ", () => {
  const result = parseSiteContent({ ...DEFAULT_SITE_CONTENT, heroTitle: "สั้น" });
  assert.equal(result.ok, false);
});

test("ลิงก์ LINE ต้องเป็น https", () => {
  const result = parseSiteContent({ ...DEFAULT_SITE_CONTENT, lineUrl: "http://line.me/x" });
  assert.equal(result.ok, false);
  const ok = parseSiteContent({ ...DEFAULT_SITE_CONTENT, lineUrl: "https://line.me/R/ti/p/@shop" });
  assert.equal(ok.ok, true);
});

test("รูปต้องอยู่ในโฟลเดอร์ /site และเป็นชนิดที่อนุญาต", () => {
  assert.equal(isSafeSiteImagePath("/site/hero-1.webp"), true);
  assert.equal(isSafeSiteImagePath(""), true);
  assert.equal(isSafeSiteImagePath("/site/../../etc/passwd"), false);
  assert.equal(isSafeSiteImagePath("/site/icon.svg"), false);
  assert.equal(isSafeSiteImagePath("https://evil.example/x.png"), false);
  const bad = parseSiteContent({ ...DEFAULT_SITE_CONTENT, heroImagePath: "/site/x.svg" });
  assert.equal(bad.ok, false);
});

test("ต้องมีขั้นตอนครบ 3 ข้อ", () => {
  const result = parseSiteContent({ ...DEFAULT_SITE_CONTENT, steps: DEFAULT_SITE_CONTENT.steps.slice(0, 2) });
  assert.equal(result.ok, false);
});

test("ข้อมูลที่ไม่ใช่ object ถูกปฏิเสธ", () => {
  assert.equal(parseSiteContent(null).ok, false);
  assert.equal(parseSiteContent([]).ok, false);
  assert.equal(parseSiteContent("text").ok, false);
});

test("ตัดช่องว่างหัวท้ายและไม่ยอมรับ path ที่มี ..", () => {
  const result = parseSiteContent({ ...DEFAULT_SITE_CONTENT, heroTitle: "   หัวข้อทดสอบ   " });
  assert.equal(result.ok && result.value.heroTitle, "หัวข้อทดสอบ");
  assert.equal(repoPathFor("apps/storefront", "../secrets").ok, false);
  assert.equal(repoPathFor("apps/storefront", "content/site-content.json").ok, true);
  assert.equal(repoPathFor("apps/../x", "a.json").ok, false);
});

test("path รูปใน repo อยู่ใต้ public เท่านั้น", () => {
  const ok = repoImagePath("apps/storefront", "/site/hero-1.png");
  assert.equal(ok.ok && ok.value, "apps/storefront/public/site/hero-1.png");
  assert.equal(repoImagePath("apps/storefront", "").ok, false);
});
