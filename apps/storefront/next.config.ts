import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // ให้ Turbopack มองเห็น workspace ทั้งโปรเจกต์ (แพ็กเกจ @pt/shared อยู่นอกโฟลเดอร์แอป)
  turbopack: {
    root: path.join(__dirname, "../.."),
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
  transpilePackages: ["@pt/shared"],
  experimental: {
    // รองรับการอัปโหลดสลิปขนาดไม่เกิน 5 MB (ค่าเริ่มต้น 1 MB ไม่พอ)
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
