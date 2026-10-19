interface AlertProps {
  variant: "error" | "success";
  children: React.ReactNode;
}

export function Alert({ variant, children }: AlertProps) {
  const styles =
    variant === "error"
      ? "bg-rose-50 text-rose-800 ring-rose-200"
      : "bg-emerald-50 text-emerald-800 ring-emerald-200";

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${styles}`}
    >
      {children}
    </div>
  );
}
