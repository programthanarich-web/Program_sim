import Link from "next/link";
import { redirect } from "next/navigation";
import { adminLogoutAction } from "@/app/actions/admin";
import { getCurrentStaff } from "@/services/admin";

const NAV_ITEMS = [
  { href: "/admin", label: "ภาพรวม" },
  { href: "/admin/orders", label: "คำสั่งซื้อ" },
  { href: "/admin/queue", label: "คิวสมัคร" },
  { href: "/admin/packages", label: "แพ็กเกจ" },
  { href: "/admin/discounts", label: "ส่วนลด" },
  { href: "/admin/payment-settings", label: "ค่ารับเงิน" },
  { href: "/admin/notifications", label: "การแจ้งเตือน" },
  { href: "/admin/site", label: "หน้าเว็บ" },
];

/** โครงหน้า admin: ตรวจสิทธิ์ฝั่ง server ก่อนแสดงเนื้อหา */
export async function AdminShell({ children }: { children: React.ReactNode }) {
  const staff = await getCurrentStaff();
  if (!staff) {
    redirect("/admin/login");
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl space-y-3 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/admin" className="font-bold text-indigo-700">
              ผู้ดูแลระบบ
            </Link>
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-slate-500 sm:inline">
                {staff.email} · {staff.role === "admin" ? "ผู้ดูแลระบบ" : "พนักงาน"}
              </span>
              <form action={adminLogoutAction}>
                <button
                  type="submit"
                  className="rounded-lg px-3 py-1.5 font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
                >
                  ออกจากระบบ
                </button>
              </form>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto text-sm font-medium text-slate-600">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-lg px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-700"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">{children}</main>
    </div>
  );
}
