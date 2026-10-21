"use server";

import { redirect } from "next/navigation";
import { normalizeThaiPhone } from "@pt/shared/phone";
import { createSupabaseAuthClient } from "@/lib/supabase/server-auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { isOtpCode, isUuid } from "@pt/shared/validation";
import { PaymentAdapterError } from "@pt/shared/payments/errors";
import { buildSlipStoragePath, validateSlipFile } from "@pt/shared/payments/slip-file";
import { getCustomerSession, requestCustomerOtp, signOutCustomer, verifyCustomerOtp } from "@/services/customer-auth";
import { getMyOrder } from "@/services/customer-orders";
import type { ActionState } from "@pt/shared/types";

const SLIP_BUCKET = "payment-slips";

/** ขั้นที่ 1: รับเบอร์แล้วส่ง OTP ผ่าน Supabase Auth */
export async function requestOtpAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const phone = normalizeThaiPhone(String(formData.get("phone") ?? ""));
  if (!phone) {
    return { step: "phone", error: "กรุณากรอกเบอร์มือถือไทย 10 หลัก เช่น 081-234-5678" };
  }

  const result = await requestCustomerOtp(phone);
  if (!result.ok) return { step: "phone", error: result.error };

  return { step: "otp", phone };
}

/** ขั้นที่ 2: ตรวจรหัส OTP แล้วไปหน้าเลือกแพ็กเกจ */
export async function verifyOtpAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const phone = normalizeThaiPhone(String(formData.get("phone") ?? ""));
  const code = String(formData.get("code") ?? "").trim();

  if (!phone) return { step: "phone", error: "ไม่พบเบอร์ที่ขอรหัส กรุณาเริ่มใหม่" };
  if (!isOtpCode(code)) return { step: "otp", phone, error: "กรุณากรอกรหัส OTP 6 หลัก" };

  const result = await verifyCustomerOtp(phone, code);
  if (!result.ok) return { step: "otp", phone, error: result.error };

  redirect("/packages");
}

export async function signOutCustomerAction(): Promise<void> {
  await signOutCustomer();
  redirect("/verify-phone");
}

/** ลูกค้าเลือกแพ็กเกจ: สร้างคำสั่งซื้อผ่าน RPC create_order (ราคาและส่วนลดคิดในฐานข้อมูล) */
export async function selectPackageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const customer = await getCustomerSession();
  if (!customer) redirect("/verify-phone");

  const packageId = String(formData.get("packageId") ?? "");
  if (!isUuid(packageId)) return { error: "ข้อมูลแพ็กเกจไม่ถูกต้อง กรุณาลองใหม่" };

  const db = await createSupabaseAuthClient();
  const { data, error } = await db.rpc("create_order", { p_package_id: packageId, p_discount_code: null });
  if (error) {
    return { error: error.message.includes("3 รายการ") ? error.message : "ไม่สามารถสร้างคำสั่งซื้อได้ กรุณาลองใหม่" };
  }

  const orderId = (data as { id: string }).id;
  redirect(`/orders/${orderId}`);
}

/**
 * ลูกค้าส่งสลิปการโอน: ตรวจชนิดและขนาดไฟล์จาก magic bytes อัปโหลดเข้า bucket ส่วนตัว
 * แล้วบันทึกผ่าน RPC submit_payment (ยอดใช้ยอดของคำสั่งซื้อในฐานข้อมูล ไม่เชื่อค่าจากฟอร์ม)
 * ไม่มีการอนุมัติจากสลิปหรือ OCR: สถานะเป็น pending_review จนพนักงานตรวจ
 */
export async function submitSlipAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const customer = await getCustomerSession();
  if (!customer) redirect("/verify-phone");

  const orderId = String(formData.get("orderId") ?? "");
  const reference = String(formData.get("reference") ?? "");
  const file = formData.get("slip");
  if (!isUuid(orderId)) return { error: "ข้อมูลคำสั่งซื้อไม่ถูกต้อง" };
  if (!(file instanceof File) || file.size === 0) return { error: "กรุณาแนบรูปสลิปการโอน" };

  const order = await getMyOrder(orderId);
  if (!order) return { error: "ไม่พบคำสั่งซื้อ" };
  if (order.status !== "pending") return { error: "คำสั่งซื้อนี้ไม่อยู่ในสถานะรอชำระเงิน" };

  let validated;
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
    validated = validateSlipFile(bytes);
  } catch (error) {
    if (error instanceof PaymentAdapterError) {
      return {
        error:
          error.code === "file_too_large"
            ? "ไฟล์สลิปต้องมีขนาดไม่เกิน 5 MB"
            : "รองรับเฉพาะไฟล์รูปภาพ JPEG, PNG หรือ WebP",
      };
    }
    return { error: "ไม่สามารถอ่านไฟล์สลิปได้" };
  }

  const storagePath = buildSlipStoragePath(customer.id, validated.extension);
  const service = createSupabaseServiceClient();
  const { error: uploadError } = await service.storage
    .from(SLIP_BUCKET)
    .upload(storagePath, bytes, { contentType: validated.mime, upsert: false });
  if (uploadError) {
    console.error("[submitSlip] อัปโหลดสลิปไม่สำเร็จ:", uploadError.message);
    return { error: "อัปโหลดสลิปไม่สำเร็จ กรุณาลองใหม่" };
  }

  const db = await createSupabaseAuthClient();
  const { error: rpcError } = await db.rpc("submit_payment", {
    p_order_id: orderId,
    p_method: "promptpay",
    p_reference_no: reference,
    p_amount_thb: order.totalThb,
    p_storage_path: storagePath,
    p_file_sha256: validated.sha256,
    p_mime_type: validated.mime,
    p_size_bytes: validated.sizeBytes,
  });

  if (rpcError) {
    // บันทึกไม่สำเร็จ: ลบไฟล์ที่เพิ่งอัปโหลดเพื่อไม่ให้ค้างอยู่ใน bucket
    await service.storage.from(SLIP_BUCKET).remove([storagePath]);
    const duplicate = rpcError.message.includes("ซ้ำ") || rpcError.code === "23505";
    return {
      error: duplicate
        ? "เลขอ้างอิงหรือสลิปนี้เคยถูกใช้ไปแล้ว กรุณาตรวจสอบอีกครั้ง"
        : rpcError.message.includes("อ้างอิง")
          ? rpcError.message
          : "ส่งสลิปไม่สำเร็จ กรุณาลองใหม่",
    };
  }

  return { success: "ส่งสลิปแล้ว ทีมงานจะตรวจสอบการโอนและแจ้งผลให้ทราบ" };
}
