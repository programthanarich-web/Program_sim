import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { SlipUploadForm } from "@/components/customer/slip-upload-form";
import { SiteHeader } from "@/components/site-header";
import { CUSTOMER_ORDER_STATUS_LABELS, CUSTOMER_PAYMENT_STATUS_LABELS } from "@/lib/customer-labels";
import { formatBaht, formatQuota } from "@pt/shared/format";
import { isUuid } from "@pt/shared/validation";
import { getCustomerSession } from "@/services/customer-auth";
import { getMyOrder, getPaymentInstructions, listMyOrders } from "@/services/customer-orders";

export const metadata: Metadata = {
  title: "รายละเอียดคำสั่งซื้อ",
};

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<p className="px-4 py-8 text-sm text-slate-500">กำลังโหลดคำสั่งซื้อ...</p>}>
        <OrderDetailContent params={params} />
      </Suspense>
    </>
  );
}

async function OrderDetailContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const customer = await getCustomerSession();
  if (!customer) redirect("/verify-phone");

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const order = await getMyOrder(id);
  if (!order) notFound();

  // สถานะการชำระเงินล่าสุดมาจาก my_orders (ตาราง payments เปิดให้พนักงานเท่านั้น)
  const latest = (await listMyOrders()).find((row) => row.orderId === id);
  const paymentStatus = latest?.latestPaymentStatus ?? null;
  const awaitingSlip = order.status === "pending" && (paymentStatus === null || paymentStatus === "rejected");
  const instructions = order.status === "pending" ? await getPaymentInstructions() : null;

  return (
    <>
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">คำสั่งซื้อ #{order.orderNumber}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{order.packageName}</h1>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-slate-500">ความเร็ว</dt>
              <dd className="font-semibold text-slate-900">{order.speedMbps} Mbps</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-slate-500">ปริมาณข้อมูล</dt>
              <dd className="font-semibold text-slate-900">{formatQuota(order.dataQuotaGb)}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-slate-500">ระยะเวลา</dt>
              <dd className="font-semibold text-slate-900">{order.durationDays} วัน</dd>
            </div>
            <div className="rounded-xl bg-indigo-50 p-3">
              <dt className="text-indigo-700">ยอดชำระ</dt>
              <dd className="font-bold text-indigo-900">{formatBaht(order.totalThb)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-slate-700">
            สถานะ: <span className="font-semibold">{CUSTOMER_ORDER_STATUS_LABELS[order.status] ?? order.status}</span>
            {paymentStatus ? (
              <>
                {" "}· การชำระเงิน:{" "}
                <span className="font-semibold">{CUSTOMER_PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus}</span>
              </>
            ) : null}
          </p>
        </section>

        {awaitingSlip ? (
          <section className="space-y-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">ชำระเงิน</h2>
            {instructions ? (
              <div className="space-y-3 text-sm text-slate-700">
                <p>โอนยอด <span className="font-bold">{formatBaht(order.totalThb)}</span> ไปยังบัญชี</p>
                <dl className="space-y-1 rounded-xl bg-slate-50 p-4">
                  <div><dt className="inline text-slate-500">ธนาคาร: </dt><dd className="inline font-semibold">{instructions.bankName || "-"}</dd></div>
                  <div><dt className="inline text-slate-500">ชื่อบัญชี: </dt><dd className="inline font-semibold">{instructions.accountName || "-"}</dd></div>
                  <div><dt className="inline text-slate-500">เลขบัญชี: </dt><dd className="inline font-semibold">{instructions.accountNumber || "-"}</dd></div>
                </dl>
                {instructions.qrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- ลิงก์ชั่วคราวจาก Supabase Storage
                  <img src={instructions.qrUrl} alt="QR สำหรับรับเงิน" className="mx-auto w-56 rounded-xl ring-1 ring-slate-200" />
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-600">ยังไม่มีข้อมูลบัญชีรับเงิน กรุณาติดต่อทีมงาน</p>
            )}
            <SlipUploadForm orderId={order.id} />
          </section>
        ) : null}
      </main>
    </>
  );
}
