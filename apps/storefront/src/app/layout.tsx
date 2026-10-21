import type { Metadata, Viewport } from "next";
import "./globals.css";

/**
 * ไม่ใช้ next/font/google เพื่อให้ build ไม่พึ่งการดาวน์โหลดฟอนต์ภายนอก
 * ฟอนต์ภาษาไทยจะใช้ฟอนต์ของระบบปฏิบัติการ (iOS/Android/Windows มีฟอนต์ไทยอยู่แล้ว)
 * หากต้องการฟอนต์ Noto Sans Thai เฉพาะ ดูวิธีใน README หัวข้อ "ปรับแต่งฟอนต์"
 */

export const metadata: Metadata = {
  title: {
    default: "ProgramThanarich | แพ็กเกจอินเทอร์เน็ต",
    template: "%s | ProgramThanarich",
  },
  description: "เลือกแพ็กเกจอินเทอร์เน็ตที่เหมาะกับคุณ ยืนยันเบอร์และส่งคำขอได้ในไม่กี่ขั้นตอน",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
