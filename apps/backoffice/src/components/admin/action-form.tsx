"use client";

import { useActionState } from "react";
import { Alert } from "@pt/shared/ui/alert";
import { SubmitButton } from "@pt/shared/ui/submit-button";
import type { AdminActionState } from "@/types/admin";

type AdminAction = (previous: AdminActionState, formData: FormData) => Promise<AdminActionState>;

interface ActionFormProps {
  action: AdminAction;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary";
  /** ถ้ากำหนด จะถามยืนยันก่อนส่ง (ใช้กับการกระทำที่ย้อนกลับไม่ได้) */
  confirmMessage?: string;
  className?: string;
  children?: React.ReactNode;
}

/** ฟอร์มที่เรียก server action และแสดงผลลัพธ์เป็นข้อความภาษาไทย */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  variant = "primary",
  confirmMessage,
  className = "",
  children,
}: ActionFormProps) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form
      action={formAction}
      className={`space-y-3 ${className}`}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {children}
      <SubmitButton label={submitLabel} pendingLabel={pendingLabel} variant={variant} />
      {state ? (
        <Alert variant={state.ok ? "success" : "error"}>
          <span>{state.message}</span>
          {state.url ? (
            <a
              href={state.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block font-semibold underline underline-offset-2"
            >
              เปิดสลิปในแท็บใหม่
            </a>
          ) : null}
        </Alert>
      ) : null}
    </form>
  );
}
