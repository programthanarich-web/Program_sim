import Link from "next/link";
import { connection } from "next/server";
import { dispatchNotificationsAction, retryNotificationAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import { CARD_CLASS, SECTION_TITLE_CLASS } from "@/components/admin/form-styles";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  label,
  NOTIFICATION_STATUS_LABELS,
  NOTIFICATION_TEMPLATE_LABELS,
} from "@/lib/admin-labels";
import { formatDateTime } from "@pt/shared/format";
import { optionalServerEnv } from "@/lib/env";
import { requireStaff } from "@/services/admin";
import { listNotifications } from "@/services/admin-data";

const FILTERS = [
  { value: "", label: "ทั้งหมด" },
  { value: "queued", label: "รอส่ง" },
  { value: "failed", label: "ล้มเหลว" },
  { value: "sent", label: "ส่งแล้ว" },
];

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-amber-50 text-amber-800 ring-amber-200",
  sent: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  failed: "bg-rose-50 text-rose-800 ring-rose-200",
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await connection();
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const { status = "" } = await searchParams;
  const validStatus = FILTERS.some((f) => f.value === status) ? status : "";
  const rows = await listNotifications(validStatus || undefined);

  // แสดงเฉพาะว่าตั้งค่าแล้วหรือยัง ไม่แสดงค่าของ credentials
  const lineConfigured = Boolean(optionalServerEnv.lineChannelAccessToken && optionalServerEnv.lineGroupId);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">การแจ้งเตือน</h1>

      <section className={`${CARD_CLASS} space-y-3`}>
        <p className="text-sm text-slate-700">
          ช่องทาง LINE:{" "}
          <span className={lineConfigured ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
            {lineConfigured ? "ตั้งค่าแล้ว" : "ยังไม่ได้ตั้งค่า (ทำงานในโหมดทดสอบ ไม่ส่งเข้า LINE จริง)"}
          </span>
        </p>
        {isAdmin ? (
          <ActionForm action={dispatchNotificationsAction} submitLabel="ส่งรายการที่ค้างตอนนี้" variant="secondary" />
        ) : (
          <p className="text-xs text-slate-500">เฉพาะผู้ดูแลระบบที่สั่งส่งซ้ำได้</p>
        )}
      </section>

      <nav className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={f.value ? `/admin/notifications?status=${f.value}` : "/admin/notifications"}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
              f.value === validStatus ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <ul className="space-y-3">
        {rows.map((row) => {
          const orderNumber = row.payload?.order_number;
          return (
            <li key={row.id} className={`${CARD_CLASS} space-y-2`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={SECTION_TITLE_CLASS}>
                  {label(NOTIFICATION_TEMPLATE_LABELS, row.template)}
                  {orderNumber ? ` · คำสั่งซื้อ #${orderNumber}` : ""}
                </p>
                <StatusBadge label={label(NOTIFICATION_STATUS_LABELS, row.status)} className={STATUS_STYLES[row.status]} />
              </div>
              <p className="text-xs text-slate-500">
                ความพยายาม {row.attempts}/{row.max_attempts} · สร้างเมื่อ {formatDateTime(row.created_at)}
                {row.sent_at ? ` · ส่งเมื่อ ${formatDateTime(row.sent_at)}` : ""}
              </p>
              {row.last_error ? <p className="text-sm text-rose-700">ข้อผิดพลาดล่าสุด: {row.last_error}</p> : null}
              {isAdmin && row.status === "failed" ? (
                <ActionForm action={retryNotificationAction} submitLabel="ส่งซ้ำ" variant="secondary">
                  <input type="hidden" name="id" value={row.id} />
                </ActionForm>
              ) : null}
            </li>
          );
        })}
        {rows.length === 0 ? <li className={`${CARD_CLASS} text-sm text-slate-500`}>ไม่มีรายการ</li> : null}
      </ul>
    </div>
  );
}
