import { describe, expect, it, beforeEach } from 'vitest'
import { resetDb } from '../../../tests/db'
import { getViewCount, trackView } from './views'

async function createTestPost(): Promise<string> {
  const { db } = await import('../db/client')
  const { createCategory } = await import('../services/categories')
  const { createPost } = await import('../services/posts')
  const admin: { kind: 'user'; id: string; role: 'admin' } = {
    kind: 'user',
    id: (await db.query.users.findFirst())!.id,
    role: 'admin',
  }
  const cat = await createCategory({ parentId: null, slug: 'guide', name: '指南' })
  const post = await createPost({ actor: admin, categoryId: cat.id, title: 'A', bodyMd: 'x' })
  return post.id
}

describe('views', () => {
  beforeEach(async () => { await resetDb() })

  it('counts the same visitor once per day', async () => {
    const postId = await createTestPost()
    expect(await trackView({ postId, vid: 'visitor-a' })).toBe(true)
    expect(await trackView({ postId, vid: 'visitor-a' })).toBe(false)
    expect(await trackView({ postId, vid: 'visitor-b' })).toBe(true)
    expect(await getViewCount(postId)).toBe(2)
  })

  it('stores a hash, not the raw visitor id', async () => {
    const { db } = await import('../db/client')
    const { postViewVisitors } = await import('../db/schema')
    const postId = await createTestPost()
    await trackView({ postId, vid: 'raw-uuid-value' })
    const rows = await db.select().from(postViewVisitors)
    expect(rows[0]?.vidHash).not.toBe('raw-uuid-value')
    expect(rows[0]?.vidHash).toHaveLength(64)
  })
})
