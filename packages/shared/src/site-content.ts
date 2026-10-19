// ข้อความและรูปของหน้าบ้านที่หลังบ้านแก้ได้ (เก็บเป็นไฟล์ใน repo ผ่าน GitHub)
// ไฟล์นี้ใช้ร่วมกันระหว่างหน้าบ้านและหลังบ้าน จึงไม่มีโค้ดของแอปใดแอปหนึ่ง

export interface SiteStep {
  title: string;
  description: string;
}

export interface SiteContent {
  heroTitle: string;
  heroSubtitle: string;
  ctaLabel: string;
  /** "" หรือ path ในโฟลเดอร์ public เช่น /site/hero-abc123.webp */
  heroImagePath: string;
  /** "" หรือ ลิงก์ https เช่น ลิงก์ LINE OA ของร้าน */
  lineUrl: string;
  footerNote: string;
  steps: SiteStep[];
}

export const SITE_CONTENT_STEP_COUNT = 3;

export const DEFAULT_SITE_CONTENT: SiteContent = {
  heroTitle: "เลือกแพ็กเกจอินเทอร์เน็ตที่เหมาะกับคุณ",
  heroSubtitle:
    "ยืนยันเบอร์มือถือเพียงครั้งเดียว แล้วเปรียบเทียบแพ็กเกจความเร็วและราคาได้ทันที จากนั้นส่งคำขอให้ทีมงานติดต่อกลับ",
  ctaLabel: "ยืนยันเบอร์เพื่อดูแพ็กเกจ",
  heroImagePath: "",
  lineUrl: "",
  footerNote: "การสมัครใช้บริการจะดำเนินการโดยทีมงานหลังจากส่งคำขอ ระบบนี้ยังไม่ได้เชื่อมต่อการชำระเงิน",
  steps: [
    { title: "ยืนยันเบอร์มือถือ", description: "กรอกเบอร์แล้วรับรหัส OTP 6 หลักทาง SMS" },
    { title: "เลือกแพ็กเกจ", description: "เปรียบเทียบความเร็ว ปริมาณข้อมูล และราคาได้ในหน้าเดียว" },
    { title: "ทีมงานติดต่อกลับ", description: "ส่งคำขอแล้วทีมงานจะติดต่อกลับเพื่อดำเนินการต่อ" },
  ],
};

export type SiteContentResult<T> = { ok: true; value: T } | { ok: false; error: string };

const IMAGE_PATH = /^\/site\/[a-z0-9][a-z0-9-]{0,80}\.(png|jpe?g|webp)$/;
const HTTPS_URL = /^https:\/\/[^\s]{1,190}$/;

export function isSafeSiteImagePath(path: string): boolean {
  return path === "" || IMAGE_PATH.test(path);
}

// นับตัวอักษรแบบ grapheme (สระและวรรณยุกต์ไทยนับรวมกับพยัญชนะ)
const segmenter = new Intl.Segmenter("th", { granularity: "grapheme" });
export function countCharacters(value: string): number {
  let count = 0;
  for (const _ of segmenter.segment(value)) count++;
  return count;
}

function readText(
  source: Record<string, unknown>,
  key: string,
  label: string,
  min: number,
  max: number,
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
): SiteContentResult<string> {
  const raw = source[key];
  if (typeof raw !== "string") return { ok: false, error: `${label}: ต้องเป็นข้อความ` };
  const value = raw.trim();
  if (value.length === 0) {
    return allowEmpty ? { ok: true, value: "" } : { ok: false, error: `${label}: กรุณากรอก` };
  }
  const length = countCharacters(value);
  if (length < min || length > max) {
    return { ok: false, error: `${label}: ต้องมี ${min}–${max} ตัวอักษร` };
  }
  return { ok: true, value };
}

