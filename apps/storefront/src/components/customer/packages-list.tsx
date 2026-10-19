import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PackageCard } from "@/components/customer/package-card";
import { signOutCustomerAction } from "@/app/actions/customer";
import { maskPhone } from "@pt/shared/phone";
import { getCustomerSession } from "@/services/customer-auth";
import { listActivePackagesForCustomer } from "@/services/customer-orders";

/** Server Component: ต้องล็อกอินและยืนยันเบอร์แล้ว แล้วดึงแพ็กเกจที่เปิดขาย */
export async function PackagesList() {
  await connection();
  const customer = await getCustomerSession();
  if (!customer) redirect("/verify-phone");

  const packages = await listActivePackagesForCustomer();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          ยืนยันแล้วด้วยเบอร์ <span className="font-semibold">{maskPhone(customer.phone)}</span>
        </p>
        <div className="flex gap-4 text-sm">
          <Link href="/orders" className="font-medium text-indigo-700 hover:underline">คำสั่งซื้อของฉัน</Link>
          <form action={signOutCustomerAction}>
            <button type="submit" className="font-medium text-slate-500 hover:underline">ออกจากระบบ</button>
          </form>
        </div>
      </div>

      {packages.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center text-slate-600 ring-1 ring-slate-200">
          ขณะนี้ยังไม่มีแพ็กเกจเปิดขาย กรุณาลองใหม่ภายหลัง
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {packages.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} />
          ))}
        </div>
      )}
    </>
  );
}
