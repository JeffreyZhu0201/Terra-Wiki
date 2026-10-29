import { randomBytes } from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '../db/client'
import { sessions, users } from '../db/schema'
import { sha256 } from '../crypto'
import { SESSION_COOKIE } from './constants'

export { SESSION_COOKIE }

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type SessionUser = {
  id: string
  email: string
  name: string
  role: 'admin' | 'author'
}

/**
 * 读取会话 cookie。不在请求上下文里时（例如单元测试）返回 null——
 * 没有请求就没有会话，这是安全的一侧。
 */
async function readSessionToken(): Promise<string | null> {
  try {
    const store = await cookies()
    return store.get(SESSION_COOKIE)?.value ?? null
  } catch {
    return null
  }
}

/** 建一条会话，返回明文 token。**不写 cookie**——调用方决定何时下发。 */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.insert(sessions).values({ userId, tokenHash: sha256(token), expiresAt })
  return { token, expiresAt }
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

/** 当前登录用户。没有会话、token 过期或已吊销时返回 null，不抛错。 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = await readSessionToken()
  if (!token) return null

  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, sha256(token)),
        gt(sessions.expiresAt, new Date()),
        isNull(users.disabledAt),
      ),
    )

  const row = rows[0]
  if (!row) return null
  return { id: row.id, email: row.email, name: row.name, role: row.role }
}

/** 要求登录，未登录跳转到登录页。 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return user
}

/** 注销：删掉会话记录并清 cookie。 */
export async function destroySession(): Promise<void> {
  const token = await readSessionToken()
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)))
  }
  await clearSessionCookie()
}
