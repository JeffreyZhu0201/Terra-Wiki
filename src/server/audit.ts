import { and, desc, eq } from 'drizzle-orm'
import { db } from './db/client'
import { auditLogs } from './db/schema'
import type { Actor } from './services/posts'

/**
 * 记一条审计日志。谁做的（人还是 Token）、做了什么、对什么做的。
 * MCP 工具和 Server Action 都会调用它——service 层不知道 actor，
 * 所以审计发生在有 actor 的那一层。
 */
export async function recordAudit(input: {
  actor: Actor
  action: string
  target: { type: string; id: string }
  meta?: Record<string, unknown>
}): Promise<void> {
  await db.insert(auditLogs).values({
    actorType: input.actor.kind === 'token' ? 'token' : 'user',
    actorId: input.actor.kind === 'token' ? input.actor.id : input.actor.id,
    action: input.action,
    targetType: input.target.type,
    targetId: input.target.id,
    meta: input.meta ?? {},
  })
}

export type AuditEntry = {
  id: string
  actorType: 'user' | 'token'
  actorId: string
  action: string
  targetType: string
  targetId: string
  meta: Record<string, unknown>
  createdAt: Date
}

/** 审计日志，按时间倒序。可按 action 或 actor 过滤。 */
export async function listAuditLogs(filter?: {
  action?: string
  actorId?: string
  limit?: number
}): Promise<AuditEntry[]> {
  const conditions = []
  if (filter?.action !== undefined) conditions.push(eq(auditLogs.action, filter.action))
  if (filter?.actorId !== undefined) conditions.push(eq(auditLogs.actorId, filter.actorId))

  const rows = await db
    .select()
    .from(auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(filter?.limit ?? 100)

  return rows.map((row) => ({
    id: row.id,
    actorType: row.actorType,
    actorId: row.actorId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    meta: (row.meta ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  }))
}
