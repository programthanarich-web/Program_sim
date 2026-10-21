import type { InputHTMLAttributes } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

/** ช่องกรอกข้อมูลพร้อม label ที่ผูกกันถูกต้องเพื่อการเข้าถึง (accessibility) */
export function Field({ label, hint, id, name, ...inputProps }: FieldProps) {
  const fieldId = id ?? name ?? label;

  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={fieldId}
        name={name}
        className="block min-h-11 w-full rounded-xl border-0 px-3.5 py-2.5 text-base text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
        {...inputProps}
      />
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
