import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  cancelOrderAction,
  confirmSignupResultAction,
  getSlipUrlAction,
  recordSignupResultAction,
  reviewPaymentAction,
} from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import { StatusBadge } from "@/components/admin/status-badge";
import { CARD_CLASS, INPUT_CLASS, LABEL_CLASS, SECTION_TITLE_CLASS } from "@/components/admin/form-styles";
import {
  formatMoney,
  label,
  NOTIFICATION_STATUS_LABELS,
  NOTIFICATION_TEMPLATE_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  PAYMENT_STATUS_LABELS,
  SIGNUP_OUTCOME_LABELS,
} from "@/lib/admin-labels";
import { formatDateTime, formatQuota } from "@pt/shared/format";
import { isUuid } from "@pt/shared/validation";
import { requireStaff } from "@/services/admin";
import { getOrderDetail } from "@/services/admin-data";

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: "โอนเงินผ่านธนาคาร",
  promptpay: "PromptPay",
};

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const staff = await requireStaff();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const detail = await getOrderDetail(id);
  if (!detail) notFound();
  const { order, payments, slips, signupResults, events, notifications } = detail;

  const isAdmin = staff.role === "admin";
  const openResult = signupResults.find((r) => r.confirmed_at === null) ?? null;
  const isProcessing = order.order_status === "processing";
  const isOpen = order.order_status === "pending" || isProcessing;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/orders" className="text-sm text-indigo-700 hover:underline">
            ← กลับไปคำสั่งซื้อ
          </Link>
          <h1 className="mt-1 text-xl font-bold text-slate-900">คำสั่งซื้อ #{order.order_number}</h1>
        </div>
        <StatusBadge label={label(ORDER_STATUS_LABELS, order.order_status)} className={ORDER_STATUS_STYLES[order.order_status]} />
      </div>

      <section className={`${CARD_CLASS} grid gap-4 sm:grid-cols-2`}>
        <div>
          <h2 className={SECTION_TITLE_CLASS}>แพ็กเกจและราคา (ค่า ณ เวลาสั่งซื้อ)</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row term="แพ็กเกจ" value={`${order.package_name_snapshot} (${order.package_code_snapshot})`} />
            <Row term="ความเร็ว" value={`${order.speed_mbps_snapshot} Mbps`} />
            <Row term="ปริมาณข้อมูล" value={formatQuota(order.data_quota_gb_snapshot)} />
            <Row term="อายุ" value={`${order.duration_days_snapshot} วัน`} />
            <Row term="ราคาเต็ม" value={formatMoney(order.unit_price_thb)} />
            <Row
              term="ส่วนลด"
              value={order.discount_code_snapshot ? `${order.discount_code_snapshot} (−${formatMoney(order.discount_amount_thb)})` : "ไม่มี"}
            />
            <Row term="ยอดที่ต้องชำระ" value={formatMoney(order.total_thb)} strong />
          </dl>
        </div>
        <div>
          <h2 className={SECTION_TITLE_CLASS}>ลูกค้า</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row term="เบอร์โทร (ปิดบางส่วน)" value={order.customer_phone_masked} />
            <Row term="สั่งเมื่อ" value={formatDateTime(order.created_at)} />
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            ระบบไม่แสดงชื่อ เบอร์เต็ม หรือที่อยู่ของลูกค้าในหน้านี้ ตรวจยืนยันตัวตนตามขั้นตอนของร้าน
          </p>
        </div>
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <h2 className={SECTION_TITLE_CLASS}>การชำระเงิน</h2>
        {payments.length === 0 ? <p className="text-sm text-slate-500">ยังไม่มีการแจ้งชำระ</p> : null}
        {payments.map((payment) => {
          const hasSlip = slips.some((s) => s.payment_id === payment.id);
          const amountMismatch = Math.abs(payment.amount_thb - order.total_thb) > 0.001;
          return (
            <article key={payment.id} className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {METHOD_LABELS[payment.method] ?? payment.method} · {formatMoney(payment.amount_thb)}
                </p>
                <StatusBadge label={label(PAYMENT_STATUS_LABELS, payment.status)} />
              </div>
              <dl className="grid gap-1 text-sm sm:grid-cols-2">
                <Row term="เลขอ้างอิงที่ลูกค้ากรอก" value={payment.reference_no} />
                <Row term="แจ้งเมื่อ" value={formatDateTime(payment.created_at)} />
              </dl>
              {amountMismatch ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
                  ยอดที่แจ้งไม่ตรงกับยอดคำสั่งซื้อ ({formatMoney(order.total_thb)}) ตรวจสอบกับสลิปก่อนดำเนินการ
                </p>
              ) : null}
              {payment.rejection_reason ? (
                <p className="text-sm text-rose-700">เหตุผลที่ปฏิเสธ: {payment.rejection_reason}</p>
              ) : null}

              {hasSlip ? (
                <ActionForm action={getSlipUrlAction} submitLabel="เปิดดูสลิป" variant="secondary">
                  <input type="hidden" name="payment_id" value={payment.id} />
                </ActionForm>
              ) : (
                <p className="text-sm text-slate-500">ไม่มีไฟล์สลิปแนบ</p>
              )}

              {payment.status === "pending_review" ? (
                <div className="grid gap-4 border-t border-slate-200 pt-4 md:grid-cols-2">
                  <ActionForm
                    action={reviewPaymentAction}
                    submitLabel="ยืนยันการรับเงิน"
                    confirmMessage="ยืนยันว่าตรวจสลิปแล้ว และยอดในสลิปตรงกับยอดคำสั่งซื้อ?"
                  >
                    <input type="hidden" name="payment_id" value={payment.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <p className="text-xs text-slate-500">
                      การยืนยันต้องมาจากการตรวจสลิปของพนักงานเท่านั้น ระบบไม่อนุมัติจากรูปสลิปหรือ OCR
                    </p>
                  </ActionForm>
                  <ActionForm
                    action={reviewPaymentAction}
                    submitLabel="ปฏิเสธการชำระ"
                    variant="secondary"
                    confirmMessage="ปฏิเสธรายการชำระเงินนี้?"
                  >
                    <input type="hidden" name="payment_id" value={payment.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <div className="space-y-1.5">
                      <label className={LABEL_CLASS} htmlFor={`reason-${payment.id}`}>เหตุผล (จำเป็น)</label>
                      <input id={`reason-${payment.id}`} name="reason" required className={INPUT_CLASS} />
                    </div>
                  </ActionForm>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      <section className={`${CARD_CLASS} space-y-4`}>
        <h2 className={SECTION_TITLE_CLASS}>ผลการสมัครแพ็กเกจ</h2>

        {isProcessing && !openResult ? (
          <ActionForm action={recordSignupResultAction} submitLabel="บันทึกผลการสมัคร" variant="primary">
            <input type="hidden" name="order_id" value={order.id} />
            <div className="space-y-1.5">
              <label className={LABEL_CLASS} htmlFor="outcome">ผลการสมัคร</label>
              <select id="outcome" name="outcome" className={INPUT_CLASS} defaultValue="success">
                <option value="success">สำเร็จ</option>
                <option value="needs_info">ต้องการข้อมูลเพิ่ม</option>
                <option value="failed">ไม่สำเร็จ</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={LABEL_CLASS} htmlFor="note">หมายเหตุ (จำเป็น)</label>
              <textarea id="note" name="note" required rows={3} maxLength={1000} className={INPUT_CLASS} />
            </div>
          </ActionForm>
        ) : null}

        {openResult ? (
          <div className="space-y-3 rounded-xl bg-indigo-50 p-4 ring-1 ring-inset ring-indigo-200">
            <p className="text-sm font-semibold text-indigo-900">
              รอยืนยัน: {label(SIGNUP_OUTCOME_LABELS, openResult.outcome)} — {openResult.note}
            </p>
            {isAdmin && openResult.recorded_by !== staff.id ? (
              <ActionForm
                action={confirmSignupResultAction}
                submitLabel="ยืนยันผลการสมัคร"
                confirmMessage={
                  openResult.outcome === "success"
                    ? "ยืนยันว่าแพ็กเกจเปิดใช้งานสำเร็จแล้ว? การยืนยันนี้จะปิดงานคำสั่งซื้อ"
                    : "ยืนยันผลการสมัครนี้?"
                }
              >
                <input type="hidden" name="result_id" value={openResult.id} />
                <div className="space-y-1.5">
                  <label className={LABEL_CLASS} htmlFor="confirm_note">หมายเหตุการยืนยัน (ไม่บังคับ)</label>
                  <input id="confirm_note" name="confirm_note" maxLength={1000} className={INPUT_CLASS} />
                </div>
              </ActionForm>
            ) : (
              <p className="text-xs text-indigo-800">
                ผู้ยืนยันต้องเป็นผู้ดูแลระบบที่ไม่ใช่ผู้บันทึกผลนี้
              </p>
            )}
          </div>
        ) : null}

        {order.order_status === "activated" ? (
          <p className="text-sm text-emerald-800">เปิดใช้งานแล้ว (ผ่านการยืนยันของผู้ดูแลระบบ)</p>
        ) : null}

        <ul className="divide-y divide-slate-100 text-sm">
          {signupResults.map((result) => (
            <li key={result.id} className="py-3">
              <p className="font-medium text-slate-900">
                {label(SIGNUP_OUTCOME_LABELS, result.outcome)} · บันทึก {formatDateTime(result.recorded_at)}
              </p>
              <p className="text-slate-600">{result.note}</p>
              <p className="text-xs text-slate-500">
                {result.confirmed_at
                  ? `ยืนยันแล้ว ${formatDateTime(result.confirmed_at)}${result.confirm_note ? ` · ${result.confirm_note}` : ""}`
                  : "ยังไม่ได้ยืนยัน"}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {isOpen ? (
        <section className={`${CARD_CLASS} space-y-3`}>
          <h2 className={SECTION_TITLE_CLASS}>ยกเลิกคำสั่งซื้อ</h2>
          {isProcessing && !isAdmin ? (
            <p className="text-sm text-slate-500">เฉพาะผู้ดูแลระบบเท่านั้นที่ยกเลิกคำสั่งซื้อที่กำลังดำเนินการได้</p>
          ) : (
            <ActionForm
              action={cancelOrderAction}
              submitLabel="ยกเลิกคำสั่งซื้อ"
              variant="secondary"
              confirmMessage="ยืนยันการยกเลิกคำสั่งซื้อนี้?"
            >
              <input type="hidden" name="order_id" value={order.id} />
              <div className="space-y-1.5">
                <label className={LABEL_CLASS} htmlFor="cancel_reason">เหตุผล (จำเป็น)</label>
                <input id="cancel_reason" name="reason" required className={INPUT_CLASS} />
              </div>
            </ActionForm>
          )}
        </section>
      ) : null}

      <section className={`${CARD_CLASS} space-y-3`}>
        <h2 className={SECTION_TITLE_CLASS}>ประวัติการดำเนินการ</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {events.map((event) => (
            <li key={event.id} className="py-2">
              <span className="font-medium text-slate-900">{event.event_type}</span>
              {event.to_value ? <span className="text-slate-600"> → {event.to_value}</span> : null}
              {event.reason ? <span className="text-slate-500"> · {event.reason}</span> : null}
              <span className="block text-xs text-slate-500">{formatDateTime(event.created_at)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${CARD_CLASS} space-y-3`}>
        <h2 className={SECTION_TITLE_CLASS}>การแจ้งเตือนที่เกี่ยวกับคำสั่งซื้อนี้</h2>
        {notifications.length === 0 ? <p className="text-sm text-slate-500">ยังไม่มีการแจ้งเตือน</p> : null}
        <ul className="divide-y divide-slate-100 text-sm">
          {notifications.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {label(NOTIFICATION_TEMPLATE_LABELS, n.template)} · {label(NOTIFICATION_STATUS_LABELS, n.status)}
                {n.attempts > 0 ? ` (ครั้งที่ ${n.attempts})` : ""}
              </span>
              <span className="text-xs text-slate-500">{formatDateTime(n.created_at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Row({ term, value, strong = false }: { term: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3">
      <dt className="text-slate-500">{term}</dt>
      <dd className={strong ? "font-semibold text-slate-900" : "text-slate-800"}>{value}</dd>
    </div>
  );
}
