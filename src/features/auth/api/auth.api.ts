import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { queryClient } from '@/lib/query-client'
import { supabase } from '@/lib/supabase'

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(error.message === 'Invalid login credentials' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : error.message)
  }
  // ทิ้งแคชที่อาจดึงมาตอนยังไม่ได้ล็อกอิน (RLS ตอบเป็นค่าว่าง) ให้ทุกหน้าโหลดใหม่ด้วยสิทธิ์ของผู้ใช้นี้
  queryClient.clear()
}

export async function signOut() {
  await supabase.auth.signOut()
}

export function useSessionEmail() {
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => {
    getSession().then((s) => setEmail(s?.user.email ?? null))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setEmail(s?.user.email ?? null))
    return () => data.subscription.unsubscribe()
  }, [])
  return email
}