/** ตรวจความถูกต้องของเนื้อหาก่อนบันทึกและก่อน build หน้าบ้าน */
export function parseSiteContent(input: unknown): SiteContentResult<SiteContent> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "ข้อมูลเนื้อหาไม่ถูกต้อง" };
  }
  const source = input as Record<string, unknown>;

  const heroTitle = readText(source, "heroTitle", "หัวข้อหน้าแรก", 4, 80);
  if (!heroTitle.ok) return heroTitle;
  const heroSubtitle = readText(source, "heroSubtitle", "คำอธิบายหน้าแรก", 10, 240);
  if (!heroSubtitle.ok) return heroSubtitle;
  const ctaLabel = readText(source, "ctaLabel", "ข้อความปุ่ม", 2, 40);
  if (!ctaLabel.ok) return ctaLabel;
  const footerNote = readText(source, "footerNote", "ข้อความท้ายเว็บ", 0, 160, { allowEmpty: true });
  if (!footerNote.ok) return footerNote;

  const heroImagePath = typeof source.heroImagePath === "string" ? source.heroImagePath : "";
  if (!isSafeSiteImagePath(heroImagePath)) {
    return { ok: false, error: "รูปหน้าแรกต้องเป็นไฟล์ PNG, JPEG หรือ WebP ในโฟลเดอร์ /site" };
  }

  const lineUrl = typeof source.lineUrl === "string" ? source.lineUrl.trim() : "";
  if (lineUrl !== "" && !HTTPS_URL.test(lineUrl)) {
    return { ok: false, error: "ลิงก์ LINE ต้องขึ้นต้นด้วย https:// และยาวไม่เกิน 200 ตัวอักษร" };
  }

  if (!Array.isArray(source.steps) || source.steps.length !== SITE_CONTENT_STEP_COUNT) {
    return { ok: false, error: `ต้องมีขั้นตอน ${SITE_CONTENT_STEP_COUNT} ข้อ` };
  }
  const steps: SiteStep[] = [];
  for (let i = 0; i < SITE_CONTENT_STEP_COUNT; i++) {
    const item = source.steps[i];
    if (!item || typeof item !== "object") return { ok: false, error: `ขั้นตอนที่ ${i + 1}: ข้อมูลไม่ถูกต้อง` };
    const row = item as Record<string, unknown>;
    const title = readText(row, "title", `ขั้นตอนที่ ${i + 1} หัวข้อ`, 2, 40);
    if (!title.ok) return title;
    const description = readText(row, "description", `ขั้นตอนที่ ${i + 1} คำอธิบาย`, 5, 140);
    if (!description.ok) return description;
    steps.push({ title: title.value, description: description.value });
  }

  return {
    ok: true,
    value: {
      heroTitle: heroTitle.value,
      heroSubtitle: heroSubtitle.value,
      ctaLabel: ctaLabel.value,
      heroImagePath,
      lineUrl,
      footerNote: footerNote.value,
      steps,
    },
  };
}

/**
 * สร้าง path ใน repo จาก prefix และ path ย่อย
 * ปฏิเสธ path ที่มี .. หรือตัวอักษรแปลก เพื่อกันการเขียนไฟล์นอกโฟลเดอร์ที่กำหนด
 */
export function repoPathFor(prefix: string, relative: string): SiteContentResult<string> {
  const safePrefix = /^[a-z0-9][a-z0-9/_-]{0,100}$/.test(prefix) && !prefix.includes("..");
  if (!safePrefix) return { ok: false, error: "prefix ของ repo ไม่ถูกต้อง" };
  const safeRelative = /^[a-z0-9][a-z0-9/_.-]{0,160}$/.test(relative) && !relative.includes("..");
  if (!safeRelative) return { ok: false, error: "path ย่อยไม่ถูกต้อง" };
  return { ok: true, value: `${prefix}/${relative}` };
}

/** path ของไฟล์เนื้อหาใน repo */
export const SITE_CONTENT_FILE = "content/site-content.json";

/** path ของรูปใน repo จาก path ที่ใช้บนเว็บ เช่น /site/hero.webp → public/site/hero.webp */
export function repoImagePath(prefix: string, publicPath: string): SiteContentResult<string> {
  if (!isSafeSiteImagePath(publicPath) || publicPath === "") {
    return { ok: false, error: "path รูปไม่ถูกต้อง" };
  }
  return repoPathFor(prefix, `public${publicPath}`);
}
