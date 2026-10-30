import { asc, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { sessions, users } from '../db/schema'
import { hashPassword } from '../auth/password'
import { DomainError } from '../errors'
import { ensureMemberToken } from './tokens'

export type UserSummary = {
  id: string
  email: string
  name: string
  role: 'admin' | 'author'
  disabledAt: Date | null
  createdAt: Date
}

export async function listUsers(): Promise<UserSummary[]> {
  const rows = await db.select().from(users).orderBy(asc(users.createdAt))
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
  }))
}

export async function createUser(input: {
  email: string
  name: string
  password: string
  role: 'admin' | 'author'
}): Promise<UserSummary> {
  const existing = (await db.select().from(users).where(eq(users.email, input.email)))[0]
  if (existing) throw new DomainError('conflict', '这个邮箱已经被使用', { email: input.email })

  const row = (
    await db
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
        role: input.role,
      })
      .returning()
  )[0]
  if (!row) throw new DomainError('conflict', '成员创建失败')

  // 成员自带一枚 MCP Token，创建即签发。
  await ensureMemberToken({ userId: row.id, name: row.name })

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
  }
}

export async function setUserRole(id: string, role: 'admin' | 'author'): Promise<void> {
  const row = (
    await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id)).returning()
  )[0]
  if (!row) throw new DomainError('not_found', '成员不存在', { id })
}

/**
 * 停用 / 启用成员。停用会同时清掉该成员的所有会话——
 * 否则已经登录的浏览器还能继续用，这是"停用"最常见的漏洞。
 */
export async function setUserDisabled(id: string, disabled: boolean): Promise<void> {
  const row = (
    await db
      .update(users)
      .set({ disabledAt: disabled ? new Date() : null, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning()
  )[0]
  if (!row) throw new DomainError('not_found', '成员不存在', { id })

  if (disabled) {
    await db.delete(sessions).where(eq(sessions.userId, id))
  }
}
