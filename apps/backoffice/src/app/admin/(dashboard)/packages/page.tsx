import Link from "next/link";
import { connection } from "next/server";
import { PackageEditor } from "@/components/admin/package-editor";
import { CARD_CLASS, SECTION_TITLE_CLASS } from "@/components/admin/form-styles";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatMoney } from "@/lib/admin-labels";
import { formatQuota } from "@pt/shared/format";
import { requireStaff } from "@/services/admin";
import { listPackagesForAdmin } from "@/services/admin-data";

export default async function AdminPackagesPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  await connection();
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const { edit, new: creating } = await searchParams;

  const packages = await listPackagesForAdmin();
  const selected = isAdmin && edit ? packages.find((p) => p.id === edit) ?? null : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">แพ็กเกจ</h1>
        {isAdmin ? (
          <Link href="/admin/packages?new=1" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
            เพิ่มแพ็กเกจ
          </Link>
        ) : null}
      </div>

      {!isAdmin ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
          คุณดูรายการได้อย่างเดียว เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขแพ็กเกจและราคาได้
        </p>
      ) : null}

      <ul className="grid gap-3 md:grid-cols-2">
        {packages.map((pkg) => (
          <li key={pkg.id} className={`${CARD_CLASS} space-y-2`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{pkg.name}</p>
                <p className="text-xs text-slate-500">รหัส {pkg.code}</p>
              </div>
              <StatusBadge
                label={pkg.is_active ? "เปิดขาย" : "ปิดขาย"}
                className={pkg.is_active ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-slate-300"}
              />
            </div>
            <p className="text-sm text-slate-700">
              {pkg.speed_mbps} Mbps · {formatQuota(pkg.data_quota_gb)} · {pkg.duration_days} วัน
            </p>
            <p className="text-lg font-bold text-slate-900">{formatMoney(pkg.price_thb)}</p>
            {isAdmin ? (
              <Link href={`/admin/packages?edit=${pkg.id}`} className="inline-block text-sm font-medium text-indigo-700 hover:underline">
                แก้ไข
              </Link>
            ) : null}
          </li>
        ))}
        {packages.length === 0 ? <li className={`${CARD_CLASS} text-sm text-slate-500`}>ยังไม่มีแพ็กเกจ</li> : null}
      </ul>

      {isAdmin && (selected || creating) ? (
        <section className={`${CARD_CLASS} space-y-4`}>
          <h2 className={SECTION_TITLE_CLASS}>{selected ? `แก้ไข ${selected.name}` : "เพิ่มแพ็กเกจใหม่"}</h2>
          <p className="text-xs text-slate-500">
            การแก้ราคามีผลเฉพาะคำสั่งซื้อใหม่ คำสั่งซื้อเดิมยังคงราคาที่ล็อกไว้ตอนสั่งซื้อ
          </p>
          <PackageEditor pkg={selected} />
        </section>
      ) : null}
    </div>
  );
}
