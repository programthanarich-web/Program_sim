import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight text-indigo-700">
          ProgramThanarich
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
          <Link href="/verify-phone" className="hover:text-indigo-700">
            เลือกแพ็กเกจ
          </Link>
        </nav>
      </div>
    </header>
  );
}
