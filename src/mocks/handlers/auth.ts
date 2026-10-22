import { http, HttpResponse } from 'msw/http'
import { db, MOCK_USER, mockUserId, persist } from '@/mocks/db'
import { auth } from '@/mocks/postgrest'

// โหมด mock: login ด้วยอีเมลอะไรก็ได้ รหัสผ่าน "password"
function user(email: string) {
  return {
    id: mockUserId(email),
    aud: 'authenticated',
    role: 'authenticated',
    email,
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  }
}

function session(email: string) {
  const expires_in = 3600
  return {
    access_token: `mock-access-${btoa(email)}`,
    token_type: 'bearer',
    expires_in,
    expires_at: Math.floor(Date.now() / 1000) + expires_in,
    refresh_token: `mock-refresh-${btoa(email)}`,
    user: user(email),
  }
}

export const authHandlers = [
  // สมัครผู้ใช้ (หน้าตั้งค่า › ผู้ใช้งาน) — สร้าง profile เป็น viewer เหมือน trigger handle_new_user
  http.post(auth('signup'), async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string; data?: { name?: string } }
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email)) return HttpResponse.json({ code: 400, error_code: 'validation_failed', msg: 'Unable to validate email address: invalid format' }, { status: 400 })
    if ((body.password ?? '').length < 8) return HttpResponse.json({ code: 422, error_code: 'weak_password', msg: 'Password should be at least 8 characters.' }, { status: 422 })
    if (db.profiles.some((p) => p.email?.toLowerCase() === email)) {
      return HttpResponse.json({ code: 422, error_code: 'user_already_exists', msg: 'User already registered' }, { status: 422 })
    }
    const t = new Date().toISOString()
    db.profiles.push({ user_id: mockUserId(email), email, display_name: body.data?.name?.trim() || null, role_key: 'viewer', is_active: true, created_at: t, updated_at: t })
    persist()
    // ไม่ต้องยืนยันอีเมลในโหมดทดลอง แต่ไม่คืน session (เหมือนสมัครให้คนอื่น)
    return HttpResponse.json({ user: user(email), session: null })
  }),
  http.post(auth('token'), async ({ request }) => {
    const grant = new URL(request.url).searchParams.get('grant_type')
    const body = (await request.json()) as Record<string, string>
    if (grant === 'refresh_token') {
      const email = atob(String(body.refresh_token ?? '').replace('mock-refresh-', '')) || MOCK_USER.email
      return HttpResponse.json(session(email))
    }
    if (body.password !== 'password') {
      return HttpResponse.json(
        { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
        { status: 400 },
      )
    }
    return HttpResponse.json(session(body.email))
  }),
  http.get(auth('user'), ({ request }) => {
    const token = request.headers.get('authorization')?.replace('Bearer mock-access-', '')
    if (!token) return HttpResponse.json({ msg: 'unauthorized' }, { status: 401 })
    return HttpResponse.json(user(atob(token)))
  }),
  // เปลี่ยนรหัสผ่าน (mock ไม่ได้เก็บจริง login ยังใช้ "password")
  http.put(auth('user'), async ({ request }) => {
    const token = request.headers.get('authorization')?.replace('Bearer mock-access-', '')
    if (!token) return HttpResponse.json({ msg: 'unauthorized' }, { status: 401 })
    const body = (await request.json()) as { password?: string }
    if (body.password && body.password.length < 8) {
      return HttpResponse.json({ code: 422, error_code: 'weak_password', msg: 'Password should be at least 8 characters.' }, { status: 422 })
    }
    return HttpResponse.json(user(atob(token)))
  }),
  http.post(auth('logout'), () => new HttpResponse(null, { status: 204 })),
]
