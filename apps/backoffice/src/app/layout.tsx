import type { Metadata, Viewport } from "next";
import "./globals.css";

/**
 * ไม่ใช้ next/font/google เพื่อให้ build ไม่พึ่งการดาวน์โหลดฟอนต์ภายนอก
 * ฟอนต์ภาษาไทยจะใช้ฟอนต์ของระบบปฏิบัติการ (iOS/Android/Windows มีฟอนต์ไทยอยู่แล้ว)
 * หากต้องการฟอนต์ Noto Sans Thai เฉพาะ ดูวิธีใน README หัวข้อ "ปรับแต่งฟอนต์"
 */

export const metadata: Metadata = {
  title: {
    default: "หลังบ้าน ProgramThanarich",
    template: "%s | หลังบ้าน",
  },
  description: "ระบบหลังบ้านสำหรับพนักงานและผู้ดูแล (ไม่เปิดให้ผู้ใช้ทั่วไป)",
  robots: { index: false, follow: false },
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
