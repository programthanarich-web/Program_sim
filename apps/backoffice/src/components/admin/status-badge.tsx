interface StatusBadgeProps {
  label: string;
  className?: string;
}

export function StatusBadge({ label, className = "bg-slate-100 text-slate-700 ring-slate-300" }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${className}`}>
      {label}
    </span>
  );
}
