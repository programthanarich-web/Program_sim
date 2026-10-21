import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";

/** layout ของส่วน admin ที่ต้องล็อกอิน (route group ไม่กระทบ URL) */
export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-100" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
