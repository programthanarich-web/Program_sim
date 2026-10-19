"use client";

import { useActionState } from "react";
import { adminLoginAction } from "@/app/actions/admin";
import { Alert } from "@pt/shared/ui/alert";
import { Field } from "@pt/shared/ui/field";
import { SubmitButton } from "@pt/shared/ui/submit-button";
import type { ActionState } from "@pt/shared/types";

const EMPTY_STATE: ActionState = {};

export function AdminLoginForm() {
  const [state, action] = useActionState(adminLoginAction, EMPTY_STATE);

  return (
    <form action={action} className="space-y-4">
      <Field label="อีเมล" name="email" type="email" autoComplete="username" required />
      <Field label="รหัสผ่าน" name="password" type="password" autoComplete="current-password" required />

      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      <SubmitButton label="เข้าสู่ระบบ" pendingLabel="กำลังเข้าสู่ระบบ..." />
    </form>
  );
}
