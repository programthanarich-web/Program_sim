import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { siteContent } from "@/lib/site-content";

export default function HomePage() {
  const content = siteContent;

  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 pb-10 pt-12 sm:pt-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            ProgramThanarich
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            {content.heroTitle}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            {content.heroSubtitle}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/verify-phone"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-500 sm:w-auto"
            >
              {content.ctaLabel}
            </Link>
            {content.lineUrl ? (
              <a
                href={content.lineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-6 py-3 text-base font-semibold text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50 sm:w-auto"
              >
                ติดต่อทีมงานทาง LINE
              </a>
            ) : null}
          </div>

          {content.heroImagePath ? (
            <Image
              src={content.heroImagePath}
              alt=""
              width={960}
              height={540}
              className="mt-10 h-auto w-full rounded-2xl object-cover shadow-sm ring-1 ring-slate-200"
              sizes="(min-width: 1024px) 960px, 100vw"
              priority
            />
          ) : null}
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-16">
          <ol className="grid gap-4 sm:grid-cols-3">
            {content.steps.map((step, index) => (
              <li key={step.title} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                  {index + 1}
                </span>
                <h2 className="mt-3 font-semibold text-slate-900">{step.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.description}</p>
              </li>
            ))}
          </ol>

          <p className="mt-10 text-center text-xs text-slate-500">{content.footerNote}</p>
        </section>
      </main>
    </>
  );
}
