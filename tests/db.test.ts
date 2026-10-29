import { describe, expect, it } from 'vitest'
import { resetDb } from './db'
import { db } from '../src/server/db/client'
import { users } from '../src/server/db/schema'

describe('test harness', () => {
  it('resetDb truncates and reseeds', async () => {
    await resetDb()
    const rows = await db.select().from(users)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.role).toBe('admin')
  })
})
