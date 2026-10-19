import "server-only";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `ไม่พบ environment variable: ${name} (ดูตัวอย่างได้ที่ไฟล์ .env.example)`,
    );
  }
  return value;
}

/**
 * ค่าลับทั้งหมดอ่านได้เฉพาะฝั่ง server
 * ห้ามเพิ่ม prefix NEXT_PUBLIC_ ให้ตัวแปรเหล่านี้เด็ดขาด
 * อ่านแบบ lazy (getter) เพื่อไม่ให้ build ล้มถ้ายังไม่ได้ตั้งค่า
 */
export const serverEnv = {
  get supabaseUrl() {
    return requireEnv("SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return requireEnv("SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey() {
    return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
};

/**
 * การซิงค์เนื้อหาหน้าบ้านผ่าน GitHub (ความลับทั้งหมดอยู่ฝั่ง server)
 * token ต้องมีสิทธิ์ Contents: read & write เฉพาะ repo นี้เท่านั้น
 */
export const githubContentEnv = {
  get token() {
    return optionalEnv("GITHUB_CONTENT_TOKEN");
  },
  /** รูปแบบ owner/repo */
  get repo() {
    return optionalEnv("GITHUB_CONTENT_REPO");
  },
  get branch() {
    return optionalEnv("GITHUB_CONTENT_BRANCH") ?? "main";
  },
  /** โฟลเดอร์แอปหน้าบ้านใน repo เช่น apps/storefront */
  get prefix() {
    return optionalEnv("GITHUB_CONTENT_PREFIX") ?? "apps/storefront";
  },
};

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * ค่าที่ไม่บังคับ: ถ้าไม่ได้ตั้งค่า ระบบจะไม่ส่ง LINE จริง (ดู notifications/index.ts)
 * ค่าที่เป็นความลับทั้งหมดต้องอยู่ฝั่ง server เท่านั้น
 */
export const optionalServerEnv = {
  get lineChannelAccessToken() {
    return optionalEnv("LINE_CHANNEL_ACCESS_TOKEN");
  },
  get lineChannelSecret() {
    return optionalEnv("LINE_CHANNEL_SECRET");
  },
  get lineGroupId() {
    return optionalEnv("LINE_GROUP_ID");
  },
  get notifyDispatchSecret() {
    return optionalEnv("NOTIFY_DISPATCH_SECRET");
  },
  /** ฐาน URL ของหลังบ้าน ใช้สร้างลิงก์ในข้อความ เช่น https://shop.example.com */
  get appBaseUrl() {
    return optionalEnv("APP_BASE_URL");
  },
  get nodeEnv() {
    return optionalEnv("NODE_ENV");
  },
};
