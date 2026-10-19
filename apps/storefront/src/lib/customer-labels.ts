export const CUSTOMER_ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "รอชำระเงิน",
  processing: "กำลังดำเนินการ",
  activated: "เปิดใช้งานแล้ว",
  cancelled: "ยกเลิกแล้ว",
};

export const CUSTOMER_PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending_review: "รอทีมงานตรวจสลิป",
  verified: "ได้รับการชำระเงินแล้ว",
  rejected: "สลิปไม่ผ่านการตรวจ กรุณาส่งสลิปใหม่",
  refunded: "คืนเงินแล้ว",
};
