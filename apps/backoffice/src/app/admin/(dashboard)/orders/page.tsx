import Link from "next/link";
import { connection } from "next/server";
import { StatusBadge } from "@/components/admin/status-badge";
import { CARD_CLASS, INPUT_CLASS } from "@/components/admin/form-styles";
import { label, ORDER_FILTERS, ORDER_STATUS_LABELS, ORDER_STATUS_STYLES } from "@/lib/admin-labels";
import { formatDateTime } from "@pt/shared/format";
import { formatMoney } from "@/lib/admin-labels";
import { requireStaff } from "@/services/admin";
import { listOrders } from "@/services/admin-data";

interface PageProps {
  searchParams: Promise<{ status?: string; no?: string }>;
}

export default async function OrdersPage({ searchParams }: PageProps) {
  await connection();
  await requireStaff();

  const { status = "", no = "" } = await searchParams;
  const orderNumber = /^\d{1,12}$/.test(no) ? Number(no) : undefined;
  const validStatus = ORDER_FILTERS.some((f) => f.value === status) ? status : "";
  const orders = await listOrders({ status: validStatus || undefined, orderNumber });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">คำสั่งซื้อ</h1>

      <div className={`${CARD_CLASS} space-y-4`}>
        <nav className="flex flex-wrap gap-2">
          {ORDER_FILTERS.map((filter) => {
            const active = filter.value === validStatus;
            return (
              <Link
                key={filter.label}
                href={filter.value ? `/admin/orders?status=${filter.value}` : "/admin/orders"}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
                  active ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
                }`}
              >
                {filter.label}
              </Link>
            );
          })}
        </nav>

        <form className="flex flex-col gap-2 sm:flex-row" action="/admin/orders" method="get">
          {validStatus ? <input type="hidden" name="status" value={validStatus} /> : null}
          <input
            name="no"
            inputMode="numeric"
            placeholder="ค้นหาด้วยเลขคำสั่งซื้อ เช่น 1024"
            defaultValue={orderNumber ?? ""}
            className={INPUT_CLASS}
          />
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            ค้นหา
          </button>
        </form>
      </div>

      <ul className="space-y-3">
        {orders.map((order) => (
          <li key={order.id}>
            <Link href={`/admin/orders/${order.id}`} className={`${CARD_CLASS} block hover:ring-indigo-300`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-900">
                  #{order.order_number} · {order.package_name_snapshot}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {order.awaiting_review ? <StatusBadge label="รอตรวจสลิป" className="bg-amber-50 text-amber-800 ring-amber-200" /> : null}
                  <StatusBadge label={label(ORDER_STATUS_LABELS, order.order_status)} className={ORDER_STATUS_STYLES[order.order_status]} />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                <span>ยอด {formatMoney(order.total_thb)}</span>
                <span>โทร {order.customer_phone_masked}</span>
                <span>{formatDateTime(order.created_at)}</span>
              </div>
            </Link>
          </li>
        ))}
        {orders.length === 0 ? (
          <li className={`${CARD_CLASS} text-center text-sm text-slate-500`}>ไม่พบคำสั่งซื้อ</li>
        ) : null}
      </ul>
    </div>
  );
}
