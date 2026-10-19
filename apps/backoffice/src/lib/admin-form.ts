import { isUuid } from "@pt/shared/validation";
import type { AdminActionState } from "@/types/admin";

/** อ่านค่าจากฟอร์มและตัดช่องว่างหัวท้าย */
export function textField(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export function optionalText(formData: FormData, name: string): string | null {
  const value = textField(formData, name);
  return value.length > 0 ? value : null;
}

export function uuidField(formData: FormData, name: string): string {
  const value = textField(formData, name);
  if (!isUuid(value)) throw new Error("ข้อมูลอ้างอิงไม่ถูกต้อง");
  return value;
}

export function intField(formData: FormData, name: string, min: number, max: number): number {
  const value = textField(formData, name);
  if (!/^\d+$/.test(value)) throw new Error("กรุณากรอกตัวเลขจำนวนเต็ม");
  const parsed = Number(value);
  if (parsed < min || parsed > max) throw new Error(`ต้องอยู่ระหว่าง ${min} ถึง ${max}`);
  return parsed;
}

/** จำนวนเงินบาทเป็นสตริงทศนิยมไม่เกิน 2 ตำแหน่ง */
export function bahtField(formData: FormData, name: string): string {
  const value = textField(formData, name);
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(value)) {
    throw new Error("จำนวนเงินไม่ถูกต้อง (ทศนิยมไม่เกิน 2 ตำแหน่ง)");
  }
  return value;
}

export function checkboxField(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

/** datetime-local (เวลาไทย) -> ISO string พร้อม offset +07:00 */
export function bangkokDateTimeField(formData: FormData, name: string): string | null {
  const value = textField(formData, name);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("รูปแบบวันที่ไม่ถูกต้อง");
  return `${value}:00+07:00`;
}

/** ห่อการทำงานของ action: คืนข้อความไทยทั้งสำเร็จและล้มเหลว */
export async function runAdminAction(work: () => Promise<string | AdminActionState>): Promise<AdminActionState> {
  try {
    const result = await work();
    if (result && typeof result === "object") return result;
    return { ok: true, message: result ?? "บันทึกแล้ว" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด กรุณาลองใหม่" };
  }
}

/** ตรวจผลจาก PostgREST: ถ้ามี error ให้โยนข้อความที่ฐานข้อมูลส่งกลับ (เป็นภาษาไทยจาก RAISE) */
export function unwrapRpc<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}
