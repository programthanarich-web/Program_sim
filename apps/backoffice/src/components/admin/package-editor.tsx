import { savePackageAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import { INPUT_CLASS, LABEL_CLASS } from "@/components/admin/form-styles";
import type { PackageRecord } from "@/services/admin-data";

/** ฟอร์มเพิ่ม/แก้ไขแพ็กเกจ: การแก้ราคาไม่กระทบคำสั่งซื้อเดิมเพราะมี snapshot */
export function PackageEditor({ pkg }: { pkg: PackageRecord | null }) {
  const id = pkg?.id ?? "";
  return (
    <ActionForm action={savePackageAction} submitLabel={pkg ? "บันทึกการแก้ไข" : "เพิ่มแพ็กเกจ"}>
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="name" label="ชื่อแพ็กเกจ" required maxLength={80} defaultValue={pkg?.name} />
        <Input name="code" label="รหัส (ภาษาอังกฤษ ตัวเลข -)" required maxLength={40} defaultValue={pkg?.code} />
        <Input name="speed_mbps" label="ความเร็ว (Mbps)" type="number" min={1} max={10000} required defaultValue={pkg?.speed_mbps} />
        <Input name="data_quota_gb" label="ปริมาณข้อมูล (GB) เว้นว่าง = ไม่จำกัด" type="number" min={0} defaultValue={pkg?.data_quota_gb ?? ""} />
        <Input name="price_thb" label="ราคา (บาท)" inputMode="decimal" required defaultValue={pkg?.price_thb} />
        <Input name="duration_days" label="อายุ (วัน)" type="number" min={1} max={3650} required defaultValue={pkg?.duration_days} />
        <Input name="sort_order" label="ลำดับแสดงผล" type="number" min={0} max={9999} defaultValue={pkg?.sort_order ?? 0} />
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" name="is_active" defaultChecked={pkg?.is_active ?? true} className="h-5 w-5 rounded" />
          เปิดขายแพ็กเกจนี้
        </label>
      </div>
      <div className="space-y-1.5">
        <label className={LABEL_CLASS} htmlFor="pkg-description">รายละเอียด (ไม่บังคับ)</label>
        <textarea id="pkg-description" name="description" rows={2} maxLength={300} defaultValue={pkg?.description ?? ""} className={INPUT_CLASS} />
      </div>
    </ActionForm>
  );
}

function Input({
  name,
  label,
  ...props
}: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label className={LABEL_CLASS} htmlFor={`pkg-${name}`}>{label}</label>
      <input id={`pkg-${name}`} name={name} className={INPUT_CLASS} {...props} />
    </div>
  );
}
