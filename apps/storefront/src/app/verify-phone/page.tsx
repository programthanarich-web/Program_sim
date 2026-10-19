import type { Metadata } from "next";
import { PhoneVerificationForm } from "@/components/customer/phone-verification-form";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "ยืนยันเบอร์มือถือ",
};

export default function VerifyPhonePage() {
  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">ยืนยันเบอร์มือถือ</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            กรอกเบอร์มือถือของคุณเพื่อรับรหัสยืนยัน ก่อนเลือกดูแพ็กเกจ
          </p>

          <div className="mt-6">
            <PhoneVerificationForm />
          </div>
        </div>
      </main>
    </>
  );
}
