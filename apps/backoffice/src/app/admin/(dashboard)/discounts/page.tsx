import Link from "next/link";
import { connection } from "next/server";
import { DiscountEditor } from "@/components/admin/discount-editor";
import { CARD_CLASS, SECTION_TITLE_CLASS } from "@/components/admin/form-styles";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatDateTime } from "@pt/shared/format";
import { requireStaff } from "@/services/admin";
import { listDiscountsForAdmin } from "@/services/admin-data";

export default async function AdminDiscountsPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  await connection();
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const { edit, new: creating } = await searchParams;

  const discounts = await listDiscountsForAdmin();
  const selected = isAdmin && edit ? discounts.find((d) => d.id === edit) ?? null : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">รหัสส่วนลด</h1>
        {isAdmin ? (
          <Link href="/admin/discounts?new=1" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
            เพิ่มรหัสส่วนลด
          </Link>
        ) : null}
      </div>

      <ul className="space-y-3">
        {discounts.map((d) => (
          <li key={d.id} className={`${CARD_CLASS} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <p className="font-semibold text-slate-900">{d.code}</p>
              <p className="text-sm text-slate-600">
                {d.discount_type === "percent" ? `${d.discount_value}%` : `${d.discount_value} บาท`}
                {d.max_uses ? ` · ใช้ได้ ${d.max_uses} ครั้ง` : " · ไม่จำกัดครั้ง"}
                {d.valid_until ? ` · หมด ${formatDateTime(d.valid_until)}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge
                label={d.is_active ? "เปิดใช้" : "ปิดใช้"}
                className={d.is_active ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-slate-300"}
              />
              {isAdmin ? (
                <Link href={`/admin/discounts?edit=${d.id}`} className="text-sm font-medium text-indigo-700 hover:underline">
                  แก้ไข
                </Link>
              ) : null}
            </div>
          </li>
        ))}
        {discounts.length === 0 ? <li className={`${CARD_CLASS} text-sm text-slate-500`}>ยังไม่มีรหัสส่วนลด</li> : null}
      </ul>

      {!isAdmin ? <p className="text-sm text-slate-500">เฉพาะผู้ดูแลระบบเท่านั้นที่เพิ่มหรือแก้ไขส่วนลดได้</p> : null}

      {isAdmin && (selected || creating) ? (
        <section className={`${CARD_CLASS} space-y-4`}>
          <h2 className={SECTION_TITLE_CLASS}>{selected ? `แก้ไข ${selected.code}` : "เพิ่มรหัสส่วนลดใหม่"}</h2>
          <DiscountEditor discount={selected} />
        </section>
      ) : null}
    </div>
  );
}
