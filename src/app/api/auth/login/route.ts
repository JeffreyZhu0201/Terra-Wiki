import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSession, setSessionCookie } from '@/server/auth/session'
import { authenticate, bootstrapAdmin } from '@/server/services/auth'

const credentials = z.object({
  email: z.string().min(1, '请填写邮箱'),
  password: z.string().min(1, '请填写密码'),
})

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null)
  const parsed = credentials.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: '请填写邮箱和密码' }, { status: 400 })
  }

  // 首次登录时建初始管理员——不要求用户先访问过 /login。
  await bootstrapAdmin()

  const user = await authenticate(parsed.data.email, parsed.data.password)
  if (!user) {
    return NextResponse.json({ ok: false, message: '邮箱或密码不正确' }, { status: 401 })
  }

  const { token, expiresAt } = await createSession(user.id)
  await setSessionCookie(token, expiresAt)
  return NextResponse.json({ ok: true })
}
