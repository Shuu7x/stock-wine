import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { env } from '@/lib/env'

export const supabase = createClient<Database>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY,
)

/** ใช้สมัครผู้ใช้ใหม่จากหน้าตั้งค่า — ไม่เก็บ/ไม่ต่ออายุ session จึงไม่ทับการ login ของผู้ดูแลที่ใช้อยู่ */
export function signupClient() {
  return createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'stock-wine-signup' },
  })
}
