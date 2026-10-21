import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

/**
 * Supabase client สำหรับจัดการ session ของ admin ผ่าน cookie
 * ใช้ได้ใน Server Component, Server Action และ Route Handler
 */
export async function createSupabaseAuthClient() {
  const cookieStore = await cookies();

  return createServerClient(serverEnv.supabaseUrl, serverEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // เรียกจาก Server Component ไม่สามารถเขียน cookie ได้ (ไม่เป็นไร เพราะ session จะถูก refresh ใน Server Action)
        }
      },
    },
  });
}
