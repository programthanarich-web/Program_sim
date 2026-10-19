"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  bahtField,
  bangkokDateTimeField,
  checkboxField,
  intField,
  optionalText,
  runAdminAction,
  textField,
  unwrapRpc,
  uuidField,
} from "@/lib/admin-form";
import { createSupabaseAuthClient } from "@/lib/supabase/server-auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { randomUUID } from "node:crypto";
import { validateSlipFile } from "@pt/shared/payments/slip-file";
import { getPaymentReceiving, removeQrFile, uploadQrFile } from "@/services/payment-receiving";
import { dispatchNotificationsNow } from "@/lib/notifications/service";
import { requireAdmin, requireStaff, signInAdmin, signOutAdmin } from "@/services/admin";
import type { ActionState } from "@pt/shared/types";
import type { AdminActionState } from "@/types/admin";

const SLIP_BUCKET = "payment-slips";
const SLIP_URL_TTL_SECONDS = 60;

function refreshAdmin(): void {
  revalidatePath("/admin", "layout");
}

// ---------------------------------------------------------------------
// เข้าสู่ระบบ / ออกจากระบบ
// ---------------------------------------------------------------------

export async function adminLoginAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "กรุณากรอกอีเมลและรหัสผ่าน" };
  }

  const result = await signInAdmin(email, password);
  if (!result.ok) {
    return { error: result.error };
  }

  redirect("/admin");
}

export async function adminLogoutAction(): Promise<void> {
  await signOutAdmin();
  redirect("/admin/login");
}

// ---------------------------------------------------------------------
// การชำระเงินและสลิป (พนักงาน)
// ---------------------------------------------------------------------

export async function reviewPaymentAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction(async () => {
    await requireStaff();
    const paymentId = uuidField(formData, "payment_id");
    const decision = textField(formData, "decision");
    if (decision !== "approve" && decision !== "reject") throw new Error("การตัดสินใจไม่ถูกต้อง");

    const db = await createSupabaseAuthClient();
    unwrapRpc(
      await db.rpc("review_payment", {
        p_payment_id: paymentId,
        p_decision: decision,
        p_reason: optionalText(formData, "reason"),
      }),
    );
    refreshAdmin();
    return decision === "approve" ? "ยืนยันการรับเงินแล้ว" : "ปฏิเสธการชำระเงินแล้ว";
  });
}

/** ลิงก์สลิปชั่วคราว (60 วินาที) สร้างหลังตรวจสิทธิ์พนักงานแล้วเท่านั้น */
export async function getSlipUrlAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction(async () => {
    await requireStaff();
    const paymentId = uuidField(formData, "payment_id");

    const db = await createSupabaseAuthClient();
    const { data: slip, error } = await db
      .from("slips")
      .select("storage_path")
      .eq("payment_id", paymentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!slip) throw new Error("ไม่พบสลิปของรายการนี้");

    const { data, error: signError } = await createSupabaseServiceClient()
      .storage.from(SLIP_BUCKET)
      .createSignedUrl(slip.storage_path as string, SLIP_URL_TTL_SECONDS);
    if (signError || !data) throw new Error("ไม่สามารถเปิดสลิปได้ กรุณาลองใหม่");

    return { ok: true, message: `เปิดลิงก์สลิปแล้ว (ใช้ได้ ${SLIP_URL_TTL_SECONDS} วินาที)`, url: data.signedUrl };
  });
}

// ---------------------------------------------------------------------
// คิวสมัครและผลการสมัคร
// ---------------------------------------------------------------------

export async function recordSignupResultAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction(async () => {
    await requireStaff();
    const orderId = uuidField(formData, "order_id");
    const outcome = textField(formData, "outcome");
    if (outcome !== "success" && outcome !== "failed" && outcome !== "needs_info") {
      throw new Error("ผลการสมัครไม่ถูกต้อง");
    }

    const db = await createSupabaseAuthClient();
    unwrapRpc(
      await db.rpc("record_signup_result", {
        p_order_id: orderId,
        p_outcome: outcome,
        p_note: textField(formData, "note"),
      }),
    );
    refreshAdmin();
    return "บันทึกผลการสมัครแล้ว รอผู้ดูแลระบบยืนยัน";
  });
}

export async function confirmSignupResultAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction(async () => {
    await requireAdmin();
    const resultId = uuidField(formData, "result_id");

    const db = await createSupabaseAuthClient();
    unwrapRpc(
      await db.rpc("confirm_signup_result", {
        p_result_id: resultId,
        p_note: optionalText(formData, "confirm_note"),
      }),
    );
    refreshAdmin();
    return "ยืนยันผลการสมัครแล้ว";
  });
}

export async function cancelOrderAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction(async () => {
    await requireStaff();
    const orderId = uuidField(formData, "order_id");
    const reason = textField(formData, "reason");
    if (!reason) throw new Error("ต้องระบุเหตุผลในการยกเลิก");

    const db = await createSupabaseAuthClient();
    unwrapRpc(
      await db.rpc("transition_order_status", {
        p_order_id: orderId,
        p_to: "cancelled",
        p_reason: reason,
      }),
    );
    refreshAdmin();
    return "ยกเลิกคำสั่งซื้อแล้ว";
  });
}

// ---------------------------------------------------------------------
// แพ็กเกจและส่วนลด (เฉพาะผู้ดูแลระบบ)
// ---------------------------------------------------------------------

