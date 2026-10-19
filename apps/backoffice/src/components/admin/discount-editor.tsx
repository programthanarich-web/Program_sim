import { saveDiscountAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import { INPUT_CLASS, LABEL_CLASS } from "@/components/admin/form-styles";
import type { DiscountRecord } from "@/services/admin-data";

/** แปลง ISO เป็นค่าของ datetime-local ในเขตเวลาไทย */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const bangkok = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  return bangkok.toISOString().slice(0, 16);
}

export function DiscountEditor({ discount }: { discount: DiscountRecord | null }) {
  return (
    <ActionForm action={saveDiscountAction} submitLabel={discount ? "บันทึกการแก้ไข" : "เพิ่มรหัสส่วนลด"}>
      <input type="hidden" name="id" value={discount?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className={LABEL_CLASS} htmlFor="disc-code">รหัสส่วนลด</label>
          <input id="disc-code" name="code" required maxLength={32} defaultValue={discount?.code} className={INPUT_CLASS} />
        </div>
        <div className="space-y-1.5">
          <label className={LABEL_CLASS} htmlFor="disc-type">ประเภท</label>
          <select id="disc-type" name="discount_type" defaultValue={discount?.discount_type ?? "fixed"} className={INPUT_CLASS}>
            <option value="fixed">ลดเป็นบาท</option>
            <option value="percent">ลดเป็นเปอร์เซ็นต์</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={LABEL_CLASS} htmlFor="disc-value">มูลค่าส่วนลด</label>
          <input id="disc-value" name="discount_value" inputMode="decimal" required defaultValue={discount?.discount_value} className={INPUT_CLASS} />
        </div>
        <div className="space-y-1.5">
          <label className={LABEL_CLASS} htmlFor="disc-max">จำนวนครั้งสูงสุด (เว้นว่าง = ไม่จำกัด)</label>
          <input id="disc-max" name="max_uses" type="number" min={1} defaultValue={discount?.max_uses ?? ""} className={INPUT_CLASS} />
        </div>
        <div className="space-y-1.5">
          <label className={LABEL_CLASS} htmlFor="disc-from">เริ่มใช้ได้ (เวลาไทย)</label>
          <input id="disc-from" name="valid_from" type="datetime-local" defaultValue={toLocalInput(discount?.valid_from ?? null)} className={INPUT_CLASS} />
        </div>
        <div className="space-y-1.5">
          <label className={LABEL_CLASS} htmlFor="disc-until">หมดอายุ (เวลาไทย, เว้นว่าง = ไม่หมด)</label>
          <input id="disc-until" name="valid_until" type="datetime-local" defaultValue={toLocalInput(discount?.valid_until ?? null)} className={INPUT_CLASS} />
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" name="is_active" defaultChecked={discount?.is_active ?? true} className="h-5 w-5 rounded" />
        เปิดใช้งานรหัสนี้
      </label>
    </ActionForm>
  );
}
