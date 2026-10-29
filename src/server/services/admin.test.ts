import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestUser, resetDb } from '../../../tests/db'
import { db } from '../db/client'
import { mcpTokens, sessions, users } from '../db/schema'
import { authenticate } from './auth'
import { createMcpToken, revokeMcpToken, verifyMcpToken } from './tokens'
import { setUserDisabled } from './users'

type Actor = { kind: 'user'; id: string; role: 'admin' }

let admin: Actor = { kind: 'user', id: '', role: 'admin' }

describe('mcp tokens', () => {
  beforeEach(async () => {
    await resetDb()
    admin.id = (await db.query.users.findFirst())!.id
  })

  it('defaults canPublish to false and returns the plaintext once', async () => {
    const out = await createMcpToken({ actor: admin, name: 'claude-code', canPublish: false })
    expect(out.token).toMatch(/^[A-Za-z0-9_-]{40,}$/)

    const row = (await db.select().from(mcpTokens))[0]!
    expect(row.canPublish).toBe(false)
    // 库里只有 sha256，明文拿不回来。
    expect(row.tokenHash).not.toBe(out.token)
    expect(row.tokenHash).toHaveLength(64)
  })

  it('verifies a live token and rejects it after revocation', async () => {
    const out = await createMcpToken({ actor: admin, name: 'claude-code', canPublish: true })
    const verified = await verifyMcpToken(out.token)
    expect(verified?.authorId).toBe(admin.id)
    expect(verified?.canPublish).toBe(true)

    await revokeMcpToken(out.id)
    expect(await verifyMcpToken(out.token)).toBeNull()
  })

  it('binds the token to its author', async () => {
    const authorId = await createTestUser({ email: 'author@example.com' })
    const out = await createMcpToken({
      actor: { kind: 'user', id: authorId, role: 'author' },
      name: 'agent',
      canPublish: false,
    })
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
})
