"use client";

import { useActionState } from "react";
import { requestOtpAction, verifyOtpAction } from "@/app/actions/customer";
import { Alert } from "@pt/shared/ui/alert";
import { Field } from "@pt/shared/ui/field";
import { SubmitButton } from "@pt/shared/ui/submit-button";
import { maskPhone } from "@pt/shared/phone";
import type { ActionState } from "@pt/shared/types";

const EMPTY_STATE: ActionState = {};

/** ฟอร์มยืนยันเบอร์ 2 ขั้น (Supabase Phone OTP): กรอกเบอร์ -> กรอกรหัส */
export function PhoneVerificationForm() {
  const [phoneState, phoneAction] = useActionState(requestOtpAction, EMPTY_STATE);
  const [otpState, otpAction] = useActionState(verifyOtpAction, EMPTY_STATE);

  if (phoneState.step === "otp" && phoneState.phone) {
    const phone = phoneState.phone;
    return (
      <div className="space-y-5">
        <p className="text-sm text-slate-600">
          เราได้ส่งรหัส 6 หลักไปยังเบอร์ <span className="font-semibold">{maskPhone(phone)}</span>
        </p>

        <form action={otpAction} className="space-y-4">
          <input type="hidden" name="phone" value={phone} />
          <Field
            label="รหัส OTP"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            required
          />
          {otpState.error ? <Alert variant="error">{otpState.error}</Alert> : null}
          <SubmitButton label="ยืนยันรหัส" pendingLabel="กำลังตรวจสอบ..." />
        </form>

        <form action={phoneAction}>
          <button type="submit" className="w-full text-center text-sm font-medium text-indigo-700 hover:underline">
            ขอรหัสอีกครั้ง
          </button>
          <input type="hidden" name="phone" value={phone} />
        </form>
      </div>
    );
  }

  return (
    <form action={phoneAction} className="space-y-4">
      <Field
        label="เบอร์มือถือ"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="081-234-5678"
        hint="รองรับเบอร์มือถือไทยขึ้นต้น 06, 08, 09"
        required
      />
      {phoneState.error ? <Alert variant="error">{phoneState.error}</Alert> : null}
      <SubmitButton label="ส่งรหัสยืนยัน" pendingLabel="กำลังส่งรหัส..." />
    </form>
  );
}
