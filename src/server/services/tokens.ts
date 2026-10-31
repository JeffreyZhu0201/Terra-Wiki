import { randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/client'
import { mcpTokens, users } from '../db/schema'
import { DomainError } from '../errors'

/**
 * 每个成员自带一枚 Token，明文入库——团队页要能随时复制，
 * 存哈希就拿不回来了。密级由 canPublish 与成员停用状态控制。
 */
export type MemberToken = {
  id: string
  name: string
  token: string
  canPublish: boolean
  lastUsedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

export type VerifiedMcpToken = {
  id: string
  authorId: string
  role: 'admin' | 'author'
  canPublish: boolean
}

function newTokenValue(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * 取成员自带的 Token；还没有就发一枚。每个成员恒只有一枚。
 */
export async function ensureMemberToken(input: {
  userId: string
  name: string
}): Promise<MemberToken> {
  const existing = (
    await db.select().from(mcpTokens).where(eq(mcpTokens.authorId, input.userId))
  )[0]
  if (existing) return existing

  const row = (
    await db
      .insert(mcpTokens)
      .values({
        name: input.name,
        token: newTokenValue(),
        authorId: input.userId,
      })
      .onConflictDoNothing()
      .returning()
  )[0]
  // 并发下另一路刚插入成功，再读一次。
  if (row) return row
  const raced = (
    await db.select().from(mcpTokens).where(eq(mcpTokens.authorId, input.userId))
  )[0]
  if (!raced) throw new DomainError('conflict', 'Token 创建失败')
  return raced
}

export async function listMemberTokens(): Promise<Map<string, MemberToken>> {
  const rows = await db.select().from(mcpTokens)
  return new Map(rows.map((row) => [row.authorId, row]))
}

export async function revokeMcpToken(id: string): Promise<void> {
  const row = (
    await db.update(mcpTokens).set({ revokedAt: new Date() }).where(eq(mcpTokens.id, id)).returning()
  )[0]
  if (!row) throw new DomainError('not_found', 'Token 不存在', { id })
}

/**
 * 校验 Token。**吊销后即使明文对也必须失效**——
 * 所以这里查的是 revokedAt IS NULL，而不是查完再判断。
 *
 * 归属成员被停用时同样不认：网页端停用会清掉所有会话，
 * 但 Token 是独立于会话的一条通道，停用成员后它必须跟着失效。
 * 与 getSessionUser 对停用成员的口径一致（读时过滤，不删行——
 * 重新启用后 Token 自然恢复）。
 */
export async function verifyMcpToken(token: string): Promise<VerifiedMcpToken | null> {
  const row = (
    await db
      .select({
        id: mcpTokens.id,
        authorId: mcpTokens.authorId,
        role: users.role,
        canPublish: mcpTokens.canPublish,
      })
      .from(mcpTokens)
      .innerJoin(users, eq(mcpTokens.authorId, users.id))
      .where(and(eq(mcpTokens.token, token), isNull(mcpTokens.revokedAt), isNull(users.disabledAt)))
  )[0]
  if (!row) return null

  return {
    id: row.id,
    authorId: row.authorId,
    role: row.role,
    canPublish: row.canPublish,
  }
}

/** 改 Token 的发布权限。默认 false——Agent 只能写草稿。 */
export async function setTokenCanPublish(authorId: string, canPublish: boolean): Promise<void> {
  const row = (
    await db
      .update(mcpTokens)
      .set({ canPublish })
      .where(eq(mcpTokens.authorId, authorId))
      .returning()
  )[0]
  if (!row) throw new DomainError('not_found', 'Token 不存在', { authorId })
}

export async function touchMcpToken(id: string): Promise<void> {
  await db.update(mcpTokens).set({ lastUsedAt: new Date() }).where(eq(mcpTokens.id, id))
}
