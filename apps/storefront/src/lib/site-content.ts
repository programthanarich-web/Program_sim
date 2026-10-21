import { parseSiteContent, type SiteContent } from "@pt/shared/site-content";
import rawSiteContent from "../../content/site-content.json";

// อ่านเนื้อหาตอน build ไม่มีการเรียกเครือข่ายตอนลูกค้าเปิดหน้า
// ถ้าไฟล์ไม่ถูกต้อง build จะล้มทันที เพื่อไม่ให้เนื้อหาผิดขึ้นเว็บจริง
const parsed = parseSiteContent(rawSiteContent);
if (!parsed.ok) {
  throw new Error(`content/site-content.json ไม่ถูกต้อง: ${parsed.error}`);
}

export const siteContent: SiteContent = parsed.value;