export async function savePackageAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction(async () => {
    await requireAdmin();
    const id = textField(formData, "id");
    const quota = textField(formData, "data_quota_gb");

    const db = await createSupabaseAuthClient();
    unwrapRpc(
      await db.rpc("admin_save_package", {
        p_id: id ? uuidField(formData, "id") : null,
        p_code: textField(formData, "code"),
        p_name: textField(formData, "name"),
        p_speed_mbps: intField(formData, "speed_mbps", 1, 10000),
        p_data_quota_gb: quota ? intField(formData, "data_quota_gb", 0, 100000) : null,
        p_price_thb: bahtField(formData, "price_thb"),
        p_duration_days: intField(formData, "duration_days", 1, 3650),
        p_description: optionalText(formData, "description"),
        p_is_active: checkboxField(formData, "is_active"),
        p_sort_order: intField(formData, "sort_order", 0, 9999),
      }),
    );
    refreshAdmin();
    return id ? "บันทึกการแก้ไขแพ็กเกจแล้ว (คำสั่งซื้อเดิมไม่เปลี่ยนราคา)" : "เพิ่มแพ็กเกจแล้ว";
  });
}

export async function saveDiscountAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction(async () => {
    await requireAdmin();
    const id = textField(formData, "id");
    const type = textField(formData, "discount_type");
    if (type !== "fixed" && type !== "percent") throw new Error("ประเภทส่วนลดไม่ถูกต้อง");
    const maxUses = textField(formData, "max_uses");

    const db = await createSupabaseAuthClient();
    unwrapRpc(
      await db.rpc("admin_save_discount", {
        p_id: id ? uuidField(formData, "id") : null,
        p_code: textField(formData, "code"),
        p_discount_type: type,
        p_discount_value: bahtField(formData, "discount_value"),
        p_max_uses: maxUses ? intField(formData, "max_uses", 1, 1000000) : null,
        p_valid_from: bangkokDateTimeField(formData, "valid_from"),
        p_valid_until: bangkokDateTimeField(formData, "valid_until"),
        p_is_active: checkboxField(formData, "is_active"),
      }),
    );
    refreshAdmin();
    return id ? "บันทึกส่วนลดแล้ว" : "เพิ่มรหัสส่วนลดแล้ว";
  });
}

// ---------------------------------------------------------------------
// การแจ้งเตือน (ผู้ดูแลระบบ)
// ---------------------------------------------------------------------

export async function retryNotificationAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction(async () => {
    await requireAdmin();
    const id = uuidField(formData, "id");
    const db = await createSupabaseAuthClient();
    unwrapRpc(await db.rpc("admin_retry_notification", { p_id: id }));
    refreshAdmin();
    return "ตั้งให้ส่งซ้ำแล้ว";
  });
}

export async function dispatchNotificationsAction(): Promise<AdminActionState> {
  return runAdminAction(async () => {
    await requireAdmin();
    const outcome = await dispatchNotificationsNow();
    if (outcome.status !== "ok") throw new Error(outcome.reason);

    refreshAdmin();
    const { sent, retried, failed, claimed } = outcome.summary;
    const mode = outcome.notifier === "mock" ? " (โหมดทดสอบ: ไม่มีการส่งเข้า LINE จริง)" : "";
    return `ตรวจรายการค้าง ${claimed} รายการ: ส่งแล้ว ${sent} รอส่งซ้ำ ${retried} ล้มเหลว ${failed}${mode}`;
  });
}

// ---------------------------------------------------------------------
// ค่ารับเงิน (เฉพาะผู้ดูแลระบบ)
// ---------------------------------------------------------------------

const QR_MAX_BYTES = 1024 * 1024;

export async function savePaymentReceivingAction(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  return runAdminAction(async () => {
    await requireAdmin();
    const db = await createSupabaseAuthClient();
    const file = formData.get("qr");
    const previous = await getPaymentReceiving();

    let newPath: string | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > QR_MAX_BYTES) throw new Error("ไฟล์ QR ต้องมีขนาดไม่เกิน 1 MB");
      const bytes = new Uint8Array(await file.arrayBuffer());
      // ตรวจชนิดจาก magic bytes ไม่เชื่อชื่อไฟล์หรือ type ที่ browser ส่งมา
      const validated = validateSlipFile(bytes);
      newPath = `qr/${randomUUID()}.${validated.extension}`;
      await uploadQrFile(newPath, bytes, validated.mime);
    }

    try {
      unwrapRpc(
        await db.rpc("admin_save_payment_receiving", {
          p_bank_name: textField(formData, "bank_name"),
          p_account_name: textField(formData, "account_name"),
          p_account_number: textField(formData, "account_number"),
          p_qr_storage_path: newPath,
        }),
      );
    } catch (error) {
      // บันทึกค่าไม่สำเร็จ: ลบไฟล์ที่เพิ่งอัปโหลดเพื่อไม่ให้ค้าง
      if (newPath) await removeQrFile(newPath).catch(() => undefined);
      throw error;
    }

    // ลบไฟล์ QR เดิมหลังบันทึกสำเร็จ (ถ้ามีการเปลี่ยนไฟล์)
    if (newPath && previous.qrPath) {
      await removeQrFile(previous.qrPath).catch(() => undefined);
    }
    refreshAdmin();
    return "บันทึกค่ารับเงินแล้ว คำสั่งซื้อใหม่จะใช้ค่านี้";
  });
}
