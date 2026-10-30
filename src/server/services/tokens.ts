import { randomBytes } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../db/client'
import { mcpTokens, users } from '../db/schema'
import { sha256 } from '../crypto'
import { DomainError } from '../errors'
import { actorUserId, type Actor } from './posts'

export type McpTokenInfo = {
  id: string
  name: string
  authorId: string
  authorName: string
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

/**
 * 签发一个 Token。明文只在这一次返回，库里只存 sha256。
 */
export async function createMcpToken(input: {
  actor: Actor
  name: string
  canPublish: boolean
}): Promise<{ id: string; token: string }> {
  const token = randomBytes(32).toString('base64url')

  const row = (
    await db
      .insert(mcpTokens)
      .values({
        name: input.name,
        tokenHash: sha256(token),
        authorId: actorUserId(input.actor),
        canPublish: input.canPublish,
      })
      .returning()
  )[0]
  if (!row) throw new DomainError('conflict', 'Token 创建失败')

  return { id: row.id, token }
}

export async function listMcpTokens(): Promise<McpTokenInfo[]> {
  const rows = await db
    .select({
      id: mcpTokens.id,
      name: mcpTokens.name,
      authorId: mcpTokens.authorId,
      authorName: users.name,
      canPublish: mcpTokens.canPublish,
      lastUsedAt: mcpTokens.lastUsedAt,
      revokedAt: mcpTokens.revokedAt,
      createdAt: mcpTokens.createdAt,
    })
    .from(mcpTokens)
    .innerJoin(users, eq(mcpTokens.authorId, users.id))
    .orderBy(desc(mcpTokens.createdAt))

  return rows
}

export async function revokeMcpToken(id: string): Promise<void> {
  const row = (
    await db.update(mcpTokens).set({ revokedAt: new Date() }).where(eq(mcpTokens.id, id)).returning()
  )[0]
  if (!row) throw new DomainError('not_found', 'Token 不存在', { id })
}

/**
 * 校验 Token。**吊销后即使哈希对也必须失效**——
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
      .where(
        and(
          eq(mcpTokens.tokenHash, sha256(token)),
          isNull(mcpTokens.revokedAt),
          isNull(users.disabledAt),
        ),
      )
  )[0]
  if (!row) return null

  return {
    id: row.id,
    authorId: row.authorId,
    role: row.role,
    canPublish: row.canPublish,
  }
}

export async function touchMcpToken(id: string): Promise<void> {
  await db.update(mcpTokens).set({ lastUsedAt: new Date() }).where(eq(mcpTokens.id, id))
}
