import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { CUSTOMER_ORDER_STATUS_LABELS, CUSTOMER_PAYMENT_STATUS_LABELS } from "@/lib/customer-labels";
import { formatBaht } from "@pt/shared/format";
import { getCustomerSession } from "@/services/customer-auth";
import { listMyOrders } from "@/services/customer-orders";

export const metadata: Metadata = {
  title: "คำสั่งซื้อของฉัน",
};

export default function OrdersPage() {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<p className="px-4 py-8 text-sm text-slate-500">กำลังโหลดคำสั่งซื้อ...</p>}>
        <OrdersContent />
      </Suspense>
    </>
  );
}

async function OrdersContent() {
  await connection();
  const customer = await getCustomerSession();
  if (!customer) redirect("/verify-phone");

  const orders = await listMyOrders();

  return (
    <>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">คำสั่งซื้อของฉัน</h1>
          <Link href="/packages" className="text-sm font-medium text-indigo-700 hover:underline">เลือกแพ็กเกจ</Link>
        </div>

        {orders.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-center text-slate-600 ring-1 ring-slate-200">
            ยังไม่มีคำสั่งซื้อ
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((order) => (
              <li key={order.orderId}>
                <Link
                  href={`/orders/${order.orderId}`}
                  className="block rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 hover:ring-indigo-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">คำสั่งซื้อ #{order.orderNumber}</p>
                      <p className="text-sm text-slate-600">{order.packageName}</p>
                    </div>
                    <p className="font-semibold text-indigo-900">{formatBaht(order.totalThb)}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">
                    {CUSTOMER_ORDER_STATUS_LABELS[order.status] ?? order.status}
                    {order.latestPaymentStatus
                      ? ` · ${CUSTOMER_PAYMENT_STATUS_LABELS[order.latestPaymentStatus] ?? order.latestPaymentStatus}`
                      : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
