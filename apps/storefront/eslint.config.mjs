import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    // หน้าบ้านห้ามนำเข้าโค้ดของหลังบ้าน (แยกชัดเจนตามแอป)
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/services/admin*", "@/app/actions/admin*", "@/components/admin/*", "@/lib/notifications/*", "@/lib/admin-*", "@/types/admin*"], message: "โค้ดนี้เป็นของหลังบ้าน ห้ามนำเข้าในหน้าบ้าน" },
            { group: ["@pt/backoffice*"], message: "หน้าบ้านห้ามพึ่งแอปหลังบ้าน" },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;

