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
