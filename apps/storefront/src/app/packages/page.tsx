import type { Metadata } from "next";
import { Suspense } from "react";
import { PackagesList } from "@/components/customer/packages-list";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "เลือกแพ็กเกจ",
};

export default function PackagesPage() {
  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">เลือกแพ็กเกจ</h1>
          <Suspense fallback={<p className="text-sm text-slate-500">กำลังโหลดแพ็กเกจ...</p>}>
            <PackagesList />
          </Suspense>
        </div>
      </main>
    </>
  );
}
