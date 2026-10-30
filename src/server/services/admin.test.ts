import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestUser, resetDb } from '../../../tests/db'
import { db } from '../db/client'
import { mcpTokens, sessions, users } from '../db/schema'
import { authenticate } from './auth'
import { ensureMemberToken, revokeMcpToken, verifyMcpToken } from './tokens'
import { setUserDisabled } from './users'

type Actor = { kind: 'user'; id: string; role: 'admin' }

let admin: Actor = { kind: 'user', id: '', role: 'admin' }

describe('mcp tokens', () => {
  beforeEach(async () => {
    await resetDb()
    admin.id = (await db.query.users.findFirst())!.id
  })

  it('provisions one plaintext token per member, idempotently', async () => {
    const first = await ensureMemberToken({ userId: admin.id, name: 'claude-code' })
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{40,}$/)

    // 明文入库，团队页要能随时复制。
    const row = (await db.select().from(mcpTokens))[0]!
    expect(row.canPublish).toBe(false)
    expect(row.token).toBe(first.token)

    // 再取还是同一枚——成员自带，不重复签发。
    const again = await ensureMemberToken({ userId: admin.id, name: 'claude-code' })
    expect(again.token).toBe(first.token)
    expect(again.id).toBe(first.id)
  })

  it('verifies a live token and rejects it after revocation', async () => {
    const out = await ensureMemberToken({ userId: admin.id, name: 'claude-code' })
    await db.update(mcpTokens).set({ canPublish: true }).where(eq(mcpTokens.id, out.id))
    const verified = await verifyMcpToken(out.token)
    expect(verified?.authorId).toBe(admin.id)
    expect(verified?.canPublish).toBe(true)

    await revokeMcpToken(out.id)
    expect(await verifyMcpToken(out.token)).toBeNull()
  })

  it('binds the token to its author', async () => {
    const authorId = await createTestUser({ email: 'author@example.com' })
    const out = await ensureMemberToken({ userId: authorId, name: 'agent' })
    const verified = await verifyMcpToken(out.token)
    expect(verified?.authorId).toBe(authorId)
    expect(verified?.role).toBe('author')
  })
})

describe('member suspension', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('blocks login and drops existing sessions', async () => {
    const authorId = await createTestUser({ email: 'author@example.com' })
    const { createSession } = await import('../auth/session')
    await createSession(authorId)
    expect((await db.select().from(sessions)).length).toBe(1)

    await setUserDisabled(authorId, true)

    expect(await authenticate('author@example.com', 'correct-horse-battery')).toBeNull()
    // 停用即刻踢掉已登录的浏览器。
    expect((await db.select().from(sessions)).length).toBe(0)
  })

  it('can be re-enabled', async () => {
    const authorId = await createTestUser({ email: 'author@example.com' })
    await setUserDisabled(authorId, true)
    await setUserDisabled(authorId, false)

    expect(await authenticate('author@example.com', 'correct-horse-battery')).not.toBeNull()
    const row = (await db.select().from(users).where(eq(users.id, authorId)))[0]!
    expect(row.disabledAt).toBeNull()
  })

  it('suspends the mcp tokens of a disabled member', async () => {
    const authorId = await createTestUser({ email: 'author@example.com' })
    const out = await ensureMemberToken({ userId: authorId, name: 'agent' })
    await db.update(mcpTokens).set({ canPublish: true }).where(eq(mcpTokens.id, out.id))
    expect(await verifyMcpToken(out.token)).not.toBeNull()

    await setUserDisabled(authorId, true)

    // Token 是独立于会话的一条通道——停用成员后它必须跟着失效。
    expect(await verifyMcpToken(out.token)).toBeNull()

    // 重新启用后恢复。
    await setUserDisabled(authorId, false)
    expect(await verifyMcpToken(out.token)).not.toBeNull()
  })
})
