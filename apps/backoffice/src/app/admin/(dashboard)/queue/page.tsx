import Link from "next/link";
import { connection } from "next/server";
import { confirmSignupResultAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import { CARD_CLASS, INPUT_CLASS, LABEL_CLASS, SECTION_TITLE_CLASS } from "@/components/admin/form-styles";
import { label, SIGNUP_OUTCOME_LABELS } from "@/lib/admin-labels";
import { formatDateTime } from "@pt/shared/format";
import { formatMoney } from "@/lib/admin-labels";
import { requireStaff } from "@/services/admin";
import { getSignupQueue } from "@/services/admin-data";

export default async function SignupQueuePage() {
  await connection();
  const staff = await requireStaff();
  const { processing, open } = await getSignupQueue();
  const orderNumberById = new Map(processing.map((o) => [o.id, o.order_number]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">คิวสมัครแพ็กเกจ</h1>
        <p className="mt-1 text-sm text-slate-600">
          งานที่ชำระเงินแล้วและกำลังรอการสมัคร คำสั่งซื้อจะปิดงานได้ก็ต่อเมื่อผู้ดูแลระบบยืนยันผลสำเร็จ
        </p>
      </div>

      <section className={`${CARD_CLASS} space-y-3`}>
        <h2 className={SECTION_TITLE_CLASS}>รอสมัคร ({processing.length})</h2>
        <ul className="divide-y divide-slate-100">
          {processing.map((order) => (
            <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <Link href={`/admin/orders/${order.id}`} className="font-medium text-slate-900 hover:text-indigo-700">
                  #{order.order_number} · {order.package_name_snapshot}
                </Link>
                <p className="text-xs text-slate-500">
                  {formatMoney(order.total_thb)} · รับเงินเมื่อ {formatDateTime(order.created_at)}
                </p>
              </div>
              <Link href={`/admin/orders/${order.id}`} className="text-sm font-medium text-indigo-700 hover:underline">
                บันทึกผล
              </Link>
            </li>
          ))}
          {processing.length === 0 ? <li className="py-6 text-center text-sm text-slate-500">ไม่มีงานรอสมัคร</li> : null}
        </ul>
      </section>

      <section className={`${CARD_CLASS} space-y-3`}>
        <h2 className={SECTION_TITLE_CLASS}>รอยืนยันผลการสมัคร ({open.length})</h2>
        {open.length === 0 ? <p className="text-sm text-slate-500">ไม่มีผลที่รอยืนยัน</p> : null}
        <ul className="space-y-4">
          {open.map((result) => {
            const canConfirm = staff.role === "admin" && result.recorded_by !== staff.id;
            return (
              <li key={result.id} className="space-y-2 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="text-sm font-semibold text-slate-900">
                  #{orderNumberById.get(result.order_id) ?? "-"} · {label(SIGNUP_OUTCOME_LABELS, result.outcome)}
                </p>
                <p className="text-sm text-slate-700">{result.note}</p>
                <p className="text-xs text-slate-500">บันทึกเมื่อ {formatDateTime(result.recorded_at)}</p>
                {canConfirm ? (
                  <ActionForm
                    action={confirmSignupResultAction}
                    submitLabel="ยืนยันผล"
                    confirmMessage={result.outcome === "success" ? "ยืนยันว่าเปิดใช้งานสำเร็จแล้ว? จะปิดงานคำสั่งซื้อ" : "ยืนยันผลนี้?"}
                  >
                    <input type="hidden" name="result_id" value={result.id} />
                    <div className="space-y-1.5">
                      <label className={LABEL_CLASS} htmlFor={`cn-${result.id}`}>หมายเหตุ (ไม่บังคับ)</label>
                      <input id={`cn-${result.id}`} name="confirm_note" maxLength={1000} className={INPUT_CLASS} />
                    </div>
                  </ActionForm>
                ) : (
                  <p className="text-xs text-slate-500">
                    {staff.role === "admin" ? "ผู้บันทึกไม่สามารถยืนยันผลของตัวเองได้" : "เฉพาะผู้ดูแลระบบที่ยืนยันผลได้"}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
