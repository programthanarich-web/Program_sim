const numberFormatter = new Intl.NumberFormat("th-TH");

const dateTimeFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

/** เช่น 599 → "599 บาท" */
export function formatBaht(amount: number): string {
  return `${numberFormatter.format(amount)} บาท`;
}

/** แปลง ISO string เป็นวันเวลาไทย (เขตเวลา Asia/Bangkok) */
export function formatDateTime(isoString: string): string {
  return dateTimeFormatter.format(new Date(isoString));
}

export function formatQuota(quotaGb: number | null): string {
  return quotaGb === null ? "ไม่จำกัดปริมาณ" : `${numberFormatter.format(quotaGb)} GB`;
}
