import { savePaymentReceivingAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import { INPUT_CLASS, LABEL_CLASS } from "@/components/admin/form-styles";
import type { PaymentReceiving } from "@/services/payment-receiving";

export function PaymentReceivingEditor({ current }: { current: PaymentReceiving }) {
  return (
    <ActionForm action={savePaymentReceivingAction} submitLabel="บันทึกค่ารับเงิน">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="bank_name" label="ชื่อธนาคาร" defaultValue={current.bankName} required maxLength={80} />
        <Field id="account_name" label="ชื่อบัญชี" defaultValue={current.accountName} required maxLength={120} />
        <Field
          id="account_number"
          label="เลขบัญชี (ตัวเลข 10–15 หลัก อาจมีขีด)"
          defaultValue={current.accountNumber}
          required
          inputMode="numeric"
        />
      </div>
      <div className="space-y-1.5">
        <label className={LABEL_CLASS} htmlFor="qr">ไฟล์ QR รับเงิน (ไม่บังคับ: เว้นว่างเพื่อใช้ไฟล์เดิม)</label>
        <input
          id="qr"
          name="qr"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-white"
        />
        <p className="text-xs text-slate-500">รองรับ PNG, JPG, WebP ขนาดไม่เกิน 1 MB</p>
      </div>
    </ActionForm>
  );
}

function Field({
  id,
  label,
  ...props
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label className={LABEL_CLASS} htmlFor={id}>{label}</label>
      <input id={id} name={id} className={INPUT_CLASS} {...props} />
    </div>
  );
}
