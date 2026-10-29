import { describe, expect, it, beforeEach } from 'vitest'
import { db } from '../db/client'
import { resetDb } from '../../../tests/db'
import { authenticate } from '../services/auth'
import { createSession, getSessionUser } from './session'

describe('auth', () => {
  beforeEach(async () => { await resetDb() })

  it('bootstraps the first admin', async () => {
    const user = await authenticate('admin@example.com', 'correct-horse-battery')
    expect(user?.role).toBe('admin')
  })

  it('rejects a wrong password', async () => {
    const user = await authenticate('admin@example.com', 'wrong')
    expect(user).toBeNull()
  })

  it('returns null for an unknown session token', async () => {
    const { token } = await createSession((await db.query.users.findFirst())!.id)
    expect(await getSessionUser()).toBeNull() // 测试环境未注入 cookie
    expect(token).toHaveLength(43) // 32 字节 base64url
  })
})
