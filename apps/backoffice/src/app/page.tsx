import { redirect } from "next/navigation";

/** หลังบ้านไม่มีหน้าสาธารณะ ให้เข้าที่ /admin เท่านั้น */
export default function BackofficeRoot() {
  redirect("/admin");
}
