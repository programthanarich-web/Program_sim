"use client";

import { ActionForm } from "@/components/admin/action-form";
import { INPUT_CLASS, LABEL_CLASS } from "@/components/admin/form-styles";
import { saveSiteContentAction } from "@/app/actions/site-content";
import { SITE_CONTENT_STEP_COUNT, type SiteContent } from "@pt/shared/site-content";

interface SiteContentFormProps {
  current: SiteContent;
  /** sha ของไฟล์ปัจจุบันใน repo ใช้กันการเขียนทับ (ว่างถ้ายังไม่มีไฟล์) */
  expectedSha: string;
}

const STEP_INDEXES = Array.from({ length: SITE_CONTENT_STEP_COUNT }, (_, i) => i);

/** ฟอร์มแก้ไขหน้าเว็บหน้าบ้าน บันทึกผ่าน server action ไป GitHub */
export function SiteContentForm({ current, expectedSha }: SiteContentFormProps) {
  return (
    <ActionForm action={saveSiteContentAction} submitLabel="บันทึกและเผยแพร่หน้าบ้าน" pendingLabel="กำลังบันทึก...">
      <input type="hidden" name="expectedSha" value={expectedSha} />

      <div>
        <label htmlFor="heroTitle" className={LABEL_CLASS}>หัวข้อหลัก</label>
        <input id="heroTitle" name="heroTitle" defaultValue={current.heroTitle} required className={INPUT_CLASS} />
      </div>

      <div>
        <label htmlFor="heroSubtitle" className={LABEL_CLASS}>คำอธิบายใต้หัวข้อ</label>
        <textarea id="heroSubtitle" name="heroSubtitle" defaultValue={current.heroSubtitle} required rows={3} className={INPUT_CLASS} />
      </div>

      <div>
        <label htmlFor="ctaLabel" className={LABEL_CLASS}>ข้อความปุ่มหลัก</label>
        <input id="ctaLabel" name="ctaLabel" defaultValue={current.ctaLabel} required className={INPUT_CLASS} />
      </div>

      <div>
        <label htmlFor="lineUrl" className={LABEL_CLASS}>ลิงก์ LINE (https เท่านั้น เว้นว่างได้)</label>
        <input id="lineUrl" name="lineUrl" type="url" defaultValue={current.lineUrl} className={INPUT_CLASS} />
      </div>

      <fieldset className="space-y-3">
        <legend className={LABEL_CLASS}>ขั้นตอนการสมัคร (3 ขั้น)</legend>
        {STEP_INDEXES.map((i) => (
          <div key={i} className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <p className="text-xs font-semibold text-slate-500">ขั้นที่ {i + 1}</p>
            <input
              name={`stepTitle${i}`}
              aria-label={`หัวข้อขั้นที่ ${i + 1}`}
              defaultValue={current.steps[i]?.title ?? ""}
              required
              className={INPUT_CLASS}
            />
            <textarea
              name={`stepDescription${i}`}
              aria-label={`รายละเอียดขั้นที่ ${i + 1}`}
              defaultValue={current.steps[i]?.description ?? ""}
              required
              rows={2}
              className={INPUT_CLASS}
            />
          </div>
        ))}
      </fieldset>

      <div>
        <label htmlFor="footerNote" className={LABEL_CLASS}>ข้อความท้ายหน้า (เว้นว่างได้)</label>
        <input id="footerNote" name="footerNote" defaultValue={current.footerNote} className={INPUT_CLASS} />
      </div>

      <div className="space-y-2">
        <label htmlFor="heroImage" className={LABEL_CLASS}>รูปหน้าแรก (PNG, JPEG หรือ WebP ไม่เกิน 1.5 MB)</label>
        {current.heroImagePath ? (
          <p className="text-xs text-slate-500">รูปปัจจุบัน: {current.heroImagePath}</p>
        ) : null}
        <input id="heroImage" name="heroImage" type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm" />
        {current.heroImagePath ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="removeHeroImage" className="h-4 w-4" />
            ลบรูปหน้าแรกออก
          </label>
        ) : null}
      </div>
    </ActionForm>
  );
}
