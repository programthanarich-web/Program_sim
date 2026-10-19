import { connection } from "next/server";
import { PaymentReceivingEditor } from "@/components/admin/payment-receiving-editor";
import { CARD_CLASS, SECTION_TITLE_CLASS } from "@/components/admin/form-styles";
import { requireStaff } from "@/services/admin";
import { createQrPreviewUrl, getPaymentReceiving } from "@/services/payment-receiving";

export default async function PaymentSettingsPage() {
  await connection();
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const current = await getPaymentReceiving();
  const qrUrl = current.qrPath ? await createQrPreviewUrl(current.qrPath) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">ค่ารับเงิน</h1>
        <p className="mt-1 text-sm text-slate-600">
          ชื่อธนาคาร เลขบัญชี และ QR ที่ลูกค้าใช้โอนเงิน การแก้ไขมีผลกับคำสั่งซื้อใหม่เท่านั้น
        </p>
      </div>

      <section className={`${CARD_CLASS} grid gap-4 sm:grid-cols-2`}>
        <div className="space-y-2">
          <h2 className={SECTION_TITLE_CLASS}>ค่าปัจจุบัน</h2>
          <dl className="space-y-1 text-sm">
            <div><dt className="inline text-slate-500">ธนาคาร: </dt><dd className="inline text-slate-900">{current.bankName || "-"}</dd></div>
            <div><dt className="inline text-slate-500">ชื่อบัญชี: </dt><dd className="inline text-slate-900">{current.accountName || "-"}</dd></div>
            <div><dt className="inline text-slate-500">เลขบัญชี: </dt><dd className="inline font-mono text-slate-900">{current.accountNumber || "-"}</dd></div>
          </dl>
        </div>
        <div className="space-y-2">
          <h2 className={SECTION_TITLE_CLASS}>QR ปัจจุบัน</h2>
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrUrl} alt="QR รับเงินปัจจุบัน" className="h-48 w-48 rounded-xl bg-white object-contain ring-1 ring-slate-200" />
          ) : (
            <p className="text-sm text-slate-500">ยังไม่ได้อัปโหลด QR</p>
          )}
          <p className="text-xs text-slate-500">ลิงก์ดูภาพมีอายุ 60 วินาที รีเฟรชหน้าเพื่อดูอีกครั้ง</p>
        </div>
      </section>

      {isAdmin ? (
        <section className={`${CARD_CLASS} space-y-4`}>
          <h2 className={SECTION_TITLE_CLASS}>แก้ไขค่ารับเงิน</h2>
          <PaymentReceivingEditor current={current} />
        </section>
      ) : (
        <p className="text-sm text-slate-500">เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขค่ารับเงินได้</p>
      )}
    </div>
  );
}
