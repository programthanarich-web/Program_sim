"use client";

import { useActionState } from "react";
import { selectPackageAction } from "@/app/actions/customer";
import { Alert } from "@pt/shared/ui/alert";
import { SubmitButton } from "@pt/shared/ui/submit-button";
import { formatBaht, formatQuota } from "@pt/shared/format";
import type { ActionState } from "@pt/shared/types";
import type { PublicPackage } from "@/services/customer-orders";

const EMPTY_STATE: ActionState = {};

export function PackageCard({ pkg }: { pkg: PublicPackage }) {
  const [state, action] = useActionState(selectPackageAction, EMPTY_STATE);

  return (
    <article className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-900">{pkg.name}</h2>
        {pkg.description ? <p className="text-sm text-slate-600">{pkg.description}</p> : null}
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-slate-500">ความเร็ว</dt>
          <dd className="font-semibold text-slate-900">{pkg.speed_mbps} Mbps</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-slate-500">ปริมาณข้อมูล</dt>
          <dd className="font-semibold text-slate-900">{formatQuota(pkg.data_quota_gb)}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-slate-500">ระยะเวลา</dt>
          <dd className="font-semibold text-slate-900">{pkg.duration_days} วัน</dd>
        </div>
        <div className="rounded-xl bg-indigo-50 p-3">
          <dt className="text-indigo-700">ราคา</dt>
          <dd className="font-bold text-indigo-900">{formatBaht(pkg.price_thb)}</dd>
        </div>
      </dl>

      <form action={action} className="space-y-3">
        <input type="hidden" name="packageId" value={pkg.id} />
        {state.error ? <Alert variant="error">{state.error}</Alert> : null}
        <SubmitButton label="เลือกแพ็กเกจนี้" pendingLabel="กำลังสร้างคำสั่งซื้อ..." />
      </form>
    </article>
  );
}
