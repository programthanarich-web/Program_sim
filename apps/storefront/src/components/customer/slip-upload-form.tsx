"use client";

import { useActionState } from "react";
import { submitSlipAction } from "@/app/actions/customer";
import { Alert } from "@pt/shared/ui/alert";
import { Field } from "@pt/shared/ui/field";
import { SubmitButton } from "@pt/shared/ui/submit-button";
import type { ActionState } from "@pt/shared/types";

const EMPTY_STATE: ActionState = {};
const MAX_SLIP_BYTES = 5 * 1024 * 1024;

export function SlipUploadForm({ orderId }: { orderId: string }) {
  const [state, action] = useActionState(submitSlipAction, EMPTY_STATE);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="orderId" value={orderId} />
      <Field
        label="เลขอ้างอิงการโอน"
        name="reference"
        required
        placeholder="เช่น 0123456789012345"
        hint="ตัวอักษรหรือตัวเลข 6–40 ตัว (ดูจากหน้าจอแอปธนาคาร)"
      />
      <label className="block space-y-2 text-sm font-medium text-slate-700">
        รูปสลิปการโอน (JPEG, PNG หรือ WebP ไม่เกิน 5 MB)
        <input
          type="file"
          name="slip"
          accept="image/jpeg,image/png,image/webp"
          required
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.setCustomValidity(
              file && file.size > MAX_SLIP_BYTES ? "ไฟล์ใหญ่เกิน 5 MB" : "",
            );
          }}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:font-semibold file:text-indigo-700"
        />
      </label>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}
      <SubmitButton label="ส่งสลิป" pendingLabel="กำลังส่งสลิป..." />
    </form>
  );
}
