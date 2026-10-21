import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Supabase client ที่ใช้ service role key
 * - ข้าม Row Level Security ได้ จึงใช้เฉพาะในโค้ด server (services/*) เท่านั้น
 * - ห้าม import ไฟล์นี้จาก Client Component
 */
export function createSupabaseServiceClient() {
  return createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
