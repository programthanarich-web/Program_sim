import { connection } from "next/server";
import { SiteContentForm } from "@/components/admin/site-content-form";
import { CARD_CLASS, SECTION_TITLE_CLASS } from "@/components/admin/form-styles";
import { GitHubContentError, readSiteContentFile } from "@/lib/github-content";
import { requireStaff } from "@/services/admin";
import { DEFAULT_SITE_CONTENT, parseSiteContent, type SiteContent } from "@pt/shared/site-content";

async function loadCurrent(): Promise<{ content: SiteContent; sha: string; notice: string | null }> {
  try {
    const file = await readSiteContentFile();
    if (!file) return { content: DEFAULT_SITE_CONTENT, sha: "", notice: null };
    const parsed = parseSiteContent(JSON.parse(file.text));
    if (!parsed.ok) {
      return { content: DEFAULT_SITE_CONTENT, sha: file.sha, notice: `ไฟล์เนื้อหาใน GitHub ไม่ถูกต้อง: ${parsed.error}` };
    }
    return { content: parsed.value, sha: file.sha, notice: null };
  } catch (error) {
    const message =
      error instanceof GitHubContentError ? error.message : "อ่านเนื้อหาหน้าบ้านไม่สำเร็จ";
    return { content: DEFAULT_SITE_CONTENT, sha: "", notice: message };
  }
}

export default async function SitePage() {
  await connection();
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const { content, sha, notice } = await loadCurrent();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">หน้าเว็บหน้าบ้าน</h1>
        <p className="mt-1 text-sm text-slate-600">
          ข้อความและรูปของหน้าแรกที่ลูกค้าเห็น การบันทึกจะเขียนลง GitHub แล้วหน้าบ้านจะอัปเดตหลัง deploy เสร็จ
          ข้อมูลคำสั่งซื้อ สลิป และข้อมูลลูกค้าไม่ถูกส่งไป GitHub
        </p>
      </div>

      {notice ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">{notice}</p>
      ) : null}

      <section className={`${CARD_CLASS} space-y-4`}>
        <h2 className={SECTION_TITLE_CLASS}>{isAdmin ? "แก้ไขเนื้อหา" : "เนื้อหาปัจจุบัน"}</h2>
        {isAdmin ? (
          <SiteContentForm current={content} expectedSha={sha} />
        ) : (
          <>
            <p className="text-sm text-slate-500">เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขหน้าเว็บหน้าบ้านได้</p>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-slate-500">หัวข้อหลัก</dt><dd className="text-slate-900">{content.heroTitle}</dd></div>
              <div><dt className="text-slate-500">คำอธิบาย</dt><dd className="text-slate-900">{content.heroSubtitle}</dd></div>
              <div><dt className="text-slate-500">ปุ่มหลัก</dt><dd className="text-slate-900">{content.ctaLabel}</dd></div>
            </dl>
          </>
        )}
      </section>
    </div>
  );
}
