import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

const STEPS = [
  { title: "ยืนยันเบอร์มือถือ", description: "กรอกเบอร์แล้วรับรหัส OTP 6 หลักทาง SMS" },
  { title: "เลือกแพ็กเกจ", description: "เปรียบเทียบความเร็ว ปริมาณข้อมูล และราคาได้ในหน้าเดียว" },
  { title: "ทีมงานติดต่อกลับ", description: "ส่งคำขอแล้วทีมงานจะติดต่อกลับเพื่อดำเนินการต่อ" },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 pb-10 pt-12 sm:pt-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            ProgramThanarich
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            เลือกแพ็กเกจอินเทอร์เน็ตที่เหมาะกับคุณ
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            ยืนยันเบอร์มือถือเพียงครั้งเดียว แล้วเปรียบเทียบแพ็กเกจความเร็วและราคาได้ทันที
            จากนั้นส่งคำขอให้ทีมงานติดต่อกลับ
          </p>

          <div className="mt-8">
            <Link
              href="/verify-phone"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-500 sm:w-auto"
            >
              ยืนยันเบอร์เพื่อดูแพ็กเกจ
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-16">
          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                  {index + 1}
                </span>
                <h2 className="mt-3 font-semibold text-slate-900">{step.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.description}</p>
              </li>
            ))}
          </ol>

          <p className="mt-10 text-center text-xs text-slate-500">
            การสมัครใช้บริการจะดำเนินการโดยทีมงานหลังจากส่งคำขอ ระบบนี้ยังไม่ได้เชื่อมต่อการชำระเงิน
          </p>
        </section>
      </main>
    </>
  );
}
