import Link from "next/link";
import { connection } from "next/server";
import { StatusBadge } from "@/components/admin/status-badge";
import { CARD_CLASS, SECTION_TITLE_CLASS } from "@/components/admin/form-styles";
import { label, ORDER_STATUS_LABELS, ORDER_STATUS_STYLES } from "@/lib/admin-labels";
import { formatDateTime } from "@pt/shared/format";
import { requireStaff } from "@/services/admin";
import { getDashboardCounts, listOrders } from "@/services/admin-data";

export default async function AdminOverviewPage() {
  await connection();
  await requireStaff();

  const [counts, recent] = await Promise.all([getDashboardCounts(), listOrders({})]);

  const tiles = [
    { href: "/admin/orders?status=pending", title: "รอตรวจสลิป", value: counts.awaitingReview, tone: "text-amber-700" },
    { href: "/admin/queue", title: "งานรอสมัคร", value: counts.processing, tone: "text-sky-700" },
    { href: "/admin/queue", title: "รอยืนยันผลสมัคร", value: counts.openSignup, tone: "text-indigo-700" },
    { href: "/admin/notifications?status=failed", title: "แจ้งเตือนล้มเหลว", value: counts.failedNotifications, tone: "text-rose-700" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">ภาพรวม</h1>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.title} href={tile.href} className={`${CARD_CLASS} block hover:ring-indigo-300`}>
            <p className="text-sm text-slate-500">{tile.title}</p>
            <p className={`mt-1 text-3xl font-bold ${tile.tone}`}>{tile.value}</p>
          </Link>
        ))}
      </section>

      <section className={CARD_CLASS}>
        <div className="flex items-center justify-between">
          <h2 className={SECTION_TITLE_CLASS}>คำสั่งซื้อล่าสุด</h2>
          <Link href="/admin/orders" className="text-sm font-medium text-indigo-700 hover:underline">
            ดูทั้งหมด
          </Link>
        </div>
        <ul className="mt-3 divide-y divide-slate-100">
          {recent.slice(0, 8).map((order) => (
            <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <Link href={`/admin/orders/${order.id}`} className="font-medium text-slate-900 hover:text-indigo-700">
                #{order.order_number} · {order.package_name_snapshot}
              </Link>
              <div className="flex items-center gap-2">
                {order.awaiting_review ? <StatusBadge label="รอตรวจสลิป" className="bg-amber-50 text-amber-800 ring-amber-200" /> : null}
                <StatusBadge
                  label={label(ORDER_STATUS_LABELS, order.order_status)}
                  className={ORDER_STATUS_STYLES[order.order_status]}
                />
                <span className="text-xs text-slate-500">{formatDateTime(order.created_at)}</span>
              </div>
            </li>
          ))}
          {recent.length === 0 ? <li className="py-6 text-center text-sm text-slate-500">ยังไม่มีคำสั่งซื้อ</li> : null}
        </ul>
      </section>
    </div>
  );
}
